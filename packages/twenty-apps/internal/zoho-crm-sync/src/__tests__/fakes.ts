import { randomUUID } from 'crypto';

import type { TwentyApi, ZohoApi } from 'src/sync/engine';
import type {
  FieldToCreate,
  TwentyFieldMetadata,
  TwentyObjectName,
  TwentyOption,
  ZohoFieldMetadata,
} from 'src/sync/fields/schema-plan';
import type {
  TwentyCompany,
  TwentyOpportunity,
  TwentyPerson,
} from 'src/sync/mapping';
import type { KeyValueStore } from 'src/sync/state';
import { MUTATION_BATCH_SIZE, TwentyApiError } from 'src/twenty/gateway';
import type { TwentyMetadataApi } from 'src/twenty/metadata';
import { ZohoError, type ZohoWriteResult } from 'src/zoho/client';

// In-memory stand-ins for Zoho and Twenty, close enough to the real APIs for
// the sync rules: timestamps move on every write, filters behave the same.

export class Clock {
  constructor(public current = Date.parse('2026-10-17T08:00:00Z')) {}

  now = () => this.current;

  tick(ms = 1000) {
    this.current += ms;

    return this.current;
  }

  iso() {
    return new Date(this.current).toISOString();
  }
}

export const memoryStore = (): KeyValueStore & {
  data: Map<string, unknown>;
} => {
  const data = new Map<string, unknown>();

  return {
    data,
    get: async <T>(key: string) =>
      data.has(key) ? (structuredClone(data.get(key)) as T) : null,
    set: async (key, value) => {
      data.set(key, structuredClone(value));
    },
    delete: async (key) => data.delete(key),
  };
};

type ZohoRecord = Record<string, any> & { id: string; Modified_Time: string };

const zohoTime = (ms: number) =>
  `${new Date(ms).toISOString().slice(0, 19)}+00:00`;

type ZohoModuleName = 'Accounts' | 'Contacts' | 'Deals';

export class FakeZoho implements ZohoApi {
  modules: Record<string, Map<string, ZohoRecord>> = {
    Accounts: new Map(),
    Contacts: new Map(),
    Deals: new Map(),
  };
  fields: Record<string, ZohoFieldMetadata[]> = {
    Accounts: [],
    Contacts: [],
    Deals: [],
  };
  currency: string | null = 'AED';
  // Modules the connection has no scope for; "settings" for the field lists.
  missingScopes = new Set<string>();
  writes: {
    module: string;
    kind: 'update' | 'upsert' | 'insert';
    records: Record<string, unknown>[];
  }[] = [];
  private nextId = 1000;

  constructor(private readonly clock: Clock) {}

  add(
    module: ZohoModuleName,
    record: Record<string, any>,
  ): ZohoRecord {
    const id = record.id ?? String(this.nextId++);
    const stored: ZohoRecord = {
      ...record,
      id,
      Modified_Time: zohoTime(this.clock.tick()),
    };

    this.modules[module].set(id, stored);

    return stored;
  }

  edit(
    module: ZohoModuleName,
    id: string,
    changes: Record<string, any>,
  ) {
    const record = this.modules[module].get(id)!;

    Object.assign(record, changes, {
      Modified_Time: zohoTime(this.clock.tick()),
    });
  }

  private checkScope(module: string) {
    if (this.missingScopes.has(module)) {
      throw new ZohoError(
        'the connection lacks the scope it needs',
        401,
        'OAUTH_SCOPE_MISMATCH',
      );
    }
  }

  async listFields(module: string): Promise<ZohoFieldMetadata[]> {
    this.checkScope('settings');
    this.checkScope(module);

    return structuredClone(this.fields[module] ?? []);
  }

  async organizationCurrency(): Promise<string | null> {
    return this.currency;
  }

