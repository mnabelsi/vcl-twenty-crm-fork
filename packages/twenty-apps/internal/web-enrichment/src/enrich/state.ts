// What the app remembers between runs, in the application key-value store.

export type KeyValueStore = {
  get: <T>(key: string) => Promise<T | null>;
  set: (key: string, value: unknown) => Promise<void>;
  delete: (key: string) => Promise<unknown>;
};

export type EnrichmentCounts = {
  websitesFromEmails: number;
  websitesFound: number;
  websitesToReview: number;
  websitesShared: number;
  websitesNotFound: number;
  profilesFound: number;
  profilesToReview: number;
  profilesNotFound: number;
  notEnoughInfo: number;
  searches: number;
  errors: number;
};

export const emptyCounts = (): EnrichmentCounts => ({
  websitesFromEmails: 0,
  websitesFound: 0,
  websitesToReview: 0,
  websitesShared: 0,
  websitesNotFound: 0,
  profilesFound: 0,
  profilesToReview: 0,
  profilesNotFound: 0,
  notEnoughInfo: 0,
  searches: 0,
  errors: 0,
});

export type StopReason =
  | 'done'
  | 'out-of-time'
  | 'run-share-used'
  | 'daily-limit'
  | 'no-search'
  | 'search-unavailable'
  | 'engines-blocked'
  | 'rate-limited';

export type RunStatus = {
  finishedAt: string;
  stopReason: StopReason;
  message: string;
  counts: EnrichmentCounts;
  searchesToday: number;
  errors: string[];
};

const LOCK_KEY = 'web-enrichment:lock';
const STATUS_KEY = 'web-enrichment:status';
const SEARCHES_KEY = 'web-enrichment:searches';

type DailySearches = { day: string; count: number };

const dayOf = (epochMs: number): string =>
  new Date(epochMs).toISOString().slice(0, 10);

export const loadSearchesToday = async (
  store: KeyValueStore,
  now: number,
): Promise<number> => {
  const value = await store.get<DailySearches>(SEARCHES_KEY);

  return value?.day === dayOf(now) ? value.count : 0;
};

export const saveSearchesToday = async (
  store: KeyValueStore,
  now: number,
  count: number,
): Promise<void> => {
  await store.set(SEARCHES_KEY, { day: dayOf(now), count });
};

export const loadStatus = (store: KeyValueStore): Promise<RunStatus | null> =>
  store.get<RunStatus>(STATUS_KEY);

export const saveStatus = (
  store: KeyValueStore,
  status: RunStatus,
): Promise<void> => store.set(STATUS_KEY, status);

type Lock = { owner: string; until: number };

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
