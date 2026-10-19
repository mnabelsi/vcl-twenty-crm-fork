import { pullsFromZoho, pushesToZoho, type SyncConfig } from 'src/sync/config';
import {
  type FieldState,
  type FieldValues,
  parseFieldState,
  reconcileFields,
  reconcileForInsert,
  type Reconciliation,
  sameFieldState,
  serializeFieldState,
  stateAfterPull,
  stateAfterPush,
  twentyDataFor,
  twentyFieldsChanged,
  twentyFieldValues,
  zohoDataFor,
  zohoFieldValues,
} from 'src/sync/fields/reconcile';
import {
  addMissingOptions,
  loadSchema,
  moduleObject,
  refreshSchema,
  saveSchema,
  SCHEMA_MAX_AGE_MS,
  schemaFields,
  type SchemaZohoApi,
  type SyncSchema,
} from 'src/sync/fields/schema';
import type { ZohoModule } from 'src/sync/fields/schema-plan';
import { type SyncedField, unknownZohoOptions } from 'src/sync/fields/values';
import {
  companyDataForTwenty,
  companyFingerprint,
  companyIsPushable,
  companyValuesFromTwenty,
  companyValuesFromZoho,
  isAutoCreated,
  leftoverZohoEmails,
  leftoverZohoPhones,
  mergeCompanyValues,
  mergePersonValues,
  personDataForTwenty,
  personFingerprint,
  personIsPushable,
  personValuesFromTwenty,
  personValuesFromZoho,
  type CompanyValues,
  type PersonValues,
  type TwentyCompany,
  type TwentyOpportunity,
  type TwentyPerson,
  ZOHO_ACCOUNT_FIELDS,
  ZOHO_CONTACT_FIELDS,
  ZOHO_DEAL_FIELDS,
  type ZohoAccount,
  type ZohoContact,
  type ZohoDeal,
  zohoAccountChanges,
  zohoContactChanges,
} from 'src/sync/mapping';
import {
  cleanEmail,
  cleanText,
  companyNameKey,
  personNameKey,
  websiteHost,
} from 'src/sync/normalize';
import {
  type BackfillCursor,
  emptyCounts,
  type KeyValueStore,
  type PullCursor,
  freshPull,
  type PushCursor,
  type RunCounts,
  rereadModule,
  saveState,
  type SyncErrorEntry,
  type SyncState,
} from 'src/sync/state';
import {
  type Collection,
  MUTATION_BATCH_SIZE,
  TwentyApiError,
  type TwentyGateway,
} from 'src/twenty/gateway';
import type { TwentyMetadataApi } from 'src/twenty/metadata';
import {
  ZohoAuthError,
  type ZohoClient,
  ZohoError,
  type ZohoWriteResult,
} from 'src/zoho/client';

export type ZohoApi = Pick<
  ZohoClient,
  'listModified' | 'getByIds' | 'update' | 'upsert' | 'insert'
> &
  SchemaZohoApi;
export type TwentyApi = Pick<
  TwentyGateway,
  | 'findPeopleByZohoIds'
  | 'findPeopleByEmails'
  | 'findPeopleByCompanyIds'
  | 'findPeopleByIds'
  | 'findCompaniesByZohoIds'
  | 'findCompaniesByIds'
  | 'findOpportunitiesByZohoIds'
  | 'listUnlinkedCompanies'
  | 'listWorkspaceMembers'
  | 'companyIndustryValues'
  | 'pageUpdatedSince'
  | 'pageUnlinked'
  | 'createPeople'
  | 'updatePeople'
  | 'createCompanies'
  | 'updateCompanies'
  | 'createOpportunities'
  | 'updateOpportunities'
  | 'useFields'
>;

export type EngineDependencies = {
  zoho: ZohoApi;
  twenty: TwentyApi;
  // Without it the field list is not refreshed and no field is created.
  metadata?: TwentyMetadataApi | null;
  store: KeyValueStore;
  config: Pick<SyncConfig, 'direction' | 'defaultPhoneCountry'>;
  now?: () => number;
  // How long this run may keep starting new pages of work.
  budgetMs: number;
};

export type EngineResult = {
  counts: RunCounts;
  errors: SyncErrorEntry[];
  moreWorkPending: boolean;
  initialImportDone: boolean;
  backfillRunning: boolean;
  // Twenty's request limit for apps stopped the run early.
  rateLimited: boolean;
  // Work that should continue right away rather than at the next schedule.
  followUpSoon: boolean;
  schema: SyncSchema | null;
  warning: string | null;
  state: SyncState;
};

type Decision = 'none' | 'store-fingerprint' | 'apply-zoho' | 'keep-twenty';

const ZOHO_PAGE_LIMIT = 10;
const PUSH_PAGE_SIZE = 100;
const ZOHO_WRITE_BATCH = 100;

type TwentyObject = 'person' | 'company' | 'opportunity';
type AnyTwentyRecord = TwentyCompany & TwentyPerson & TwentyOpportunity;

const PULL_KEY: Record<ZohoModule, 'accounts' | 'contacts' | 'deals'> = {
  Accounts: 'accounts',
  Contacts: 'contacts',
  Deals: 'deals',
};

const CORE_ZOHO_FIELDS: Record<ZohoModule, string[]> = {
  Accounts: ZOHO_ACCOUNT_FIELDS,
  Contacts: ZOHO_CONTACT_FIELDS,
  Deals: ZOHO_DEAL_FIELDS,
};

const COLLECTION_OF: Record<ZohoModule, Collection> = {
  Accounts: 'companies',
  Contacts: 'people',
  Deals: 'opportunities',
};

// A deal's account and contact are kept as Zoho ids in the field state. On the
// Twenty side, a company or person not in Zoho yet reads as "twenty:<id>".
const DEAL_ACCOUNT: SyncedField = {
  zohoField: 'Account_Name',
  twentyField: 'companyId',
  label: 'Company',
  kind: 'text',
  direction: 'both',
};
const DEAL_CONTACT: SyncedField = {
  zohoField: 'Contact_Name',
  twentyField: 'pointOfContactId',
  label: 'Point of Contact',
  kind: 'text',
  direction: 'both',
};
const DEAL_RELATIONS = [DEAL_ACCOUNT, DEAL_CONTACT];
const NOT_IN_ZOHO_PREFIX = 'twenty:';
const SCOPES_MESSAGE =
  'Reconnect Zoho on the Zoho CRM Sync page with the scopes shown there to sync Deals.';

// What a pull does with a linked record, from three fingerprints: what Twenty
// holds, what Zoho holds, and what both held after the last sync.
export const decidePull = ({
  twentyFingerprint,
  zohoFingerprint,
  storedFingerprint,
  zohoModifiedAt,
  twentyUpdatedAt,
}: {
  twentyFingerprint: string;
  zohoFingerprint: string;
  storedFingerprint: string;
  zohoModifiedAt: number;
  twentyUpdatedAt: number;
}): { decision: Decision; conflict: boolean } => {
  if (zohoFingerprint === storedFingerprint) {
    // Zoho's synced values did not move; local edits go out with the push.
    return { decision: 'none', conflict: false };
  }
  if (twentyFingerprint === zohoFingerprint) {
    return { decision: 'store-fingerprint', conflict: false };
  }
  if (twentyFingerprint === storedFingerprint) {
    return { decision: 'apply-zoho', conflict: false };
  }

  // Both sides changed: the latest change wins, Twenty on a tie.
  return {
    decision: zohoModifiedAt > twentyUpdatedAt ? 'apply-zoho' : 'keep-twenty',
    conflict: true,
  };
};

const timeOf = (value: string | null | undefined): number => {
  const parsed = value ? Date.parse(value) : Number.NaN;

  return Number.isNaN(parsed) ? 0 : parsed;
};

// Zoho expects If-Modified-Since as yyyy-MM-ddTHH:mm:ss±HH:mm.
export const toZohoTime = (epochMs: number): string =>
  `${new Date(epochMs).toISOString().slice(0, 19)}+00:00`;

const industryKey = (value: string): string =>
  value
    .toLowerCase()
    .replace(/&|\band\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '');

const personLabel = (values: PersonValues): string =>
  cleanText(`${values.firstName} ${values.lastName}`) ||
  values.primaryEmail ||
  'Unnamed person';

const isRateLimited = (error: unknown): boolean =>
  error instanceof TwentyApiError && error.isRateLimited;

const isScopeProblem = (error: unknown): boolean =>
  error instanceof ZohoError &&
  !(error instanceof ZohoAuthError) &&
  /SCOPE/i.test(error.code);

const zohoIdOf = (lookup: { id?: string | null } | null | undefined) =>
  cleanText(lookup?.id) || null;

type PendingWrite<T> = {
  data: Record<string, unknown>;
  label: string;
  zohoId: string | null;
  twentyId: string | null;
  onWritten?: (record: T) => void;
  onFailed?: () => void;
};

export class SyncEngine {
  private readonly counts = emptyCounts();
  private readonly errors: SyncErrorEntry[] = [];
  private readonly now: () => number;
  private readonly deadline: number;
  private readonly companyIdByZohoId = new Map<string, string>();
  private unlinkedCompanies: {
    byHost: Map<string, TwentyCompany>;
    byName: Map<string, TwentyCompany>;
  } | null = null;
  private readonly personIdByZohoId = new Map<string, string>();
  private memberIdByEmail: Map<string, string> | null = null;
  private industryByKey: Map<string, string> | null | undefined;
  private moreWorkPending = false;
  private rateLimited = false;
  private followUpSoon = false;
  private schema: SyncSchema | null = null;
  private warning: string | null = null;