  async listModified<T>(
    module: string,
    _fields: string[],
    { since, page }: { since: string | null; page: number },
  ): Promise<{ records: T[]; moreRecords: boolean }> {
    this.checkScope(module);
    const sinceMs = since ? Date.parse(since) : -Infinity;
    const all = [...this.modules[module].values()]
      .filter((record) => Date.parse(record.Modified_Time) >= sinceMs)
      .sort(
        (a, b) =>
          Date.parse(a.Modified_Time) - Date.parse(b.Modified_Time) ||
          a.id.localeCompare(b.id),
      );
    const start = (page - 1) * 200;

    return {
      records: structuredClone(all.slice(start, start + 200)) as T[],
      moreRecords: all.length > start + 200,
    };
  }

  async getByIds<T>(module: string, ids: string[]): Promise<T[]> {
    return ids
      .map((id) => this.modules[module].get(id))
      .filter(Boolean)
      .map((record) => structuredClone(record)) as T[];
  }

  async update(
    module: string,
    records: Record<string, unknown>[],
  ): Promise<ZohoWriteResult[]> {
    this.writes.push({
      module,
      kind: 'update',
      records: structuredClone(records),
    });

    return records.map((record) => {
      const existing = this.modules[module].get(record.id as string);

      if (!existing) {
        return {
          ok: false,
          id: null,
          action: null,
          code: 'INVALID_DATA',
          message: 'the id given seems to be invalid',
        };
      }
      this.edit(module as 'Accounts', existing.id, {
        ...record,
        id: existing.id,
      });

      return {
        ok: true,
        id: existing.id,
        action: 'update',
        code: 'SUCCESS',
        message: 'record updated',
      };
    });
  }

  async insert(
    module: string,
    records: Record<string, unknown>[],
  ): Promise<ZohoWriteResult[]> {
    this.writes.push({
      module,
      kind: 'insert',
      records: structuredClone(records),
    });

    return records.map((record) => {
      if (module === 'Deals' && (!record.Deal_Name || !record.Stage)) {
        return {
          ok: false,
          id: null,
          action: null,
          code: 'MANDATORY_NOT_FOUND',
          message: 'required field not found',
        };
      }

      const created = this.add(module as ZohoModuleName, record);

      return {
        ok: true,
        id: created.id,
        action: 'insert',
        code: 'SUCCESS',
        message: 'record added',
      };
    });
  }

  async upsert(
    module: string,
    records: Record<string, unknown>[],
    duplicateCheckFields: string[],
  ): Promise<ZohoWriteResult[]> {
    this.writes.push({
      module,
      kind: 'upsert',
      records: structuredClone(records),
    });

    return records.map((record) => {
      if (module === 'Contacts' && !record.Last_Name) {
        return {
          ok: false,
          id: null,
          action: null,
          code: 'MANDATORY_NOT_FOUND',
          message: 'required field not found',
        };
      }

      const field = duplicateCheckFields[0];
      const duplicate = [...this.modules[module].values()].find(
        (existing) =>
          record[field] &&
          String(existing[field] ?? '').toLowerCase() ===
            String(record[field]).toLowerCase(),
      );

      if (duplicate) {
        this.edit(module as 'Accounts', duplicate.id, record);

        return {
          ok: true,
          id: duplicate.id,
          action: 'update',
          code: 'SUCCESS',
          message: 'record updated',
        };
      }

      const created = this.add(module as 'Accounts', record);

      return {
        ok: true,
        id: created.id,
        action: 'insert',
        code: 'SUCCESS',
        message: 'record added',
      };
    });
  }
}

type Stored<T> = T & { updatedAt: string; deletedAt: string | null };

let uuidCounter = 0;
const uuid = () =>
  `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, '0')}`;

const merge = (target: any, data: Record<string, unknown>) => {
  for (const [key, value] of Object.entries(data)) {
    target[key] = structuredClone(value);
  }
};

export const rateLimitError = () =>
  new TwentyApiError(
    'Rate limit exceeded for application: 500 requests per 60s.',
    ['RATE_LIMITED'],
  );

type WriteKind =
  | 'createPeople'
  | 'updatePeople'
  | 'createCompanies'
  | 'updateCompanies'
  | 'createOpportunities'
  | 'updateOpportunities';

