// Everything the sync remembers between runs lives in the application's
// key-value store: where each direction stopped, the status shown on the
// page, and a lock so two runs never work at the same time.

export type KeyValueStore = {
  get: <T>(key: string) => Promise<T | null>;
  set: (key: string, value: unknown) => Promise<void>;
  delete: (key: string) => Promise<unknown>;
};

// Zoho records are read oldest change first. `since` is the modified time of
// the last record handled; `page` only moves past 1 when more than a page of
// records share that same second.
export type PullCursor = {
  since: string | null;
  page: number;
  caughtUp: boolean;
};

// Twenty records are read by update time from `since`, the point the current
// pass started from, resuming at `after` (a Twenty page cursor).
export type PushCursor = {
  since: string;
  after: string | null;
  passMax: string | null;
};

export type BackfillCursor = { after: string | null; done: boolean };

export type SyncState = {
  version: 1;
  pull: { accounts: PullCursor; contacts: PullCursor };
  push: { companies: PushCursor | null; people: PushCursor | null };
  backfill: { companies: BackfillCursor; people: BackfillCursor } | null;
};

export type RunCounts = {
  companiesCreated: number;
  companiesUpdated: number;
  companiesLinked: number;
  peopleCreated: number;
  peopleUpdated: number;
  peopleLinked: number;
  zohoAccountsCreated: number;
  zohoAccountsUpdated: number;
  zohoContactsCreated: number;
  zohoContactsUpdated: number;
  conflicts: number;
  errors: number;
};

export type SyncErrorEntry = {
  at: string;
  direction: 'pull' | 'push' | 'run';
  object: 'company' | 'person' | 'run';
  label: string;
  twentyId: string | null;
  zohoId: string | null;
  message: string;
};

export type SyncStatus = {
  running: boolean;
  lastRunStartedAt: string | null;
  lastRunFinishedAt: string | null;
  lastRunOutcome: 'ok' | 'partial' | 'failed' | 'skipped' | null;
  lastRunMessage: string | null;
  lastRunCounts: RunCounts | null;
  totals: RunCounts;
  initialImportDone: boolean;
  moreWorkPending: boolean;
  backfillRunning: boolean;
  zohoOrganization: string | null;
  recentErrors: SyncErrorEntry[];
};

export const STATE_KEY = 'zoho-sync:state';
export const STATUS_KEY = 'zoho-sync:status';
export const LOCK_KEY = 'zoho-sync:lock';
export const TOKEN_KEY = 'zoho-sync:access-token';
export const REQUEST_KEY = 'zoho-sync:requested-mode';
export const CONNECTED_AT_KEY = 'zoho-sync:connected-at';

const MAX_RECENT_ERRORS = 50;

export const emptyCounts = (): RunCounts => ({
  companiesCreated: 0,
  companiesUpdated: 0,
  companiesLinked: 0,
  peopleCreated: 0,
  peopleUpdated: 0,
  peopleLinked: 0,
  zohoAccountsCreated: 0,
  zohoAccountsUpdated: 0,
  zohoContactsCreated: 0,
  zohoContactsUpdated: 0,
  conflicts: 0,
  errors: 0,
});

export const addCounts = (a: RunCounts, b: RunCounts): RunCounts =>
  Object.fromEntries(
    Object.keys(a).map((key) => [
      key,
      a[key as keyof RunCounts] + b[key as keyof RunCounts],
    ]),
  ) as RunCounts;

const freshPullCursor = (): PullCursor => ({
  since: null,
  page: 1,
  caughtUp: false,
});

export const initialState = (): SyncState => ({
  version: 1,
  pull: { accounts: freshPullCursor(), contacts: freshPullCursor() },
  push: { companies: null, people: null },
  backfill: null,
});

export const initialStatus = (): SyncStatus => ({
  running: false,
  lastRunStartedAt: null,
  lastRunFinishedAt: null,
  lastRunOutcome: null,
  lastRunMessage: null,
  lastRunCounts: null,
  totals: emptyCounts(),
  initialImportDone: false,
  moreWorkPending: false,
  backfillRunning: false,
  zohoOrganization: null,
  recentErrors: [],
});

export const loadState = async (store: KeyValueStore): Promise<SyncState> =>
  (await store.get<SyncState>(STATE_KEY)) ?? initialState();

export const saveState = (store: KeyValueStore, state: SyncState) =>
  store.set(STATE_KEY, state);

export const loadStatus = async (
  store: KeyValueStore,
): Promise<SyncStatus> => ({
  ...initialStatus(),
  ...((await store.get<SyncStatus>(STATUS_KEY)) ?? {}),
});

export const updateStatus = async (
  store: KeyValueStore,
  change: (status: SyncStatus) => SyncStatus,
): Promise<SyncStatus> => {
  const next = change(await loadStatus(store));

  next.recentErrors = next.recentErrors.slice(0, MAX_RECENT_ERRORS);
  await store.set(STATUS_KEY, next);

  return next;
};

export const resetPull = (state: SyncState): SyncState => ({
  ...state,
  pull: { accounts: freshPullCursor(), contacts: freshPullCursor() },
});

export const startBackfill = (state: SyncState): SyncState => ({
  ...state,
  backfill: {
    companies: { after: null, done: false },
    people: { after: null, done: false },
  },
});

type Lock = { owner: string; until: number };

// The store has no compare-and-set, so the lock is written then read back:
// of two runs starting together, the one whose write landed last proceeds.
export const acquireLock = async (
  store: KeyValueStore,
  owner: string,
  ttlMs: number,
  now = Date.now(),
): Promise<boolean> => {
  const current = await store.get<Lock>(LOCK_KEY);

  if (current && current.until > now && current.owner !== owner) {
    return false;
  }

  await store.set(LOCK_KEY, { owner, until: now + ttlMs });

  const confirmed = await store.get<Lock>(LOCK_KEY);

  return confirmed?.owner === owner;
};

export const releaseLock = async (
  store: KeyValueStore,
  owner: string,
): Promise<void> => {
  const current = await store.get<Lock>(LOCK_KEY);

  if (current?.owner === owner) {
    await store.delete(LOCK_KEY);
  }
};

export const isLocked = async (
  store: KeyValueStore,
  now = Date.now(),
): Promise<boolean> => {
  const current = await store.get<Lock>(LOCK_KEY);

  return Boolean(current && current.until > now);
};
