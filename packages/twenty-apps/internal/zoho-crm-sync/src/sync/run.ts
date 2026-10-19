import { readSyncConfig } from 'src/sync/config';
import { SyncEngine, type TwentyApi, type ZohoApi } from 'src/sync/engine';
import { loadSchema, type SyncSchema } from 'src/sync/fields/schema';
import {
  acquireLock,
  addCounts,
  CONNECTED_AT_KEY,
  type KeyValueStore,
  loadState,
  releaseLock,
  REQUEST_KEY,
  resetPull,
  saveState,
  type SyncErrorEntry,
  type SyncStatus,
  updateStatus,
} from 'src/sync/state';
import { sealedTokenCache } from 'src/sync/token-cache';
import type { TwentyMetadataApi } from 'src/twenty/metadata';
import { ZohoAuthError, ZohoClient } from 'src/zoho/client';

export type SyncMode = 'incremental' | 'full-pull' | 'push-unlinked';

export type SyncRunResult = {
  outcome: SyncStatus['lastRunOutcome'];
  message: string;
  continueSoon: boolean;
  // Set when the run should be tried again shortly rather than at the next
  // scheduled time.
  retryAfterMs?: number;
  status: SyncStatus | null;
};

// Twenty keeps serving the previous variable values for a few seconds after
// they change, so runs right after "Connect" may still see the old token.
const CONNECTION_SETTLING_MS = 2 * 60 * 1000;
const CONNECTION_RETRY_MS = 15 * 1000;
const CONNECTING_MESSAGE =
  'Connecting to Zoho: the first sync starts in a moment.';
// Twenty counts an app's requests per minute.
const RATE_LIMIT_RETRY_MS = 60 * 1000;
const RATE_LIMITED_MESSAGE =
  "Twenty's limit on requests from apps was reached: the sync continues in a minute.";

type RunOptions = {
  store: KeyValueStore;
  twenty: TwentyApi;
  metadata?: TwentyMetadataApi | null;
  // Built from the configuration; replaceable in tests.
  createZoho?: (
    config: NonNullable<ReturnType<typeof readSyncConfig>['config']>,
  ) => ZohoApi & {
    organizationName?: () => Promise<string | null>;
  };
  budgetMs: number;
  lockTtlMs: number;
  now?: () => number;
};

const NOTHING_DONE = 'Everything was already in step.';

const summary = (counts: SyncStatus['totals']): string => {
  const parts = [
    [
      counts.companiesCreated +
        counts.peopleCreated +
        counts.opportunitiesCreated,
      'created in Twenty',
    ],
    [
      counts.companiesUpdated +
        counts.peopleUpdated +
        counts.opportunitiesUpdated,
      'updated in Twenty',
    ],
    [
      counts.companiesLinked + counts.peopleLinked,
      'matched to existing Twenty records',
    ],
    [
      counts.zohoAccountsCreated +
        counts.zohoContactsCreated +
        counts.zohoDealsCreated,
      'created in Zoho',
    ],
    [
      counts.zohoAccountsUpdated +
        counts.zohoContactsUpdated +
        counts.zohoDealsUpdated,
      'updated in Zoho',
    ],
    [counts.fieldsCreated, 'Twenty fields added for Zoho fields'],
    [counts.conflicts, 'edited on both sides (latest edit kept)'],
    [counts.errors, 'could not be synced'],
  ].filter(([count]) => (count as number) > 0);

  return parts.length === 0
    ? NOTHING_DONE
    : `${parts.map(([count, text]) => `${count} ${text}`).join(', ')}.`;
};

// Remembers a full re-import or a backfill asked for from the page; the next
// run that gets the lock carries it out, even if one was running at the time.
export const requestMode = async (
  store: KeyValueStore,
  mode: SyncMode,
): Promise<void> => {
  if (mode !== 'incremental') {
    await store.set(REQUEST_KEY, mode);
  }
};

const fieldSummaryOf = (
  schema: SyncSchema | null,
  warning: string | null,
): SyncStatus['fieldSummary'] =>
  schema
    ? {
        synced: Object.fromEntries(
          Object.entries(schema.modules).map(([module, entry]) => [
            module,
            entry?.fields.length ?? 0,
          ]),
        ),
        skipped: schema.skipped.map((entry) => ({
          module: entry.module,
          field: entry.label || entry.zohoField,
          reason: entry.reason,
        })),
        warning,
      }
    : warning
      ? { synced: {}, skipped: [], warning }
      : null;