export class FakeTwenty implements TwentyApi {
  people = new Map<string, Stored<TwentyPerson>>();
  companies = new Map<string, Stored<TwentyCompany>>();
  opportunities = new Map<string, Stored<TwentyOpportunity>>();
  members: { id: string; userEmail: string }[] = [];
  industries: string[] | null = null;
  rejectPhone: (data: Record<string, unknown>) => boolean = () => false;
  // Like the real gateway, a write is sent in batches: earlier batches stay
  // saved when a later one is refused.
  refuseWrite: (
    kind: WriteKind,
    batch: Record<string, unknown>[],
  ) => Error | null = () => null;
  writeRequests = 0;

  constructor(private readonly clock: Clock) {}

  addCompany(
    data: Partial<TwentyCompany> & { source?: string },
    updatedAt?: string,
  ): Stored<TwentyCompany> {
    const { source, ...rest } = data;
    const company = {
      id: uuid(),
      name: '',
      domainName: {
        primaryLinkUrl: '',
        primaryLinkLabel: '',
        secondaryLinks: [],
      },
      address: {
        addressStreet1: '',
        addressStreet2: '',
        addressCity: '',
        addressState: '',
        addressPostcode: '',
        addressCountry: '',
      },
      accountOwnerId: null,
      zohoAccountId: '',
      zohoSyncHash: '',
      zohoSyncedAt: null,
      createdBy: { source: source ?? 'MANUAL' },
      ...rest,
      updatedAt: updatedAt ?? new Date(this.clock.tick()).toISOString(),
      deletedAt: null,
    } as Stored<TwentyCompany>;

    this.companies.set(company.id, company);

    return company;
  }

  addPerson(
    data: Partial<TwentyPerson> & { source?: string },
    updatedAt?: string,
  ): Stored<TwentyPerson> {
    const { source, ...rest } = data;
    const person = {
      id: uuid(),
      name: { firstName: '', lastName: '' },
      emails: { primaryEmail: '', additionalEmails: [] },
      phones: {
        primaryPhoneNumber: '',
        primaryPhoneCallingCode: '',
        primaryPhoneCountryCode: '',
        additionalPhones: [],
      },
      jobTitle: '',
      companyId: null,
      zohoContactId: '',
      zohoSyncHash: '',
      zohoSyncedAt: null,
      createdBy: { source: source ?? 'MANUAL' },
      ...rest,
      updatedAt: updatedAt ?? new Date(this.clock.tick()).toISOString(),
      deletedAt: null,
    } as Stored<TwentyPerson>;

    this.people.set(person.id, person);

    return person;
  }

  addOpportunity(
    data: Partial<TwentyOpportunity> & Record<string, unknown>,
  ): Stored<TwentyOpportunity> {
    const opportunity = {
      id: uuid(),
      name: '',
      amount: { amountMicros: null, currencyCode: 'USD' },
      closeDate: null,
      stage: 'NEW',
      companyId: null,
      pointOfContactId: null,
      ownerId: null,
      zohoDealId: '',
      zohoFieldState: '',
      zohoSyncedAt: null,
      createdBy: { source: 'MANUAL' },
      ...data,
      updatedAt: new Date(this.clock.tick()).toISOString(),
      deletedAt: null,
    } as Stored<TwentyOpportunity>;

    this.opportunities.set(opportunity.id, opportunity);

    return opportunity;
  }

  editOpportunity(id: string, data: Record<string, unknown>) {
    const opportunity = this.opportunities.get(id)!;

    merge(opportunity, data);
    opportunity.updatedAt = new Date(this.clock.tick()).toISOString();
  }

  useFields() {}

  editPerson(id: string, data: Record<string, unknown>) {
    const person = this.people.get(id)!;

    merge(person, data);
    person.updatedAt = new Date(this.clock.tick()).toISOString();
  }

