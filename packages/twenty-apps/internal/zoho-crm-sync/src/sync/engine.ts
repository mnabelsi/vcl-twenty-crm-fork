import { pullsFromZoho, pushesToZoho, type SyncConfig } from 'src/sync/config';
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
  type TwentyPerson,
  ZOHO_ACCOUNT_FIELDS,
  ZOHO_CONTACT_FIELDS,
  type ZohoAccount,
  type ZohoContact,
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
  emptyCounts,
  type KeyValueStore,
  type PullCursor,
  type PushCursor,
  type RunCounts,
  saveState,
  type SyncErrorEntry,
  type SyncState,
} from 'src/sync/state';
import { TwentyApiError, type TwentyGateway } from 'src/twenty/gateway';
import {
  ZohoAuthError,
  type ZohoClient,
  type ZohoWriteResult,
} from 'src/zoho/client';

export type ZohoApi = Pick<
  ZohoClient,
  'listModified' | 'getByIds' | 'update' | 'upsert'
>;
export type TwentyApi = Pick<
  TwentyGateway,
  | 'findPeopleByZohoIds'
  | 'findPeopleByEmails'
  | 'findPeopleByCompanyIds'
  | 'findCompaniesByZohoIds'
  | 'findCompaniesByIds'
  | 'listUnlinkedCompanies'
  | 'listWorkspaceMembers'
  | 'companyIndustryValues'
  | 'pageUpdatedSince'
  | 'pageUnlinked'
  | 'createPeople'
  | 'updatePeople'
  | 'createCompanies'
  | 'updateCompanies'
>;

export type EngineDependencies = {
  zoho: ZohoApi;
  twenty: TwentyApi;
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
  state: SyncState;
};

type Decision = 'none' | 'store-fingerprint' | 'apply-zoho' | 'keep-twenty';

const ZOHO_PAGE_LIMIT = 10;
const PUSH_PAGE_SIZE = 100;
const ZOHO_WRITE_BATCH = 100;

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