  constructor(
    private readonly deps: EngineDependencies,
    private state: SyncState,
  ) {
    this.now = deps.now ?? Date.now;
    this.deadline = this.now() + deps.budgetMs;
  }

  private outOfTime(): boolean {
    return this.now() >= this.deadline;
  }

  private nowIso(): string {
    return new Date(this.now()).toISOString();
  }

  private recordError(entry: Omit<SyncErrorEntry, 'at'>): void {
    this.counts.errors += 1;
    this.errors.push({ ...entry, at: this.nowIso() });
  }

  private async persist(): Promise<void> {
    await saveState(this.deps.store, this.state);
  }

  async run({
    startBackfill = false,
    refreshFields = false,
  }: {
    startBackfill?: boolean;
    refreshFields?: boolean;
  } = {}): Promise<EngineResult> {
    const { direction } = this.deps.config;
    const runStartedAt = this.nowIso();

    // Changes made in Twenty before the first run are not pushed on their own:
    // records reach Zoho when they change, or through the backfill.
    if (pushesToZoho(direction)) {
      this.state.push.companies ??= {
        since: runStartedAt,
        after: null,
        passMax: null,
      };
      this.state.push.people ??= {
        since: runStartedAt,
        after: null,
        passMax: null,
      };
    }
    if (startBackfill && pushesToZoho(direction)) {
      this.state.backfill = {
        companies: { after: null, done: false },
        people: { after: null, done: false },
        opportunities: { after: null, done: false },
      };
    }
    await this.persist();

    try {
      const fieldsCreated = await this.prepareSchema(refreshFields);

      if (pushesToZoho(direction) && this.dealsEnabled()) {
        this.state.push.opportunities ??= {
          since: runStartedAt,
          after: null,
          passMax: null,
        };
      }

      if (fieldsCreated > 0) {
        // New fields are used from the next run, once Twenty serves them.
        this.moreWorkPending = true;
        this.followUpSoon = true;
      } else {
        await this.pullAndPush();
      }
    } catch (error) {
      if (!isRateLimited(error)) {
        await this.markSchemaStale(error);
        throw error;
      }
      // The cursors only move past finished pages, so the next run reads the
      // interrupted page again and finds what it already wrote by its Zoho link.
      this.rateLimited = true;
      this.moreWorkPending = true;
    }

    await this.persist();

    return {
      counts: this.counts,
      errors: this.errors,
      moreWorkPending: this.moreWorkPending,
      initialImportDone:
        this.state.pull.accounts.caughtUp && this.state.pull.contacts.caughtUp,
      backfillRunning: this.state.backfill !== null,
      rateLimited: this.rateLimited,
      followUpSoon: this.followUpSoon,
      schema: this.schema,
      warning: this.warning ?? this.schema?.warning ?? null,
      state: this.state,
    };
  }

  // Loads the field map, rebuilding it from Zoho every few hours. Returns the
  // number of Twenty fields created.
  private async prepareSchema(force: boolean): Promise<number> {
    let schema = await loadSchema(this.deps.store);
    let fieldsCreated = 0;
    const stale =
      !schema ||
      force ||
      this.now() - schema.refreshedAt > SCHEMA_MAX_AGE_MS ||
      (await this.fieldMissingInTwenty(schema));

    if (stale && this.deps.metadata) {
      try {
        const refresh = await refreshSchema({
          zoho: this.deps.zoho,
          metadata: this.deps.metadata,
          previous: schema,
          now: this.now(),
        });

        schema = refresh.schema;
        fieldsCreated = refresh.fieldsCreated;
        this.counts.fieldsCreated += fieldsCreated;
        await saveSchema(this.deps.store, schema);

        // Records already in Twenty get the new fields from a full read.
        for (const module of Object.keys(refresh.addedFields) as ZohoModule[]) {
          this.state = rereadModule(this.state, PULL_KEY[module]);
        }
      } catch (error) {
        if (error instanceof ZohoAuthError || isRateLimited(error)) {
          throw error;
        }
        this.warning = `Could not update the list of Zoho fields: ${(error as Error).message}`;
      }
    }

    this.schema = schema;
    for (const module of Object.keys(PULL_KEY) as ZohoModule[]) {
      this.deps.twenty.useFields(
        COLLECTION_OF[module],
        schemaFields(schema, module),
      );
    }

    return fieldsCreated;
  }

  // A Zoho field deleted since the last refresh makes Zoho refuse every read
  // that names it: the next run rebuilds the field map first.
  private async markSchemaStale(error: unknown): Promise<void> {
    if (
      this.schema &&
      ((error instanceof ZohoError && !(error instanceof ZohoAuthError)) ||
        error instanceof TwentyApiError)
    ) {
      await saveSchema(this.deps.store, { ...this.schema, refreshedAt: 0 });
    }
  }

  // Every read selects the mirrored fields, so one deleted in Twenty would stop
  // the sync: the field map is then rebuilt, which creates it again.
  private async fieldMissingInTwenty(schema: SyncSchema | null): Promise<boolean> {
    if (!schema || !this.deps.metadata) {
      return false;
    }

    try {
      const objects = await this.deps.metadata.listObjects([
        'person',
        'company',
        'opportunity',
      ]);

      return (Object.keys(PULL_KEY) as ZohoModule[]).some((module) => {
        const names = new Set(
          (objects[moduleObject(module)]?.fields ?? [])
            .filter((field) => field.isActive !== false)
            .map((field) => field.name),
        );

        return schemaFields(schema, module).some(
          (field) => !names.has(field.twentyField),
        );
      });
    } catch (error) {
      if (isRateLimited(error)) {
        throw error;
      }

      return false;
    }
  }

  // Deals sync once their field list could be read, which also proves the
  // connection has the Deals scope.
  private dealsEnabled(): boolean {
    return this.schema?.modules.Deals !== undefined;
  }

  private fieldsOf(module: ZohoModule): SyncedField[] {
    return schemaFields(this.schema, module);
  }

  private zohoFieldsFor(module: ZohoModule): string[] {
    return [
      ...new Set([
        ...CORE_ZOHO_FIELDS[module],
        ...this.fieldsOf(module).map((field) => field.zohoField),
      ]),
    ];
  }

  private currencyOf(record?: { Currency?: unknown } | null): string {
    const code = cleanText(record?.Currency).toUpperCase();

    return /^[A-Z]{3}$/.test(code)
      ? code
      : (this.schema?.currencyCode ?? 'USD');
  }

  // Adds Twenty options for picklist values a page of Zoho records holds.
  private async ensureOptions(
    module: ZohoModule,
    records: Record<string, unknown>[],
  ): Promise<void> {
    const fields = this.fieldsOf(module);

    if (!this.schema || !this.deps.metadata || fields.length === 0) {
      return;
    }

    const missing = new Map<string, Set<string>>();

    for (const record of records) {
      for (const field of fields) {
        for (const value of unknownZohoOptions(field, record[field.zohoField])) {
          if (!missing.has(field.zohoField)) {
            missing.set(field.zohoField, new Set());
          }
          missing.get(field.zohoField)?.add(value);
        }
      }
    }

    if (missing.size === 0) {
      return;
    }

    try {
      if (
        await addMissingOptions({
          metadata: this.deps.metadata,
          schema: this.schema,
          module,
          object: moduleObject(module),
          missing,
        })
      ) {
        await saveSchema(this.deps.store, this.schema);
      }
    } catch (error) {
      if (isRateLimited(error)) {
        throw error;
      }
    }
  }

  // The mirrored fields of a record read from Zoho: what to write to Twenty
  // and the field state to keep.
  private pulledFields(
    module: ZohoModule,
    zohoRecord: Record<string, unknown>,
    twentyRecord: Record<string, unknown> | null,
    latest: 'zoho' | 'twenty',
  ): { data: Record<string, unknown>; valuesChanged: boolean } {
    const fields = this.fieldsOf(module);

    if (fields.length === 0) {
      return { data: {}, valuesChanged: false };
    }

    const stored = parseFieldState(twentyRecord?.zohoFieldState);
    const reconciliation = reconcileFields({
      fields,
      zoho: zohoFieldValues(fields, zohoRecord),
      twenty: twentyRecord ? twentyFieldValues(fields, twentyRecord) : {},
      stored,
      latest,
    });
    const state = stateAfterPull(fields, stored, reconciliation);
    const data = twentyDataFor(
      fields,
      reconciliation.toTwenty,
      this.currencyOf(zohoRecord),
    );

    this.counts.conflicts += reconciliation.conflicts;
    if (!sameFieldState(state, stored)) {
      data.zohoFieldState = serializeFieldState(state);
    }

    return {
      data,
      valuesChanged: Object.keys(reconciliation.toTwenty).length > 0,
    };
  }

  // Twenty data written back after a push: values Zoho won on, and the state.
  private pushedFieldsData(
    fields: SyncedField[],
    stored: FieldState | null,
    reconciliation: Reconciliation,
    zohoRecord: Record<string, unknown> | null,
  ): Record<string, unknown> {
    if (fields.length === 0) {
      return {};
    }

    return {
      ...twentyDataFor(
        fields,
        reconciliation.toTwenty,
        this.currencyOf(zohoRecord),
      ),
      zohoFieldState: serializeFieldState(
        stateAfterPush(fields, stored, reconciliation),
      ),
    };
  }

