import { defineLogicFunction } from 'twenty-sdk/define';

import { SYNC_LOGIC_FUNCTION_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import { runSync } from 'src/sync/run';
import {
  appKeyValueStore,
  applicationTwentyGateway,
  enqueueSyncRun,
} from 'src/sync/runtime';

const TIMEOUT_SECONDS = 900;
// Stop starting new pages early enough to save progress before the timeout.
const WORK_BUDGET_MS = 10 * 60 * 1000;
// The first import continues in follow-up runs; this caps such a chain.
const MAX_CHAINED_RUNS = 100;

type SyncPayload = { chain?: number } | null | undefined;

const handler = async (payload: SyncPayload) => {
  const chain = typeof payload?.chain === 'number' ? payload.chain : 0;
  const result = await runSync({
    store: appKeyValueStore,
    twenty: applicationTwentyGateway(),
    budgetMs: WORK_BUDGET_MS,
    lockTtlMs: (TIMEOUT_SECONDS + 60) * 1000,
  });

  if (chain < MAX_CHAINED_RUNS) {
    if (result.retryAfterMs) {
      await enqueueSyncRun({ chain: chain + 1 }, result.retryAfterMs);
    } else if (result.continueSoon) {
      await enqueueSyncRun({ chain: chain + 1 }, 2000);
    }
  }

  return { outcome: result.outcome, message: result.message };
};

export default defineLogicFunction({
  universalIdentifier: SYNC_LOGIC_FUNCTION_UNIVERSAL_IDENTIFIER,
  name: 'zoho-sync',
  description:
    'Brings Zoho CRM Contacts and Accounts in step with Twenty People and Companies, both ways',
  timeoutSeconds: TIMEOUT_SECONDS,
  handler,
  cronTriggerSettings: {
    pattern: '*/5 * * * *',
  },
});