  editCompany(id: string, data: Record<string, unknown>) {
    const company = this.companies.get(id)!;

    merge(company, data);
    company.updatedAt = new Date(this.clock.tick()).toISOString();
  }

  private withCompany(person: Stored<TwentyPerson>): TwentyPerson {
    const company = person.companyId
      ? this.companies.get(person.companyId)
      : undefined;

    return structuredClone({
      ...person,
      company: company
        ? { id: company.id, zohoAccountId: company.zohoAccountId }
        : null,
    });
  }

  private withRelations(
    opportunity: Stored<TwentyOpportunity>,
  ): TwentyOpportunity {
    const company = opportunity.companyId
      ? this.companies.get(opportunity.companyId)
      : undefined;
    const person = opportunity.pointOfContactId
      ? this.people.get(opportunity.pointOfContactId)
      : undefined;

    return structuredClone({
      ...opportunity,
      company: company
        ? { id: company.id, zohoAccountId: company.zohoAccountId }
        : null,
      pointOfContact: person
        ? { id: person.id, zohoContactId: person.zohoContactId }
        : null,
    });
  }

  private live<T extends { deletedAt: string | null }>(
    records: Iterable<T>,
  ): T[] {
    return [...records].filter((record) => !record.deletedAt);
  }

  async findPeopleByZohoIds(ids: string[]) {
    return [...this.people.values()]
      .filter(
        (person) => person.zohoContactId && ids.includes(person.zohoContactId),
      )
      .map((person) => this.withCompany(person));
  }

  async findPeopleByEmails(emails: string[]) {
    return this.live(this.people.values())
      .filter((person) => emails.includes(person.emails?.primaryEmail ?? ''))
      .map((person) => this.withCompany(person));
  }

  async findPeopleByCompanyIds(ids: string[]) {
    return this.live(this.people.values())
      .filter((person) => person.companyId && ids.includes(person.companyId))
      .map((person) => this.withCompany(person));
  }

  async findPeopleByIds(ids: string[]) {
    return this.live(this.people.values())
      .filter((person) => ids.includes(person.id))
      .map((person) => this.withCompany(person));
  }

  async findOpportunitiesByZohoIds(ids: string[]) {
    return [...this.opportunities.values()]
      .filter(
        (opportunity) =>
          opportunity.zohoDealId && ids.includes(opportunity.zohoDealId),
      )
      .map((opportunity) => this.withRelations(opportunity));
  }

  async findCompaniesByZohoIds(ids: string[]) {
    return [...this.companies.values()]
      .filter(
        (company) =>
          company.zohoAccountId && ids.includes(company.zohoAccountId),
      )
      .map((company) => structuredClone(company));
  }

  async findCompaniesByIds(ids: string[]) {
    return this.live(this.companies.values())
      .filter((company) => ids.includes(company.id))
      .map((company) => structuredClone(company));
  }

  async listUnlinkedCompanies() {
    return this.live(this.companies.values())
      .filter((company) => !company.zohoAccountId)
      .map((company) => structuredClone(company));
  }

  async listWorkspaceMembers() {
    return this.members;
  }

  async companyIndustryValues() {
    return this.industries;
  }

  private collectionValues(
    collection: 'people' | 'companies' | 'opportunities',
  ): Iterable<any> {
    return collection === 'people'
      ? this.people.values()
      : collection === 'companies'
        ? this.companies.values()
        : this.opportunities.values();
  }

  private present(
    collection: 'people' | 'companies' | 'opportunities',
    record: any,
  ) {
    return collection === 'people'
      ? this.withCompany(record)
      : collection === 'opportunities'
        ? this.withRelations(record)
        : structuredClone(record);
  }