  private async pullAndPush(): Promise<void> {
    const { direction } = this.deps.config;

    if (pullsFromZoho(direction)) {
      const accountsDone = await this.pullModule('Accounts');
      const contactsDone = accountsDone && (await this.pullModule('Contacts'));
      const dealsDone =
        contactsDone &&
        (!this.dealsEnabled() || (await this.pullModule('Deals')));

      if (!accountsDone || !contactsDone || !dealsDone) {
        this.moreWorkPending = true;
      }
    }

    if (pushesToZoho(direction) && !this.outOfTime()) {
      const companiesDone = await this.pushChanged('companies');
      const peopleDone = companiesDone && (await this.pushChanged('people'));
      const opportunitiesDone =
        peopleDone &&
        (!this.dealsEnabled() || (await this.pushChanged('opportunities')));

      if (!companiesDone || !peopleDone || !opportunitiesDone) {
        this.moreWorkPending = true;
      }

      if (this.state.backfill && !this.outOfTime()) {
        const backfillDone = await this.backfill();

        if (!backfillDone) {
          this.moreWorkPending = true;
        }
      } else if (this.state.backfill) {
        this.moreWorkPending = true;
      }
    } else if (pushesToZoho(direction)) {
      this.moreWorkPending = true;
    }
  }

  // -------------------------------------------------------------------------
  // Zoho to Twenty
  // -------------------------------------------------------------------------

  // Returns true once Zoho has nothing newer left to read.
  private async pullModule(module: ZohoModule): Promise<boolean> {
    const key = PULL_KEY[module];

    while (!this.outOfTime()) {
      const cursor: PullCursor = this.state.pull[key] ?? freshPull();
      // One second of overlap: records changed in the same second as the last
      // one handled are read again rather than missed. Re-reading is harmless.
      const since = cursor.since
        ? toZohoTime(timeOf(cursor.since) - 1000)
        : null;
      let page: { records: Record<string, unknown>[]; moreRecords: boolean };

      try {
        page = await this.deps.zoho.listModified<Record<string, unknown>>(
          module,
          this.zohoFieldsFor(module),
          { since, page: cursor.page },
        );
      } catch (error) {
        if (module === 'Deals' && isScopeProblem(error)) {
          this.warning = SCOPES_MESSAGE;

          return true;
        }
        throw error;
      }

      const { records, moreRecords } = page;

      if (records.length > 0) {
        if (module === 'Accounts') {
          await this.importAccounts(records as ZohoAccount[]);
        } else if (module === 'Contacts') {
          await this.importContacts(records as ZohoContact[]);
        } else {
          await this.importDeals(records as ZohoDeal[]);
        }
      }

      const last =
        (records[records.length - 1]?.Modified_Time as string | undefined) ??
        null;
      const lastTime = timeOf(last);
      const cursorTime = timeOf(cursor.since);

      if (records.length === 0 || !moreRecords) {
        this.state.pull[key] = {
          since: last && lastTime > cursorTime ? last : cursor.since,
          page: 1,
          caughtUp: true,
        };
        await this.persist();

        return true;
      }

      if (last && lastTime > cursorTime) {
        this.state.pull[key] = {
          since: last,
          page: 1,
          caughtUp: cursor.caughtUp,
        };
      } else if (cursor.page < ZOHO_PAGE_LIMIT) {
        // A whole page changed within the same second: page through it.
        this.state.pull[key] = { ...cursor, page: cursor.page + 1 };
      } else {
        // Zoho pages only 2,000 records this way; step over the second.
        this.state.pull[key] = {
          since: new Date(cursorTime + 1000).toISOString(),
          page: 1,
          caughtUp: cursor.caughtUp,
        };
      }
      await this.persist();
    }

    return false;
  }

  private async loadUnlinkedCompanies() {
    if (!this.unlinkedCompanies) {
      const companies = await this.deps.twenty.listUnlinkedCompanies();

      this.unlinkedCompanies = { byHost: new Map(), byName: new Map() };
      for (const company of companies) {
        this.rememberUnlinkedCompany(company);
      }
    }

    return this.unlinkedCompanies;
  }

  private rememberUnlinkedCompany(company: TwentyCompany): void {
    if (!this.unlinkedCompanies) {
      return;
    }

    const { byHost, byName } = this.unlinkedCompanies;
    const host = websiteHost(company.domainName?.primaryLinkUrl);
    const name = companyNameKey(company.name);

    if (host && !byHost.has(host)) {
      byHost.set(host, company);
    }
    if (name && !byName.has(name)) {
      byName.set(name, company);
    }
  }

  private forgetUnlinkedCompany(company: TwentyCompany): void {
    if (!this.unlinkedCompanies) {
      return;
    }
    for (const index of [
      this.unlinkedCompanies.byHost,
      this.unlinkedCompanies.byName,
    ]) {
      for (const [key, value] of index) {
        if (value.id === company.id) {
          index.delete(key);
        }
      }
    }
  }

  private async memberIdFor(
    email: string | null | undefined,
  ): Promise<string | null> {
    const key = cleanEmail(email);

    if (key === '') {
      return null;
    }
    if (!this.memberIdByEmail) {
      try {
        const members = await this.deps.twenty.listWorkspaceMembers();

        this.memberIdByEmail = new Map(
          members.map((member) => [cleanEmail(member.userEmail), member.id]),
        );
      } catch {
        this.memberIdByEmail = new Map();
      }
    }

    return this.memberIdByEmail.get(key) ?? null;
  }

  private async industryFor(
    zohoIndustry: string | null | undefined,
  ): Promise<string | null> {
    const text = cleanText(zohoIndustry);

    if (text === '') {
      return null;
    }
    if (this.industryByKey === undefined) {
      const values = await this.deps.twenty.companyIndustryValues();

      this.industryByKey = values
        ? new Map(values.map((value) => [industryKey(value), value]))
        : null;
    }

    return this.industryByKey?.get(industryKey(text)) ?? null;
  }

  private async importAccounts(accounts: ZohoAccount[]): Promise<void> {
    await this.ensureOptions('Accounts', accounts);

    const linked = await this.deps.twenty.findCompaniesByZohoIds(
      accounts.map((account) => account.id),
    );
    const linkedByZohoId = new Map(
      linked.map((company) => [company.zohoAccountId as string, company]),
    );
    const creates: PendingWrite<TwentyCompany>[] = [];
    const updates: PendingWrite<TwentyCompany>[] = [];
    const twoWay = this.deps.config.direction === 'TWO_WAY';
    const syncedAt = this.nowIso();

    for (const account of accounts) {
      const zohoValues = companyValuesFromZoho(account);
      const zohoFingerprint = companyFingerprint(zohoValues);
      const existing = linkedByZohoId.get(account.id);
      const label = zohoValues.name || 'Unnamed company';

      if (existing?.deletedAt) {
        // Deleted in Twenty on purpose: Zoho does not bring it back.
        continue;
      }

      if (existing) {
        this.companyIdByZohoId.set(account.id, existing.id);

        const { decision, conflict } = decidePull({
          twentyFingerprint: companyFingerprint(
            companyValuesFromTwenty(existing),
          ),
          zohoFingerprint,
          storedFingerprint: existing.zohoSyncHash ?? '',
          zohoModifiedAt: timeOf(account.Modified_Time),
          twentyUpdatedAt: timeOf(existing.updatedAt),
        });

        if (conflict) {
          this.counts.conflicts += 1;
        }

        const extra = this.pulledFields(
          'Accounts',
          account,
          existing as Record<string, unknown>,
          timeOf(account.Modified_Time) > timeOf(existing.updatedAt)
            ? 'zoho'
            : 'twenty',
        );

        if (decision === 'store-fingerprint') {
          updates.push({
            data: {
              id: existing.id,
              ...extra.data,
              zohoSyncHash: zohoFingerprint,
              zohoSyncedAt: syncedAt,
            },
            label,
            zohoId: account.id,
            twentyId: existing.id,
            onWritten: () =>
              extra.valuesChanged && (this.counts.companiesUpdated += 1),
          });
        } else if (decision === 'apply-zoho') {
          updates.push({
            data: {
              id: existing.id,
              ...companyDataForTwenty(zohoValues, existing),
              ...extra.data,
              zohoSyncHash: zohoFingerprint,
              zohoSyncedAt: syncedAt,
            },
            label,
            zohoId: account.id,
            twentyId: existing.id,
            onWritten: () => (this.counts.companiesUpdated += 1),
          });
        } else if (Object.keys(extra.data).length > 0) {
          updates.push({
            data: { id: existing.id, ...extra.data, zohoSyncedAt: syncedAt },
            label,
            zohoId: account.id,
            twentyId: existing.id,
            onWritten: () =>
              extra.valuesChanged && (this.counts.companiesUpdated += 1),
          });
        }
        continue;
      }

      const unlinked = await this.loadUnlinkedCompanies();
      const match =
        (websiteHost(zohoValues.website) &&
          unlinked.byHost.get(websiteHost(zohoValues.website))) ||
        (companyNameKey(zohoValues.name) &&
          unlinked.byName.get(companyNameKey(zohoValues.name))) ||
        null;

      if (match) {
        this.forgetUnlinkedCompany(match);
        this.companyIdByZohoId.set(account.id, match.id);

        const twentyValues = companyValuesFromTwenty(match);
        const values = twoWay
          ? mergeCompanyValues(twentyValues, zohoValues)
          : mergeCompanyValues(zohoValues, twentyValues);

        updates.push({
          data: {
            id: match.id,
            ...companyDataForTwenty(values, match),
            ...this.pulledFields(
              'Accounts',
              account,
              match as Record<string, unknown>,
              'zoho',
            ).data,
            ...(match.accountOwnerId ? {} : await this.ownerData(account)),
            zohoAccountId: account.id,
            zohoSyncHash: zohoFingerprint,
            zohoSyncedAt: syncedAt,
          },
          label,
          zohoId: account.id,
          twentyId: match.id,
          onWritten: () => (this.counts.companiesLinked += 1),
          // Still unlinked: the account must match it again, not create a copy.
          onFailed: () => {
            this.rememberUnlinkedCompany(match);
            this.companyIdByZohoId.delete(account.id);
          },
        });
        continue;
      }

      if (!zohoValues.name) {
        continue;
      }

      const industry = await this.industryFor(account.Industry);

      creates.push({
        data: {
          ...companyDataForTwenty(zohoValues, null),
          ...this.pulledFields('Accounts', account, null, 'zoho').data,
          ...(await this.ownerData(account)),
          ...(industry ? { industry } : {}),
          zohoAccountId: account.id,
          zohoSyncHash: zohoFingerprint,
          zohoSyncedAt: syncedAt,
        },
        label,
        zohoId: account.id,
        twentyId: null,
        onWritten: (company) => {
          this.counts.companiesCreated += 1;
          this.companyIdByZohoId.set(account.id, company.id);
        },
      });
    }

    await this.writeTwenty('company', 'create', creates);
    await this.writeTwenty('company', 'update', updates);
  }