type PendingWrite<T> = {
  data: Record<string, unknown>;
  label: string;
  zohoId: string | null;
  twentyId: string | null;
  onWritten?: (record: T) => void;
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
  private memberIdByEmail: Map<string, string> | null = null;
  private industryByKey: Map<string, string> | null | undefined;
  private moreWorkPending = false;

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
  }: { startBackfill?: boolean } = {}): Promise<EngineResult> {
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
      };
    }
    await this.persist();

    if (pullsFromZoho(direction)) {
      const accountsDone = await this.pullModule('Accounts');
      const contactsDone = accountsDone && (await this.pullModule('Contacts'));

      if (!accountsDone || !contactsDone) {
        this.moreWorkPending = true;
      }
    }

    if (pushesToZoho(direction) && !this.outOfTime()) {
      const companiesDone = await this.pushChanged('companies');
      const peopleDone = companiesDone && (await this.pushChanged('people'));

      if (!companiesDone || !peopleDone) {
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

    await this.persist();

    return {
      counts: this.counts,
      errors: this.errors,
      moreWorkPending: this.moreWorkPending,
      initialImportDone:
        this.state.pull.accounts.caughtUp && this.state.pull.contacts.caughtUp,
      backfillRunning: this.state.backfill !== null,
      state: this.state,
    };
  }

  // -------------------------------------------------------------------------
  // Zoho to Twenty
  // -------------------------------------------------------------------------

  // Returns true once Zoho has nothing newer left to read.
  private async pullModule(module: 'Accounts' | 'Contacts'): Promise<boolean> {
    const key = module === 'Accounts' ? 'accounts' : 'contacts';

    while (!this.outOfTime()) {
      const cursor: PullCursor = this.state.pull[key];
      // One second of overlap: records changed in the same second as the last
      // one handled are read again rather than missed. Re-reading is harmless.
      const since = cursor.since
        ? toZohoTime(timeOf(cursor.since) - 1000)
        : null;
      const { records, moreRecords } =
        module === 'Accounts'
          ? await this.deps.zoho.listModified<ZohoAccount>(
              module,
              ZOHO_ACCOUNT_FIELDS,
              {
                since,
                page: cursor.page,
              },
            )
          : await this.deps.zoho.listModified<ZohoContact>(
              module,
              ZOHO_CONTACT_FIELDS,
              {
                since,
                page: cursor.page,
              },
            );

      if (records.length > 0) {
        if (module === 'Accounts') {
          await this.importAccounts(records as ZohoAccount[]);
        } else {
          await this.importContacts(records as ZohoContact[]);
        }
      }

      const last = records[records.length - 1]?.Modified_Time ?? null;
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
      const byHost = new Map<string, TwentyCompany>();
      const byName = new Map<string, TwentyCompany>();

      for (const company of await this.deps.twenty.listUnlinkedCompanies()) {
        const host = websiteHost(company.domainName?.primaryLinkUrl);
        const name = companyNameKey(company.name);

        if (host && !byHost.has(host)) {
          byHost.set(host, company);
        }
        if (name && !byName.has(name)) {
          byName.set(name, company);
        }
      }
      this.unlinkedCompanies = { byHost, byName };
    }

    return this.unlinkedCompanies;
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
        if (decision === 'store-fingerprint') {
          updates.push({
            data: {
              id: existing.id,
              zohoSyncHash: zohoFingerprint,
              zohoSyncedAt: syncedAt,
            },
            label,
            zohoId: account.id,
            twentyId: existing.id,
          });
        } else if (decision === 'apply-zoho') {
          updates.push({
            data: {
              id: existing.id,
              ...companyDataForTwenty(zohoValues, existing),
              zohoSyncHash: zohoFingerprint,
              zohoSyncedAt: syncedAt,
            },
            label,
            zohoId: account.id,
            twentyId: existing.id,
            onWritten: () => (this.counts.companiesUpdated += 1),
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
            ...(match.accountOwnerId ? {} : await this.ownerData(account)),
            zohoAccountId: account.id,
            zohoSyncHash: zohoFingerprint,
            zohoSyncedAt: syncedAt,
          },
          label,
          zohoId: account.id,
          twentyId: match.id,
          onWritten: () => (this.counts.companiesLinked += 1),
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
        ZOHO_ACCOUNT_FIELDS,
      );

      if (accounts.length > 0) {
        await this.importAccounts(accounts);
      }
    }

    return this.companyIdByZohoId;
  }

  private async importContacts(contacts: ZohoContact[]): Promise<void> {
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
        if (decision === 'store-fingerprint') {
          updates.push({
            data: {
              id: existing.id,
              zohoSyncHash: zohoFingerprint,
              zohoSyncedAt: syncedAt,
            },
            label,
            zohoId: contact.id,
            twentyId: existing.id,
          });
        } else if (decision === 'apply-zoho') {
          updates.push({
            data: {
              id: existing.id,
              ...personDataForTwenty(zohoValues, existing),
              ...this.companyChange(zohoValues, twentyValues, zohoCompanyId),
              zohoSyncHash: zohoFingerprint,
              zohoSyncedAt: syncedAt,
            },
            label,
            zohoId: contact.id,
            twentyId: existing.id,
            onWritten: () => (this.counts.peopleUpdated += 1),
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
  // changed; a Twenty company with no Zoho link is otherwise left alone.
  private companyChange(
    values: PersonValues,
    twentyValues: PersonValues,
    zohoCompanyId: string | null,
  ): Record<string, unknown> {
    if (values.zohoAccountId === twentyValues.zohoAccountId) {
      return {};
    }
    if (values.zohoAccountId === '') {
      return { companyId: null };
    }

    return zohoCompanyId ? { companyId: zohoCompanyId } : {};
  }

  // Writes in batches; when a batch fails, each record is retried alone so
  // one bad record (an invalid phone number, say) does not block the others.
  private async writeTwenty<T extends { id: string }>(
    object: 'person' | 'company',
    operation: 'create' | 'update',
    writes: PendingWrite<T>[],
    direction: 'pull' | 'push' = 'pull',
  ): Promise<void> {
    if (writes.length === 0) {
      return;
    }

    const write = (data: Record<string, unknown>[]): Promise<T[]> => {
      const twenty = this.deps.twenty;

      if (object === 'person') {
        return (
          operation === 'create'
            ? twenty.createPeople(data)
            : twenty.updatePeople(data)
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
    } catch {
      // fall through to one by one
    }

    for (const pending of writes) {
      try {
        const [record] = await write([pending.data]);

        pending.onWritten?.(record);
      } catch (error) {
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
          } catch {
            // report the original error below
          }
        }

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
  private async pushChanged(
    collection: 'companies' | 'people',
  ): Promise<boolean> {
    while (!this.outOfTime()) {
      const cursor = this.state.push[collection] as PushCursor;
      const page = await this.deps.twenty.pageUpdatedSince<
        TwentyCompany & TwentyPerson
      >(collection, cursor.since, cursor.after, PUSH_PAGE_SIZE);

      if (collection === 'companies') {
        await this.pushCompanies(page.records, {
          skipAutoCreated: true,
        });
      } else {
        await this.pushPeople(page.records, { skipAutoCreated: true });
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

    for (const collection of ['companies', 'people'] as const) {
      const cursor = backfill[collection];

      while (!cursor.done && !this.outOfTime()) {
        const page = await this.deps.twenty.pageUnlinked<
          TwentyCompany & TwentyPerson
        >(collection, cursor.after, PUSH_PAGE_SIZE);

        if (collection === 'companies') {
          await this.pushCompanies(page.records, {
            includeUnchanged: true,
            skipAutoCreated: true,
          });
        } else {
          await this.pushPeople(page.records, {
            includeUnchanged: true,
            skipAutoCreated: true,
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
    const toPush: {
      company: TwentyCompany;
      values: CompanyValues;
      fingerprint: string;
    }[] = [];

    for (const company of companies) {
      if (company.deletedAt) {
        continue;
      }

      const values = companyValuesFromTwenty(company);
      const fingerprint = companyFingerprint(values);

      if (company.zohoAccountId) {
        zohoIdByCompanyId.set(company.id, company.zohoAccountId);
      }
      if (
        fingerprint === company.zohoSyncHash &&
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
      toPush.push({ company, values, fingerprint });
    }

    const linked = toPush.filter(({ company }) => company.zohoAccountId);
    const current = new Map(
      (
        await this.deps.zoho.getByIds<ZohoAccount>(
          'Accounts',
          linked.map(({ company }) => company.zohoAccountId as string),
          ZOHO_ACCOUNT_FIELDS,
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
        inserts.push({
          item,
          payload: zohoAccountChanges(item.values, null),
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

      const payload = zohoAccountChanges(item.values, zohoValues);

      if (Object.keys(payload).length === 0) {
        fingerprintOnly.push(item);
      } else {
        updates.push({
          item,
          payload: { id: zohoAccount.id, ...payload },
        });
      }
    }

    const writeBacks: PendingWrite<TwentyCompany>[] = fingerprintOnly.map(
      ({ company, fingerprint }) => ({
        data: {
          id: company.id,
          zohoSyncHash: fingerprint,
          zohoSyncedAt: this.nowIso(),
        },
        label: cleanText(company.name),
        zohoId: company.zohoAccountId ?? null,
        twentyId: company.id,
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

  private async pushPeople(
    people: TwentyPerson[],
    {
      includeUnchanged = false,
      skipAutoCreated = false,
    }: { includeUnchanged?: boolean; skipAutoCreated?: boolean } = {},
  ): Promise<void> {
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
    }[] = [];

    for (const person of candidates) {
      const values = personValuesFromTwenty(person);
      const fingerprint = personFingerprint(values);

      if (
        fingerprint === person.zohoSyncHash &&
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
      toPush.push({ person, values, fingerprint });
    }

    const linked = toPush.filter(({ person }) => person.zohoContactId);
    const current = new Map(
      (
        await this.deps.zoho.getByIds<ZohoContact>(
          'Contacts',
          linked.map(({ person }) => person.zohoContactId as string),
          ZOHO_CONTACT_FIELDS,
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

    for (const item of toPush) {
      const zohoContact = item.person.zohoContactId
        ? current.get(item.person.zohoContactId)
        : undefined;

      if (!zohoContact) {
        inserts.push({
          item,
          payload: zohoContactChanges(item.values, null),
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

      const payload = zohoContactChanges(item.values, zohoValues);

      if (Object.keys(payload).length === 0) {
        writeBacks.push({
          data: {
            id: item.person.id,
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
        writeBacks.push({
          data: {
            id: item.person.id,
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