  async pageUpdatedSince<T>(
    collection: 'people' | 'companies' | 'opportunities',
    since: string,
    after: string | null,
    first = 100,
  ) {
    const records = this.live<any>(this.collectionValues(collection))
      .filter((record) => Date.parse(record.updatedAt) > Date.parse(since))
      .sort(
        (a, b) =>
          Date.parse(a.updatedAt) - Date.parse(b.updatedAt) ||
          a.id.localeCompare(b.id),
      );
    const start = after
      ? records.findIndex(
          (record) => `${record.updatedAt}|${record.id}` === after,
        ) + 1
      : 0;
    const page = records.slice(start, start + first);
    const last = page[page.length - 1];

    return {
      records: page.map((record) => this.present(collection, record)) as T[],
      endCursor: last ? `${last.updatedAt}|${last.id}` : null,
      hasNextPage: records.length > start + first,
    };
  }

  async pageUnlinked<T>(
    collection: 'people' | 'companies' | 'opportunities',
    after: string | null,
    first = 100,
  ) {
    const field =
      collection === 'people'
        ? 'zohoContactId'
        : collection === 'companies'
          ? 'zohoAccountId'
          : 'zohoDealId';
    const records = this.live<any>(this.collectionValues(collection))
      .filter((record) => !record[field])
      .sort((a, b) => a.id.localeCompare(b.id))
      .filter((record) => !after || record.id > after);
    const page = records.slice(0, first);

    return {
      records: page.map((record) => this.present(collection, record)) as T[],
      endCursor: page[page.length - 1]?.id ?? null,
      hasNextPage: records.length > first,
    };
  }

  private async inBatches<T>(
    kind: WriteKind,
    data: Record<string, unknown>[],
    writeBatch: (batch: Record<string, unknown>[]) => T[],
  ): Promise<T[]> {
    const written: T[] = [];

    for (let index = 0; index < data.length; index += MUTATION_BATCH_SIZE) {
      const batch = data.slice(index, index + MUTATION_BATCH_SIZE);
      const refusal = this.refuseWrite(kind, batch);

      this.writeRequests += 1;
      if (refusal) {
        throw refusal;
      }
      written.push(...writeBatch(batch));
    }

    return written;
  }

  private writePeople(
    kind: WriteKind,
    data: Record<string, unknown>[],
    upsert: boolean,
  ) {
    return this.inBatches(kind, data, (batch) =>
      this.writePeopleBatch(batch, upsert),
    );
  }

  private writePeopleBatch(data: Record<string, unknown>[], upsert: boolean) {
    const updatedAt = new Date(this.clock.tick()).toISOString();

    if (data.some((entry) => entry.phones && this.rejectPhone(entry))) {
      throw new TwentyApiError('Provided phone number is invalid', [
        'BAD_USER_INPUT',
        'INVALID_PHONE_NUMBER',
      ]);
    }

    return data.map((entry) => {
      if (upsert) {
        const person = this.people.get(entry.id as string)!;

        merge(person, entry);
        person.updatedAt = updatedAt;

        return this.withCompany(person);
      }

      const person = this.addPerson({}, updatedAt);

      merge(person, entry);
      person.createdBy = { source: 'APPLICATION' };
      person.updatedAt = updatedAt;

      return this.withCompany(person);
    });
  }

  private writeCompanies(
    kind: WriteKind,
    data: Record<string, unknown>[],
    upsert: boolean,
  ) {
    return this.inBatches(kind, data, (batch) =>
      this.writeCompaniesBatch(batch, upsert),
    );
  }

  private writeCompaniesBatch(
    data: Record<string, unknown>[],
    upsert: boolean,
  ) {
    const updatedAt = new Date(this.clock.tick()).toISOString();

    return data.map((entry) => {
      const company = upsert
        ? this.companies.get(entry.id as string)!
        : this.addCompany({ source: 'APPLICATION' }, updatedAt);

      merge(company, entry);
      company.updatedAt = updatedAt;

      return structuredClone(company);
    });
  }

  private writeOpportunities(
    kind: WriteKind,
    data: Record<string, unknown>[],
    upsert: boolean,
  ) {
    return this.inBatches(kind, data, (batch) => {
      const updatedAt = new Date(this.clock.tick()).toISOString();

      return batch.map((entry) => {
        const opportunity = upsert
          ? this.opportunities.get(entry.id as string)!
          : this.addOpportunity({ createdBy: { source: 'APPLICATION' } });

        merge(opportunity, entry);
        opportunity.updatedAt = updatedAt;

        return this.withRelations(opportunity);
      });
    });
  }