  private async ownerData(
    account: ZohoAccount,
  ): Promise<Record<string, unknown>> {
    const ownerId = await this.memberIdFor(account.Owner?.email);

    return ownerId ? { accountOwnerId: ownerId } : {};
  }

  // Finds the Twenty company of each Zoho account, importing accounts that
  // have not reached Twenty yet so a contact is never left without its company.
  private async companiesForZohoAccounts(
    zohoIds: string[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(zohoIds.filter((id) => id !== ''))];
    const missing = unique.filter((id) => !this.companyIdByZohoId.has(id));

    if (missing.length > 0) {
      for (const company of await this.deps.twenty.findCompaniesByZohoIds(
        missing,
      )) {
        if (!company.deletedAt) {
          this.companyIdByZohoId.set(
            company.zohoAccountId as string,
            company.id,
          );
        }
      }
    }

    const notInTwenty = unique.filter((id) => !this.companyIdByZohoId.has(id));

    if (notInTwenty.length > 0 && pullsFromZoho(this.deps.config.direction)) {
      const accounts = await this.deps.zoho.getByIds<ZohoAccount>(
        'Accounts',
        notInTwenty,
        this.zohoFieldsFor('Accounts'),
      );

      if (accounts.length > 0) {
        await this.importAccounts(accounts);
      }
    }

    return this.companyIdByZohoId;
  }