export const runSync = async ({
  store,
  twenty,
  metadata,
  createZoho,
  budgetMs,
  lockTtlMs,
  now = Date.now,
}: RunOptions): Promise<SyncRunResult> => {
  const { config, missing } = readSyncConfig();
  const connectedAt = await store.get<number>(CONNECTED_AT_KEY);
  const settling =
    connectedAt !== null && now() - connectedAt < CONNECTION_SETTLING_MS;

  if (!config && settling) {
    const status = await updateStatus(store, (current) => ({
      ...current,
      running: false,
      lastRunOutcome: 'skipped',
      lastRunMessage: CONNECTING_MESSAGE,
    }));

    return {
      outcome: 'skipped',
      message: CONNECTING_MESSAGE,
      continueSoon: false,
      retryAfterMs: CONNECTION_RETRY_MS,
      status,
    };
  }

  if (!config) {
    const message = `Not configured yet: fill in ${missing.join(', ')} in the app settings, or connect with a grant code.`;
    const status = await updateStatus(store, (current) => ({
      ...current,
      running: false,
      lastRunOutcome: 'skipped',
      lastRunMessage: message,
    }));

    return { outcome: 'skipped', message, continueSoon: false, status };
  }

  if (config.direction === 'PAUSED') {
    const message = 'The sync is paused (Sync direction in the app settings).';
    const status = await updateStatus(store, (current) => ({
      ...current,
      running: false,
      lastRunOutcome: 'skipped',
      lastRunMessage: message,
    }));

    return { outcome: 'skipped', message, continueSoon: false, status };
  }

  const owner = `${now()}-${Math.random().toString(36).slice(2)}`;

  if (!(await acquireLock(store, owner, lockTtlMs, now()))) {
    return {
      outcome: 'skipped',
      message: 'Another sync run is still working; this one stepped aside.',
      continueSoon: false,
      status: null,
    };
  }

  const startedAt = new Date(now()).toISOString();

  try {
    await updateStatus(store, (current) => ({
      ...current,
      running: true,
      lastRunStartedAt: startedAt,
    }));

    let state = await loadState(store);
    const requested = await store.get<SyncMode>(REQUEST_KEY);

    if (requested) {
      await store.delete(REQUEST_KEY);
    }
    if (requested === 'full-pull') {
      state = resetPull(state);
      await saveState(store, state);
    }

    const zoho = createZoho
      ? createZoho(config)
      : new ZohoClient(
          config,
          sealedTokenCache(store, config.clientSecret, config.refreshToken),
        );

    // A new connection may carry new scopes: read the field list again.
    const schema = await loadSchema(store);
    const refreshFields =
      requested === 'full-pull' ||
      (connectedAt !== null && connectedAt > (schema?.refreshedAt ?? 0));

    const engine = new SyncEngine(
      {
        zoho,
        twenty,
        metadata: metadata ?? null,
        store,
        config,
        now,
        budgetMs,
      },
      state,
    );

    let result;

    try {
      result = await engine.run({
        startBackfill: requested === 'push-unlinked',
        refreshFields,
      });
    } catch (error) {
      if (requested) {
        // Keep the requested action for the next run.
        await store.set(REQUEST_KEY, requested);
      }

      if (error instanceof ZohoAuthError && settling) {
        const status = await updateStatus(store, (current) => ({
          ...current,
          running: false,
          lastRunOutcome: 'skipped',
          lastRunMessage: CONNECTING_MESSAGE,
        }));

        return {
          outcome: 'skipped',
          message: CONNECTING_MESSAGE,
          continueSoon: false,
          retryAfterMs: CONNECTION_RETRY_MS,
          status,
        };
      }

      const message =
        error instanceof ZohoAuthError
          ? error.message
          : `The sync stopped: ${(error as Error).message}`;
      const status = await updateStatus(store, (current) => ({
        ...current,
        running: false,
        lastRunFinishedAt: new Date(now()).toISOString(),
        lastRunOutcome: 'failed',
        lastRunMessage: message,
        recentErrors: [
          {
            at: new Date(now()).toISOString(),
            direction: 'run',
            object: 'run',
            label: 'Sync run',
            twentyId: null,
            zohoId: null,
            message,
          } satisfies SyncErrorEntry,
          ...current.recentErrors,
        ],
      }));

      return { outcome: 'failed', message, continueSoon: false, status };
    }

    let organization: string | null = null;
    const currentStatus = await updateStatus(store, (current) => current);

    if (
      !currentStatus.zohoOrganization &&
      'organizationName' in zoho &&
      zoho.organizationName
    ) {
      organization = await zoho.organizationName().catch(() => null);
    }

    const outcome = result.counts.errors > 0 ? 'partial' : 'ok';
    const done = summary(result.counts);
    const message = `${
      result.rateLimited
        ? `${done === NOTHING_DONE ? '' : `${done} `}${RATE_LIMITED_MESSAGE}`
        : `${done}${
            result.moreWorkPending
              ? result.initialImportDone
                ? ' More changes are waiting and will follow shortly.'
                : currentStatus.initialImportDone
                  ? ' Zoho records are being read again to fill in all their fields.'
                  : ' The first import from Zoho continues in the next run.'
              : ''
          }`
    }${result.warning ? ` ${result.warning}` : ''}`;
    const status = await updateStatus(store, (current) => ({
      ...current,
      running: false,
      lastRunFinishedAt: new Date(now()).toISOString(),
      lastRunOutcome: outcome,
      lastRunMessage: message,
      lastRunCounts: result.counts,
      totals: addCounts(current.totals, result.counts),
      initialImportDone: result.initialImportDone || current.initialImportDone,
      moreWorkPending: result.moreWorkPending,
      backfillRunning: result.backfillRunning,
      zohoOrganization: organization ?? current.zohoOrganization,
      fieldSummary: fieldSummaryOf(result.schema, result.warning),
      // A run that got through clears the errors of failed runs before it.
      recentErrors: [
        ...[...result.errors].reverse(),
        ...current.recentErrors.filter((entry) => entry.object !== 'run'),
      ],
    }));

    return {
      outcome,
      message,
      // The first import and a backfill can be large: keep going right away
      // instead of waiting for the schedule.
      continueSoon:
        result.followUpSoon ||
        (result.moreWorkPending &&
          (!result.initialImportDone || result.backfillRunning)),
      ...(result.rateLimited ? { retryAfterMs: RATE_LIMIT_RETRY_MS } : {}),
      status,
    };
  } finally {
    await releaseLock(store, owner);
  }
};