  createOpportunities(data: Record<string, unknown>[]) {
    return this.writeOpportunities('createOpportunities', data, false);
  }

  updateOpportunities(data: Record<string, unknown>[]) {
    return this.writeOpportunities('updateOpportunities', data, true);
  }

  createPeople(data: Record<string, unknown>[]) {
    return this.writePeople('createPeople', data, false);
  }

  updatePeople(data: Record<string, unknown>[]) {
    return this.writePeople('updatePeople', data, true);
  }

  createCompanies(data: Record<string, unknown>[]) {
    return this.writeCompanies('createCompanies', data, false);
  }

  updateCompanies(data: Record<string, unknown>[]) {
    return this.writeCompanies('updateCompanies', data, true);
  }
}

// Twenty's data model, as the metadata API shows and changes it.
export class FakeMetadata implements TwentyMetadataApi {
  objects: Record<TwentyObjectName, { id: string; fields: TwentyFieldMetadata[] }> =
    {
      person: {
        id: 'object-person',
        fields: [
          { id: randomUUID(), name: 'name', label: 'Name', type: 'FULL_NAME' },
          { id: randomUUID(), name: 'jobTitle', label: 'Job Title', type: 'TEXT' },
        ],
      },
      company: {
        id: 'object-company',
        fields: [
          { id: randomUUID(), name: 'name', label: 'Name', type: 'TEXT' },
          {
            id: randomUUID(),
            name: 'annualRevenue',
            label: 'Annual Revenue',
            type: 'CURRENCY',
          },
          {
            id: randomUUID(),
            name: 'industry',
            label: 'Industry',
            type: 'SELECT',
            options: [],
          },
        ],
      },
      opportunity: {
        id: 'object-opportunity',
        fields: [
          { id: randomUUID(), name: 'name', label: 'Name', type: 'TEXT' },
          { id: randomUUID(), name: 'amount', label: 'Amount', type: 'CURRENCY' },
          {
            id: randomUUID(),
            name: 'closeDate',
            label: 'Close date',
            type: 'DATE_TIME',
          },
          {
            id: randomUUID(),
            name: 'stage',
            label: 'Stage',
            type: 'SELECT',
            options: [
              {
                id: randomUUID(),
                value: 'NEW',
                label: 'New',
                color: 'red',
                position: 0,
              },
            ],
          },
        ],
      },
    };
  created: FieldToCreate[] = [];
  refuseCreate: (field: FieldToCreate) => Error | null = () => null;

  async listObjects(names: TwentyObjectName[]) {
    return structuredClone(
      Object.fromEntries(
        names.map((name) => [name, this.objects[name]]),
      ) as Partial<
        Record<TwentyObjectName, { id: string; fields: TwentyFieldMetadata[] }>
      >,
    );
  }

  async createField(objectMetadataId: string, field: FieldToCreate) {
    const refusal = this.refuseCreate(field);

    if (refusal) {
      throw refusal;
    }

    const object = Object.values(this.objects).find(
      (candidate) => candidate.id === objectMetadataId,
    )!;
    const created: TwentyFieldMetadata = {
      id: randomUUID(),
      name: field.name,
      label: field.label,
      type: field.type,
      options: field.options ?? null,
    };

    object.fields.push(created);
    this.created.push(structuredClone(field));

    return created;
  }

  async updateFieldOptions(fieldId: string, options: TwentyOption[]) {
    for (const object of Object.values(this.objects)) {
      const field = object.fields.find((candidate) => candidate.id === fieldId);

      if (field) {
        field.options = structuredClone(options);
      }
    }
  }

  field(object: TwentyObjectName, name: string) {
    return this.objects[object].fields.find((field) => field.name === name);
  }
}