  private async importContacts(contacts: ZohoContact[]): Promise<void> {
    await this.ensureOptions('Contacts', contacts);

    const fallbackCountry = this.deps.config.defaultPhoneCountry;
    const twoWay = this.deps.config.direction === 'TWO_WAY';
    const syncedAt = this.nowIso();
    const linked = await this.deps.twenty.findPeopleByZohoIds(
      contacts.map((contact) => contact.id),
    );
    const linkedByZohoId = new Map(
      linked.map((person) => [person.zohoContactId as string, person]),
    );
    const companyIds = await this.companiesForZohoAccounts(
      contacts.map((contact) => cleanText(contact.Account_Name?.id)),
    );

    // Match the contacts Twenty does not know yet: by email, then by name
    // within the same company. Only people not linked to Zoho are candidates.
    const unmatched = contacts.filter(
      (contact) => !linkedByZohoId.has(contact.id),
    );
    const emails = [
      ...new Set(
        unmatched
          .map((contact) => cleanEmail(contact.Email))
          .filter((email) => email !== ''),
      ),
    ];
    const byEmail = new Map<string, TwentyPerson>();

    for (const person of emails.length > 0
      ? await this.deps.twenty.findPeopleByEmails(emails)
      : []) {
      const email = cleanEmail(person.emails?.primaryEmail);

      if (!cleanText(person.zohoContactId) && !byEmail.has(email)) {
        byEmail.set(email, person);
      }
    }

    const companiesOfUnmatched = [
      ...new Set(
        unmatched
          .filter((contact) => !byEmail.has(cleanEmail(contact.Email)))
          .map((contact) => companyIds.get(cleanText(contact.Account_Name?.id)))
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const byNameInCompany = new Map<string, TwentyPerson>();

    for (const person of companiesOfUnmatched.length > 0
      ? await this.deps.twenty.findPeopleByCompanyIds(companiesOfUnmatched)
      : []) {
      const key = `${person.companyId}|${personNameKey(person.name?.firstName, person.name?.lastName)}`;

      if (!cleanText(person.zohoContactId) && !byNameInCompany.has(key)) {
        byNameInCompany.set(key, person);
      }
    }

    const claimed = new Set<string>();
    const creates: PendingWrite<TwentyPerson>[] = [];
    const updates: PendingWrite<TwentyPerson>[] = [];

    for (const contact of contacts) {
      const zohoValues = personValuesFromZoho(contact, fallbackCountry);
      const zohoFingerprint = personFingerprint(zohoValues);
      const zohoCompanyId = zohoValues.zohoAccountId
        ? (companyIds.get(zohoValues.zohoAccountId) ?? null)
        : null;
      const existing = linkedByZohoId.get(contact.id);
      const label = personLabel(zohoValues);

      if (existing?.deletedAt) {
        continue;
      }

      if (existing) {
        const twentyValues = personValuesFromTwenty(existing);
        const { decision, conflict } = decidePull({
          twentyFingerprint: personFingerprint(twentyValues),
          zohoFingerprint,
          storedFingerprint: existing.zohoSyncHash ?? '',
          zohoModifiedAt: timeOf(contact.Modified_Time),
          twentyUpdatedAt: timeOf(existing.updatedAt),
        });

        if (conflict) {
          this.counts.conflicts += 1;
        }

        const extra = this.pulledFields(
          'Contacts',
          contact,
          existing as Record<string, unknown>,
          timeOf(contact.Modified_Time) > timeOf(existing.updatedAt)
            ? 'zoho'
            : 'twenty',
        );

        if (decision === 'store-fingerprint') {
          updates.push({
            data: {
              id: existing.id,
              ...extra.data,
              zohoSyncHash: zohoFingerprint,
              zohoSyncedAt: syncedAt,
            },
            label,
            zohoId: contact.id,
            twentyId: existing.id,
            onWritten: () =>
              extra.valuesChanged && (this.counts.peopleUpdated += 1),
          });
        } else if (decision === 'apply-zoho') {
          updates.push({
            data: {
              id: existing.id,
              ...personDataForTwenty(zohoValues, existing),
              ...this.companyChange(zohoValues, twentyValues, zohoCompanyId),
              ...extra.data,
              zohoSyncHash: zohoFingerprint,
              zohoSyncedAt: syncedAt,
            },
            label,
            zohoId: contact.id,
            twentyId: existing.id,
            onWritten: () => (this.counts.peopleUpdated += 1),
          });
        } else if (Object.keys(extra.data).length > 0) {
          updates.push({
            data: { id: existing.id, ...extra.data, zohoSyncedAt: syncedAt },
            label,
            zohoId: contact.id,
            twentyId: existing.id,
            onWritten: () =>
              extra.valuesChanged && (this.counts.peopleUpdated += 1),
          });
        }
        continue;
      }

      const email = zohoValues.primaryEmail;
      const nameKey = `${zohoCompanyId}|${personNameKey(zohoValues.firstName, zohoValues.lastName)}`;
      const candidate =
        (email && byEmail.get(email)) ||
        (zohoCompanyId && byNameInCompany.get(nameKey)) ||
        null;
      const match = candidate && !claimed.has(candidate.id) ? candidate : null;

      if (match) {
        claimed.add(match.id);

        const twentyValues = personValuesFromTwenty(match);
        let values = twoWay
          ? mergePersonValues(twentyValues, zohoValues)
          : mergePersonValues(zohoValues, twentyValues);

        // A person already placed in a company keeps it when Twenty leads.
        if (twoWay && match.companyId) {
          values = {
            ...values,
            zohoAccountId: twentyValues.zohoAccountId,
          };
        }

        updates.push({
          data: {
            id: match.id,
            ...personDataForTwenty(values, match, {
              emails: leftoverZohoEmails(values, zohoValues),
              phones: leftoverZohoPhones(values, zohoValues),
            }),
            ...(twoWay && match.companyId
              ? {}
              : this.companyChange(values, twentyValues, zohoCompanyId)),
            ...this.pulledFields(
              'Contacts',
              contact,
              match as Record<string, unknown>,
              'zoho',
            ).data,
            zohoContactId: contact.id,
            zohoSyncHash: zohoFingerprint,
            zohoSyncedAt: syncedAt,
          },
          label,
          zohoId: contact.id,
          twentyId: match.id,
          onWritten: () => (this.counts.peopleLinked += 1),
        });
        continue;
      }

      if (
        !zohoValues.firstName &&
        !zohoValues.lastName &&
        !zohoValues.primaryEmail
      ) {
        continue;
      }

      creates.push({
        data: {
          ...personDataForTwenty(zohoValues, null),
          ...this.pulledFields('Contacts', contact, null, 'zoho').data,
          ...(zohoCompanyId ? { companyId: zohoCompanyId } : {}),
          zohoContactId: contact.id,
          zohoSyncHash: zohoFingerprint,
          zohoSyncedAt: syncedAt,
        },
        label,
        zohoId: contact.id,
        twentyId: null,
        onWritten: () => (this.counts.peopleCreated += 1),
      });
    }

    await this.writeTwenty('person', 'create', creates);
    await this.writeTwenty('person', 'update', updates);
  }

  // The person's company follows the Zoho account only when the account
  // changed. A Zoho contact without an account leaves the Twenty company
  // alone: it may have been linked in Twenty, by hand or by email domain.
  private companyChange(
    values: PersonValues,
    twentyValues: PersonValues,
    zohoCompanyId: string | null,
  ): Record<string, unknown> {
    if (
      values.zohoAccountId === twentyValues.zohoAccountId ||
      values.zohoAccountId === ''
    ) {
      return {};
    }

    return zohoCompanyId ? { companyId: zohoCompanyId } : {};
  }

  // -------------------------------------------------------------------------
  // Deals and opportunities
  // -------------------------------------------------------------------------

  // Finds the Twenty person of each Zoho contact, importing contacts that have
  // not reached Twenty yet so a deal keeps its point of contact.
  private async peopleForZohoContacts(
    zohoIds: string[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(zohoIds.filter((id) => id !== ''))];
    const lookUp = async (ids: string[]) => {
      if (ids.length === 0) {
        return;
      }
      for (const person of await this.deps.twenty.findPeopleByZohoIds(ids)) {
        if (!person.deletedAt) {
          this.personIdByZohoId.set(person.zohoContactId as string, person.id);
        }
      }
    };

    await lookUp(unique.filter((id) => !this.personIdByZohoId.has(id)));

    const notInTwenty = unique.filter((id) => !this.personIdByZohoId.has(id));

    if (notInTwenty.length > 0 && pullsFromZoho(this.deps.config.direction)) {
      const contacts = await this.deps.zoho.getByIds<ZohoContact>(
        'Contacts',
        notInTwenty,
        this.zohoFieldsFor('Contacts'),
      );

      if (contacts.length > 0) {
        await this.importContacts(contacts);
        await lookUp(notInTwenty);
      }
    }

    return this.personIdByZohoId;
  }

  private dealValues(fields: SyncedField[], deal: ZohoDeal): FieldValues {
    return {
      ...zohoFieldValues(fields, deal),
      [DEAL_ACCOUNT.zohoField]: zohoIdOf(deal.Account_Name),
      [DEAL_CONTACT.zohoField]: zohoIdOf(deal.Contact_Name),
    };
  }

  private opportunityValues(
    fields: SyncedField[],
    opportunity: TwentyOpportunity,
  ): FieldValues {
    return {
      ...twentyFieldValues(fields, opportunity as Record<string, unknown>),
      [DEAL_ACCOUNT.zohoField]:
        cleanText(opportunity.company?.zohoAccountId) ||
        (opportunity.companyId
          ? `${NOT_IN_ZOHO_PREFIX}${opportunity.companyId}`
          : null),
      [DEAL_CONTACT.zohoField]:
        cleanText(opportunity.pointOfContact?.zohoContactId) ||
        (opportunity.pointOfContactId
          ? `${NOT_IN_ZOHO_PREFIX}${opportunity.pointOfContactId}`
          : null),
    };
  }

  // Twenty data for what Zoho won on. A Zoho account or contact Twenty cannot
  // find is left out, and stays unsettled so it is tried again.
  private opportunityDataFromZoho(
    fields: SyncedField[],
    reconciliation: Reconciliation,
    deal: ZohoDeal | null,
  ): Record<string, unknown> {
    const data = twentyDataFor(
      fields,
      reconciliation.toTwenty,
      this.currencyOf(deal),
    );

    for (const relation of DEAL_RELATIONS) {
      if (!(relation.zohoField in reconciliation.toTwenty)) {
        continue;
      }

      const zohoId = reconciliation.toTwenty[relation.zohoField] as
        | string
        | null;
      const ids =
        relation === DEAL_ACCOUNT
          ? this.companyIdByZohoId
          : this.personIdByZohoId;

      if (zohoId === null) {
        data[relation.twentyField] = null;
      } else if (ids.has(zohoId)) {
        data[relation.twentyField] = ids.get(zohoId);
      } else {
        delete reconciliation.toTwenty[relation.zohoField];
        delete reconciliation.settled[relation.zohoField];
      }
    }

    return data;
  }

  // Zoho data for what Twenty won on. A company or person not in Zoho yet is
  // left out, and stays unsettled so it goes once it is in Zoho.
  private dealPayload(
    fields: SyncedField[],
    reconciliation: Reconciliation,
  ): Record<string, unknown> {
    const payload = zohoDataFor(fields, reconciliation.toZoho);

    for (const relation of DEAL_RELATIONS) {
      if (!(relation.zohoField in reconciliation.toZoho)) {
        continue;
      }

      const value = reconciliation.toZoho[relation.zohoField];

      if (value === null) {
        payload[relation.zohoField] = null;
      } else if (
        typeof value === 'string' &&
        !value.startsWith(NOT_IN_ZOHO_PREFIX)
      ) {
        payload[relation.zohoField] = { id: value };
      } else {
        delete reconciliation.toZoho[relation.zohoField];
      }
    }

    return payload;
  }

  private async dealOwnerData(deal: ZohoDeal): Promise<Record<string, unknown>> {
    const ownerId = await this.memberIdFor(deal.Owner?.email);

    return ownerId ? { ownerId } : {};
  }

  private async importDeals(deals: ZohoDeal[]): Promise<void> {
    await this.ensureOptions('Deals', deals);

    const fields = this.fieldsOf('Deals');
    const allFields = [...fields, ...DEAL_RELATIONS];
    const syncedAt = this.nowIso();
    const linked = await this.deps.twenty.findOpportunitiesByZohoIds(
      deals.map((deal) => deal.id),
    );
    const linkedByZohoId = new Map(
      linked.map((opportunity) => [
        opportunity.zohoDealId as string,
        opportunity,
      ]),
    );

    await this.companiesForZohoAccounts(
      deals.map((deal) => zohoIdOf(deal.Account_Name) ?? ''),
    );
    await this.peopleForZohoContacts(
      deals.map((deal) => zohoIdOf(deal.Contact_Name) ?? ''),
    );

    const creates: PendingWrite<TwentyOpportunity>[] = [];
    const updates: PendingWrite<TwentyOpportunity>[] = [];

    for (const deal of deals) {
      const existing = linkedByZohoId.get(deal.id);

      if (existing?.deletedAt) {
        // Deleted in Twenty on purpose: Zoho does not bring it back.
        continue;
      }

      const stored = parseFieldState(existing?.zohoFieldState);
      const reconciliation = reconcileFields({
        fields: allFields,
        zoho: this.dealValues(fields, deal),
        twenty: existing ? this.opportunityValues(fields, existing) : {},
        stored,
        latest:
          existing &&
          timeOf(existing.updatedAt) >= timeOf(deal.Modified_Time)
            ? 'twenty'
            : 'zoho',
      });
      const data = this.opportunityDataFromZoho(fields, reconciliation, deal);
      const state = stateAfterPull(allFields, stored, reconciliation);
      const label = cleanText(deal.Deal_Name) || 'Unnamed deal';

      this.counts.conflicts += reconciliation.conflicts;

      if (!existing) {
        creates.push({
          data: {
            ...data,
            ...(await this.dealOwnerData(deal)),
            zohoDealId: deal.id,
            zohoFieldState: serializeFieldState(state),
            zohoSyncedAt: syncedAt,
          },
          label,
          zohoId: deal.id,
          twentyId: null,
          onWritten: () => (this.counts.opportunitiesCreated += 1),
        });
        continue;
      }

      const owner = existing.ownerId ? {} : await this.dealOwnerData(deal);

      if (
        Object.keys(data).length === 0 &&
        Object.keys(owner).length === 0 &&
        sameFieldState(state, stored)
      ) {
        continue;
      }

      updates.push({
        data: {
          id: existing.id,
          ...data,
          ...owner,
          zohoFieldState: serializeFieldState(state),
          zohoSyncedAt: syncedAt,
        },
        label,
        zohoId: deal.id,
        twentyId: existing.id,
        onWritten: () =>
          Object.keys(data).length > 0 &&
          (this.counts.opportunitiesUpdated += 1),
      });
    }

    await this.writeTwenty('opportunity', 'create', creates);
    await this.writeTwenty('opportunity', 'update', updates);
  }

  private async pushOpportunities(
    opportunities: TwentyOpportunity[],
    { includeUnchanged = false }: { includeUnchanged?: boolean } = {},
  ): Promise<void> {
    const fields = this.fieldsOf('Deals');
    const allFields = [...fields, ...DEAL_RELATIONS];
    const candidates = opportunities.filter(
      (opportunity) => !opportunity.deletedAt,
    );

    // A deal can only point at an account and a contact that are in Zoho.
    const companiesToLink = [
      ...new Set(
        candidates
          .filter(
            (opportunity) =>
              opportunity.companyId &&
              !cleanText(opportunity.company?.zohoAccountId),
          )
          .map((opportunity) => opportunity.companyId as string),
      ),
    ];

    if (companiesToLink.length > 0) {
      const zohoIds = await this.pushCompanies(
        await this.deps.twenty.findCompaniesByIds(companiesToLink),
        { includeUnchanged: true },
      );

      for (const opportunity of candidates) {
        const zohoId = opportunity.companyId
          ? zohoIds.get(opportunity.companyId)
          : undefined;

        if (zohoId) {
          opportunity.company = {
            id: opportunity.companyId as string,
            zohoAccountId: zohoId,
          };
        }
      }
    }

    const peopleToLink = [
      ...new Set(
        candidates
          .filter(
            (opportunity) =>
              opportunity.pointOfContactId &&
              !cleanText(opportunity.pointOfContact?.zohoContactId),
          )
          .map((opportunity) => opportunity.pointOfContactId as string),
      ),
    ];

    if (peopleToLink.length > 0) {
      const zohoIds = await this.pushPeople(
        await this.deps.twenty.findPeopleByIds(peopleToLink),
        { includeUnchanged: true },
      );

      for (const opportunity of candidates) {
        const zohoId = opportunity.pointOfContactId
          ? zohoIds.get(opportunity.pointOfContactId)
          : undefined;

        if (zohoId) {
          opportunity.pointOfContact = {
            id: opportunity.pointOfContactId as string,
            zohoContactId: zohoId,
          };
        }
      }
    }

    type Item = {
      opportunity: TwentyOpportunity;
      values: FieldValues;
      stored: FieldState | null;
      reconciliation?: Reconciliation;
      deal?: ZohoDeal | null;
    };
    const toPush: Item[] = [];

    for (const opportunity of candidates) {
      const values = this.opportunityValues(fields, opportunity);
      const stored = parseFieldState(opportunity.zohoFieldState);

      if (
        !twentyFieldsChanged(allFields, values, stored) &&
        !(includeUnchanged && !opportunity.zohoDealId)
      ) {
        continue;
      }
      if (!opportunity.zohoDealId && !cleanText(opportunity.name)) {
        // Zoho requires a deal name.
        continue;
      }
      toPush.push({ opportunity, values, stored });
    }

    const linked = toPush.filter(({ opportunity }) => opportunity.zohoDealId);
    const current = new Map(
      (
        await this.deps.zoho.getByIds<ZohoDeal>(
          'Deals',
          linked.map(({ opportunity }) => opportunity.zohoDealId as string),
          this.zohoFieldsFor('Deals'),
        )
      ).map((deal) => [deal.id, deal]),
    );
    const updates: { item: Item; payload: Record<string, unknown> }[] = [];
    const inserts: { item: Item; payload: Record<string, unknown> }[] = [];
    const writeBacks: PendingWrite<TwentyOpportunity>[] = [];
    const writeBackData = (item: Item): Record<string, unknown> => {
      const reconciliation = item.reconciliation as Reconciliation;
      const data = this.opportunityDataFromZoho(
        fields,
        reconciliation,
        item.deal ?? null,
      );

      return {
        id: item.opportunity.id,
        ...data,
        zohoFieldState: serializeFieldState(
          stateAfterPush(allFields, item.stored, reconciliation),
        ),
        zohoSyncedAt: this.nowIso(),
      };
    };

    for (const item of toPush) {
      const deal = item.opportunity.zohoDealId
        ? current.get(item.opportunity.zohoDealId)
        : undefined;

      if (!deal) {
        item.reconciliation = reconcileForInsert(allFields, item.values);
        item.deal = null;
        inserts.push({
          item,
          payload: this.dealPayload(fields, item.reconciliation),
        });
        continue;
      }

      item.reconciliation = reconcileFields({
        fields: allFields,
        zoho: this.dealValues(fields, deal),
        twenty: item.values,
        stored: item.stored,
        latest:
          timeOf(item.opportunity.updatedAt) >= timeOf(deal.Modified_Time)
            ? 'twenty'
            : 'zoho',
      });
      item.deal = deal;
      this.counts.conflicts += item.reconciliation.conflicts;

      const payload = this.dealPayload(fields, item.reconciliation);

      if (Object.keys(payload).length === 0) {
        writeBacks.push({
          data: writeBackData(item),
          label: cleanText(item.opportunity.name) || 'Unnamed opportunity',
          zohoId: deal.id,
          twentyId: item.opportunity.id,
        });
      } else {
        updates.push({ item, payload: { id: deal.id, ...payload } });
      }
    }

    const handle = (
      batch: { item: Item }[],
      results: ZohoWriteResult[],
      inserting: boolean,
    ) => {
      batch.forEach(({ item }, index) => {
        const result = results[index];
        const label = cleanText(item.opportunity.name) || 'Unnamed opportunity';

        if (!result?.ok || !result.id) {
          this.recordError({
            direction: 'push',
            object: 'opportunity',
            label,
            twentyId: item.opportunity.id,
            zohoId: item.opportunity.zohoDealId || null,
            message:
              `Zoho refused the deal (${result?.code ?? 'UNKNOWN'}): ${result?.message ?? ''}`.trim(),
          });

          return;
        }

        if (inserting) {
          this.counts.zohoDealsCreated += 1;
        } else {
          this.counts.zohoDealsUpdated += 1;
        }
        writeBacks.push({
          data: { ...writeBackData(item), zohoDealId: result.id },
          label,
          zohoId: result.id,
          twentyId: item.opportunity.id,
        });
      });
    };

    for (let index = 0; index < updates.length; index += ZOHO_WRITE_BATCH) {
      const batch = updates.slice(index, index + ZOHO_WRITE_BATCH);

      handle(
        batch,
        await this.zohoWrite(
          () =>
            this.deps.zoho.update(
              'Deals',
              batch.map((entry) => entry.payload),
            ),
          batch.length,
        ),
        false,
      );
    }
    for (let index = 0; index < inserts.length; index += ZOHO_WRITE_BATCH) {
      const batch = inserts.slice(index, index + ZOHO_WRITE_BATCH);

      handle(
        batch,
        await this.zohoWrite(
          () =>
            this.deps.zoho.insert(
              'Deals',
              batch.map((entry) => entry.payload),
            ),
          batch.length,
        ),
        true,
      );
    }

    await this.writeTwenty('opportunity', 'update', writeBacks, 'push');
  }

  // Writes in batches; when a batch fails, each of its records is retried alone
  // so one bad record (an invalid phone number, say) does not block the others.
  // Twenty's request limit is not a bad record: it stops the run instead.
  private async writeTwenty<T extends { id: string }>(
    object: TwentyObject,
    operation: 'create' | 'update',
    writes: PendingWrite<T>[],
    direction: 'pull' | 'push' = 'pull',
  ): Promise<void> {
    for (let index = 0; index < writes.length; index += MUTATION_BATCH_SIZE) {
      await this.writeTwentyBatch(
        object,
        operation,
        writes.slice(index, index + MUTATION_BATCH_SIZE),
        direction,
      );
    }
  }

  // A create Twenty refused may still have saved records: those are found by
  // their Zoho link and kept, not created a second time.
  private async savedByZohoId(
    object: TwentyObject,
    zohoIds: string[],
  ): Promise<Map<string, unknown>> {
    const twenty = this.deps.twenty;

    if (object === 'person') {
      return new Map(
        (await twenty.findPeopleByZohoIds(zohoIds)).map((person) => [
          person.zohoContactId as string,
          person,
        ]),
      );
    }
    if (object === 'company') {
      return new Map(
        (await twenty.findCompaniesByZohoIds(zohoIds)).map((company) => [
          company.zohoAccountId as string,
          company,
        ]),
      );
    }

    return new Map(
      (await twenty.findOpportunitiesByZohoIds(zohoIds)).map((opportunity) => [
        opportunity.zohoDealId as string,
        opportunity,
      ]),
    );
  }

  private async withoutSavedCreates<T>(
    object: TwentyObject,
    writes: PendingWrite<T>[],
  ): Promise<PendingWrite<T>[]> {
    const zohoIds = writes
      .map((pending) => pending.zohoId)
      .filter((id): id is string => Boolean(id));

    if (zohoIds.length === 0) {
      return writes;
    }

    const saved = await this.savedByZohoId(object, zohoIds);

    return writes.filter((pending) => {
      const record = pending.zohoId ? saved.get(pending.zohoId) : undefined;

      if (record) {
        pending.onWritten?.(record as T);
      }

      return !record;
    });
  }

  private async writeTwentyBatch<T extends { id: string }>(
    object: TwentyObject,
    operation: 'create' | 'update',
    writes: PendingWrite<T>[],
    direction: 'pull' | 'push',
  ): Promise<void> {
    const write = (data: Record<string, unknown>[]): Promise<T[]> => {
      const twenty = this.deps.twenty;

      if (object === 'person') {
        return (
          operation === 'create'
            ? twenty.createPeople(data)
            : twenty.updatePeople(data)
        ) as Promise<T[]>;
      }
      if (object === 'opportunity') {
        return (
          operation === 'create'
            ? twenty.createOpportunities(data)
            : twenty.updateOpportunities(data)
        ) as Promise<T[]>;
      }

      return (
        operation === 'create'
          ? twenty.createCompanies(data)
          : twenty.updateCompanies(data)
      ) as Promise<T[]>;
    };

    try {
      const records = await write(writes.map((pending) => pending.data));

      writes.forEach(
        (pending, index) =>
          records[index] && pending.onWritten?.(records[index]),
      );

      return;
    } catch (error) {
      if (isRateLimited(error)) {
        throw error;
      }
    }

    const retries =
      operation === 'create'
        ? await this.withoutSavedCreates(object, writes)
        : writes;

    for (const pending of retries) {
      try {
        const [record] = await write([pending.data]);

        pending.onWritten?.(record);
      } catch (error) {
        if (isRateLimited(error)) {
          throw error;
        }
        if (
          object === 'person' &&
          error instanceof TwentyApiError &&
          error.isInvalidPhone &&
          pending.data.phones
        ) {
          try {
            const withoutPhones = { ...pending.data };

            delete withoutPhones.phones;

            const [record] = await write([withoutPhones]);

            pending.onWritten?.(record);
            this.recordError({
              direction,
              object,
              label: pending.label,
              twentyId: pending.twentyId ?? record.id,
              zohoId: pending.zohoId,
              message:
                'Saved without its phone numbers: Twenty did not accept them as valid.',
            });
            continue;
          } catch (retryError) {
            if (isRateLimited(retryError)) {
              throw retryError;
            }
            // report the original error below
          }
        }

        pending.onFailed?.();
        this.recordError({
          direction,
          object,
          label: pending.label,
          twentyId: pending.twentyId,
          zohoId: pending.zohoId,
          message: `Twenty refused the ${operation}: ${(error as Error).message}`,
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // Twenty to Zoho
  // -------------------------------------------------------------------------

  // Sends what changed in Twenty since the last pass. Returns true when the
  // pass reached the most recent change.
  private async pushChanged(collection: Collection): Promise<boolean> {
    while (!this.outOfTime()) {
      const cursor = this.state.push[collection] as PushCursor;
      const page = await this.deps.twenty.pageUpdatedSince<AnyTwentyRecord>(
        collection,
        cursor.since,
        cursor.after,
        PUSH_PAGE_SIZE,
      );

      if (collection === 'companies') {
        await this.pushCompanies(page.records, {
          skipAutoCreated: true,
        });
      } else if (collection === 'people') {
        await this.pushPeople(page.records, { skipAutoCreated: true });
      } else {
        await this.pushOpportunities(page.records);
      }

      const pageMax = page.records.reduce<string | null>(
        (max, record) =>
          record.updatedAt && (!max || timeOf(record.updatedAt) > timeOf(max))
            ? record.updatedAt
            : max,
        cursor.passMax,
      );

      if (!page.hasNextPage) {
        // The next pass starts after the newest change seen. Records this pass
        // wrote back are seen once more and skipped by their fingerprint.
        this.state.push[collection] = {
          since: pageMax ?? cursor.since,
          after: null,
          passMax: null,
        };
        await this.persist();

        return true;
      }

      this.state.push[collection] = {
        since: cursor.since,
        after: page.endCursor,
        passMax: pageMax,
      };
      await this.persist();
    }

    return false;
  }

  // Pushes the companies of Zoho-less records first, then everything else.
  private async backfill(): Promise<boolean> {
    const backfill = this.state.backfill;

    if (!backfill) {
      return true;
    }

    backfill.opportunities ??= {
      after: null,
      done: !this.dealsEnabled(),
    };

    for (const collection of [
      'companies',
      'people',
      'opportunities',
    ] as const) {
      const cursor = backfill[collection] as BackfillCursor;

      if (collection === 'opportunities' && !this.dealsEnabled()) {
        cursor.done = true;
      }

      while (!cursor.done && !this.outOfTime()) {
        const page = await this.deps.twenty.pageUnlinked<AnyTwentyRecord>(
          collection,
          cursor.after,
          PUSH_PAGE_SIZE,
        );

        if (collection === 'companies') {
          await this.pushCompanies(page.records, {
            includeUnchanged: true,
            skipAutoCreated: true,
          });
        } else if (collection === 'people') {
          await this.pushPeople(page.records, {
            includeUnchanged: true,
            skipAutoCreated: true,
          });
        } else {
          await this.pushOpportunities(page.records, {
            includeUnchanged: true,
          });
        }

        // Records left behind (skipped or refused) stay unlinked; the cursor
        // moves past them so the backfill always ends.
        cursor.after = page.hasNextPage ? page.endCursor : null;
        cursor.done = !page.hasNextPage;
        await this.persist();
      }

      if (!cursor.done) {
        return false;
      }
    }

    this.state.backfill = null;
    await this.persist();

    return true;
  }

  private async pushCompanies(
    companies: TwentyCompany[],
    {
      includeUnchanged = false,
      skipAutoCreated = false,
    }: { includeUnchanged?: boolean; skipAutoCreated?: boolean } = {},
  ): Promise<Map<string, string>> {
    const zohoIdByCompanyId = new Map<string, string>();
    const fields = this.fieldsOf('Accounts');
    const toPush: {
      company: TwentyCompany;
      values: CompanyValues;
      fingerprint: string;
      extras: FieldValues;
      stored: FieldState | null;
      fieldRecon?: Reconciliation;
      zohoRecord?: Record<string, unknown> | null;
    }[] = [];

    for (const company of companies) {
      if (company.deletedAt) {
        continue;
      }

      const values = companyValuesFromTwenty(company);
      const fingerprint = companyFingerprint(values);
      const extras = twentyFieldValues(
        fields,
        company as Record<string, unknown>,
      );
      const stored = parseFieldState(company.zohoFieldState);

      if (company.zohoAccountId) {
        zohoIdByCompanyId.set(company.id, company.zohoAccountId);
      }
      if (
        fingerprint === company.zohoSyncHash &&
        !twentyFieldsChanged(fields, extras, stored) &&
        !(includeUnchanged && !company.zohoAccountId)
      ) {
        continue;
      }
      if (
        !companyIsPushable(values) ||
        (skipAutoCreated && !company.zohoAccountId && isAutoCreated(company))
      ) {
        continue;
      }
      toPush.push({ company, values, fingerprint, extras, stored });
    }

    const linked = toPush.filter(({ company }) => company.zohoAccountId);
    const current = new Map(
      (
        await this.deps.zoho.getByIds<ZohoAccount>(
          'Accounts',
          linked.map(({ company }) => company.zohoAccountId as string),
          this.zohoFieldsFor('Accounts'),
        )
      ).map((account) => [account.id, account]),
    );
    const updates: {
      item: (typeof toPush)[number];
      payload: Record<string, unknown>;
    }[] = [];
    const inserts: {
      item: (typeof toPush)[number];
      payload: Record<string, unknown>;
    }[] = [];
    const fingerprintOnly: (typeof toPush)[number][] = [];

    for (const item of toPush) {
      const zohoAccount = item.company.zohoAccountId
        ? current.get(item.company.zohoAccountId)
        : undefined;

      if (!zohoAccount) {
        item.fieldRecon = reconcileForInsert(fields, item.extras);
        item.zohoRecord = null;
        inserts.push({
          item,
          payload: {
            ...zohoAccountChanges(item.values, null),
            ...zohoDataFor(fields, item.fieldRecon.toZoho),
          },
        });
        continue;
      }

      const zohoValues = companyValuesFromZoho(zohoAccount);
      const zohoFingerprint = companyFingerprint(zohoValues);

      if (
        zohoFingerprint !== item.company.zohoSyncHash &&
        zohoFingerprint !== item.fingerprint &&
        timeOf(zohoAccount.Modified_Time) > timeOf(item.company.updatedAt)
      ) {
        // Zoho changed too, and later: the next pull brings its version.
        this.counts.conflicts += 1;
        continue;
      }

      item.fieldRecon = reconcileFields({
        fields,
        zoho: zohoFieldValues(fields, zohoAccount),
        twenty: item.extras,
        stored: item.stored,
        latest:
          timeOf(item.company.updatedAt) >= timeOf(zohoAccount.Modified_Time)
            ? 'twenty'
            : 'zoho',
      });
      item.zohoRecord = zohoAccount;
      this.counts.conflicts += item.fieldRecon.conflicts;

      const payload = {
        ...zohoAccountChanges(item.values, zohoValues),
        ...zohoDataFor(fields, item.fieldRecon.toZoho),
      };

      if (Object.keys(payload).length === 0) {
        fingerprintOnly.push(item);
      } else {
        updates.push({
          item,
          payload: { id: zohoAccount.id, ...payload },
        });
      }
    }

    const fieldsWriteBack = (item: (typeof toPush)[number]) =>
      item.fieldRecon
        ? this.pushedFieldsData(
            fields,
            item.stored,
            item.fieldRecon,
            item.zohoRecord ?? null,
          )
        : {};
    const writeBacks: PendingWrite<TwentyCompany>[] = fingerprintOnly.map(
      (item) => ({
        data: {
          id: item.company.id,
          ...fieldsWriteBack(item),
          zohoSyncHash: item.fingerprint,
          zohoSyncedAt: this.nowIso(),
        },
        label: cleanText(item.company.name),
        zohoId: item.company.zohoAccountId ?? null,
        twentyId: item.company.id,
      }),
    );

    const handle = (
      batch: { item: (typeof toPush)[number] }[],
      results: ZohoWriteResult[],
      inserting: boolean,
    ) => {
      batch.forEach(({ item }, index) => {
        const result = results[index];

        if (!result?.ok || !result.id) {
          this.recordError({
            direction: 'push',
            object: 'company',
            label: item.values.name,
            twentyId: item.company.id,
            zohoId: item.company.zohoAccountId || null,
            message:
              `Zoho refused the account (${result?.code ?? 'UNKNOWN'}): ${result?.message ?? ''}`.trim(),
          });

          return;
        }

        zohoIdByCompanyId.set(item.company.id, result.id);
        if (inserting && result.action !== 'update') {
          this.counts.zohoAccountsCreated += 1;
        } else {
          this.counts.zohoAccountsUpdated += 1;
        }
        writeBacks.push({
          data: {
            id: item.company.id,
            ...fieldsWriteBack(item),
            zohoAccountId: result.id,
            zohoSyncHash: item.fingerprint,
            zohoSyncedAt: this.nowIso(),
          },
          label: item.values.name,
          zohoId: result.id,
          twentyId: item.company.id,
        });
      });
    };

    for (let index = 0; index < updates.length; index += ZOHO_WRITE_BATCH) {
      const batch = updates.slice(index, index + ZOHO_WRITE_BATCH);

      handle(
        batch,
        await this.zohoWrite(
          () =>
            this.deps.zoho.update(
              'Accounts',
              batch.map((entry) => entry.payload),
            ),
          batch.length,
        ),
        false,
      );
    }
    for (let index = 0; index < inserts.length; index += ZOHO_WRITE_BATCH) {
      const batch = inserts.slice(index, index + ZOHO_WRITE_BATCH);

      handle(
        batch,
        await this.zohoWrite(
          () =>
            this.deps.zoho.upsert(
              'Accounts',
              batch.map((entry) => entry.payload),
              ['Account_Name'],
            ),
          batch.length,
        ),
        true,
      );
    }

    await this.writeTwenty('company', 'update', writeBacks, 'push');

    return zohoIdByCompanyId;
  }

  // Returns the Zoho contact id of each person that has one.
  private async pushPeople(
    people: TwentyPerson[],
    {
      includeUnchanged = false,
      skipAutoCreated = false,
    }: { includeUnchanged?: boolean; skipAutoCreated?: boolean } = {},
  ): Promise<Map<string, string>> {
    const zohoIdByPersonId = new Map<string, string>();
    const fields = this.fieldsOf('Contacts');

    const candidates = people.filter(
      (person) =>
        !person.deletedAt &&
        !(
          skipAutoCreated &&
          !cleanText(person.zohoContactId) &&
          isAutoCreated(person)
        ),
    );

    // A person's company must exist in Zoho before the person can point at it.
    const companiesToLink = [
      ...new Set(
        candidates
          .filter(
            (person) =>
              person.companyId && !cleanText(person.company?.zohoAccountId),
          )
          .map((person) => person.companyId as string),
      ),
    ];

    if (companiesToLink.length > 0) {
      const companies =
        await this.deps.twenty.findCompaniesByIds(companiesToLink);
      const zohoIds = await this.pushCompanies(companies, {
        includeUnchanged: true,
      });

      for (const person of candidates) {
        const zohoId = person.companyId
          ? zohoIds.get(person.companyId)
          : undefined;

        if (zohoId) {
          person.company = {
            id: person.companyId as string,
            zohoAccountId: zohoId,
          };
        }
      }
    }

    const toPush: {
      person: TwentyPerson;
      values: PersonValues;
      fingerprint: string;
      extras: FieldValues;
      stored: FieldState | null;
      fieldRecon?: Reconciliation;
      zohoRecord?: Record<string, unknown> | null;
    }[] = [];

    for (const person of candidates) {
      const values = personValuesFromTwenty(person);
      const fingerprint = personFingerprint(values);
      const extras = twentyFieldValues(fields, person as Record<string, unknown>);
      const stored = parseFieldState(person.zohoFieldState);

      if (cleanText(person.zohoContactId)) {
        zohoIdByPersonId.set(person.id, cleanText(person.zohoContactId));
      }
      if (
        fingerprint === person.zohoSyncHash &&
        !twentyFieldsChanged(fields, extras, stored) &&
        !(includeUnchanged && !person.zohoContactId)
      ) {
        continue;
      }
      if (!personIsPushable(values)) {
        continue;
      }
      if (person.companyId && !values.zohoAccountId) {
        // Its company could not be created in Zoho (already reported).
        continue;
      }
      toPush.push({ person, values, fingerprint, extras, stored });
    }

    const linked = toPush.filter(({ person }) => person.zohoContactId);
    const current = new Map(
      (
        await this.deps.zoho.getByIds<ZohoContact>(
          'Contacts',
          linked.map(({ person }) => person.zohoContactId as string),
          this.zohoFieldsFor('Contacts'),
        )
      ).map((contact) => [contact.id, contact]),
    );
    const updates: {
      item: (typeof toPush)[number];
      payload: Record<string, unknown>;
    }[] = [];
    const inserts: {
      item: (typeof toPush)[number];
      payload: Record<string, unknown>;
    }[] = [];
    const writeBacks: PendingWrite<TwentyPerson>[] = [];
    const fieldsWriteBack = (item: (typeof toPush)[number]) =>
      item.fieldRecon
        ? this.pushedFieldsData(
            fields,
            item.stored,
            item.fieldRecon,
            item.zohoRecord ?? null,
          )
        : {};

    for (const item of toPush) {
      const zohoContact = item.person.zohoContactId
        ? current.get(item.person.zohoContactId)
        : undefined;

      if (!zohoContact) {
        item.fieldRecon = reconcileForInsert(fields, item.extras);
        item.zohoRecord = null;
        inserts.push({
          item,
          payload: {
            ...zohoContactChanges(item.values, null),
            ...zohoDataFor(fields, item.fieldRecon.toZoho),
          },
        });
        continue;
      }

      const zohoValues = personValuesFromZoho(
        zohoContact,
        this.deps.config.defaultPhoneCountry,
      );
      const zohoFingerprint = personFingerprint(zohoValues);

      if (
        zohoFingerprint !== item.person.zohoSyncHash &&
        zohoFingerprint !== item.fingerprint &&
        timeOf(zohoContact.Modified_Time) > timeOf(item.person.updatedAt)
      ) {
        this.counts.conflicts += 1;
        continue;
      }

      item.fieldRecon = reconcileFields({
        fields,
        zoho: zohoFieldValues(fields, zohoContact),
        twenty: item.extras,
        stored: item.stored,
        latest:
          timeOf(item.person.updatedAt) >= timeOf(zohoContact.Modified_Time)
            ? 'twenty'
            : 'zoho',
      });
      item.zohoRecord = zohoContact;
      this.counts.conflicts += item.fieldRecon.conflicts;

      const payload = {
        ...zohoContactChanges(item.values, zohoValues),
        ...zohoDataFor(fields, item.fieldRecon.toZoho),
      };

      if (Object.keys(payload).length === 0) {
        writeBacks.push({
          data: {
            id: item.person.id,
            ...fieldsWriteBack(item),
            zohoSyncHash: item.fingerprint,
            zohoSyncedAt: this.nowIso(),
          },
          label: personLabel(item.values),
          zohoId: zohoContact.id,
          twentyId: item.person.id,
        });
      } else {
        updates.push({
          item,
          payload: { id: zohoContact.id, ...payload },
        });
      }
    }

    const handle = (
      batch: { item: (typeof toPush)[number] }[],
      results: ZohoWriteResult[],
      inserting: boolean,
    ) => {
      batch.forEach(({ item }, index) => {
        const result = results[index];

        if (!result?.ok || !result.id) {
          this.recordError({
            direction: 'push',
            object: 'person',
            label: personLabel(item.values),
            twentyId: item.person.id,
            zohoId: item.person.zohoContactId || null,
            message:
              `Zoho refused the contact (${result?.code ?? 'UNKNOWN'}): ${result?.message ?? ''}`.trim(),
          });

          return;
        }

        if (inserting && result.action !== 'update') {
          this.counts.zohoContactsCreated += 1;
        } else {
          this.counts.zohoContactsUpdated += 1;
        }
        zohoIdByPersonId.set(item.person.id, result.id);
        writeBacks.push({
          data: {
            id: item.person.id,
            ...fieldsWriteBack(item),
            zohoContactId: result.id,
            zohoSyncHash: item.fingerprint,
            zohoSyncedAt: this.nowIso(),
          },
          label: personLabel(item.values),
          zohoId: result.id,
          twentyId: item.person.id,
        });
      });
    };

    for (let index = 0; index < updates.length; index += ZOHO_WRITE_BATCH) {
      const batch = updates.slice(index, index + ZOHO_WRITE_BATCH);

      handle(
        batch,
        await this.zohoWrite(
          () =>
            this.deps.zoho.update(
              'Contacts',
              batch.map((entry) => entry.payload),
            ),
          batch.length,
        ),
        false,
      );
    }
    for (let index = 0; index < inserts.length; index += ZOHO_WRITE_BATCH) {
      const batch = inserts.slice(index, index + ZOHO_WRITE_BATCH);

      handle(
        batch,
        await this.zohoWrite(
          () =>
            this.deps.zoho.upsert(
              'Contacts',
              batch.map((entry) => entry.payload),
              ['Email'],
            ),
          batch.length,
        ),
        true,
      );
    }

    await this.writeTwenty('person', 'update', writeBacks, 'push');

    return zohoIdByPersonId;
  }

  // A failed batch call (as opposed to per-record refusals) marks every record
  // of the batch as failed; credentials problems stop the run.
  private async zohoWrite(
    call: () => Promise<ZohoWriteResult[]>,
    size: number,
  ): Promise<ZohoWriteResult[]> {
    try {
      return await call();
    } catch (error) {
      if (error instanceof ZohoAuthError) {
        throw error;
      }

      return Array.from({ length: size }, () => ({
        ok: false,
        id: null,
        action: null,
        code: 'REQUEST_FAILED',
        message: (error as Error).message,
      }));
    }
  }
}
