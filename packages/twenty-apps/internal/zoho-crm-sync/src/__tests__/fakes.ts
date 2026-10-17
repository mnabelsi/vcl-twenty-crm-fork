import type { TwentyApi, ZohoApi } from 'src/sync/engine';
import type { TwentyCompany, TwentyPerson } from 'src/sync/mapping';
import type { KeyValueStore } from 'src/sync/state';
import { MUTATION_BATCH_SIZE, TwentyApiError } from 'src/twenty/gateway';
import type { ZohoWriteResult } from 'src/zoho/client';

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

export class FakeZoho implements ZohoApi {
  modules: Record<string, Map<string, ZohoRecord>> = {
    Accounts: new Map(),
    Contacts: new Map(),
  };
  writes: {
    module: string;
    kind: 'update' | 'upsert';
    records: Record<string, unknown>[];
  }[] = [];
  private nextId = 1000;

  constructor(private readonly clock: Clock) {}

  add(
    module: 'Accounts' | 'Contacts',
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
    module: 'Accounts' | 'Contacts',
    id: string,
    changes: Record<string, any>,
  ) {
    const record = this.modules[module].get(id)!;

    Object.assign(record, changes, {
      Modified_Time: zohoTime(this.clock.tick()),
    });
  }

  async listModified<T>(
    module: string,
    _fields: string[],
    { since, page }: { since: string | null; page: number },
  ): Promise<{ records: T[]; moreRecords: boolean }> {
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
  'createPeople' | 'updatePeople' | 'createCompanies' | 'updateCompanies';

export class FakeTwenty implements TwentyApi {
  people = new Map<string, Stored<TwentyPerson>>();
  companies = new Map<string, Stored<TwentyCompany>>();
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

  async pageUpdatedSince<T>(
    collection: 'people' | 'companies',
    since: string,
    after: string | null,
    first = 100,
  ) {
    const records = this.live<any>(
      collection === 'people' ? this.people.values() : this.companies.values(),
    )
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
      records: page.map((record) =>
        collection === 'people'
          ? this.withCompany(record)
          : structuredClone(record),
      ) as T[],
      endCursor: last ? `${last.updatedAt}|${last.id}` : null,
      hasNextPage: records.length > start + first,
    };
  }

  async pageUnlinked<T>(
    collection: 'people' | 'companies',
    after: string | null,
    first = 100,
  ) {
    const field = collection === 'people' ? 'zohoContactId' : 'zohoAccountId';
    const records = this.live<any>(
      collection === 'people' ? this.people.values() : this.companies.values(),
    )
      .filter((record) => !record[field])
      .sort((a, b) => a.id.localeCompare(b.id))
      .filter((record) => !after || record.id > after);
    const page = records.slice(0, first);

    return {
      records: page.map((record) =>
        collection === 'people'
          ? this.withCompany(record)
          : structuredClone(record),
      ) as T[],
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
