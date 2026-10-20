import { defineLogicFunction } from 'twenty-sdk/define';
import type { RoutePayload } from 'twenty-sdk/logic-function';

import { RUN_LOGIC_FUNCTION_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import { requestMode, type SyncMode } from 'src/sync/run';
import { appKeyValueStore, enqueueSyncRun } from 'src/sync/runtime';

const MODES: SyncMode[] = ['incremental', 'full-pull', 'push-unlinked'];

// Starts a run in the background: "Sync now", "Import everything again from
// Zoho" or "Send unlinked Twenty records to Zoho".
const handler = async (event: RoutePayload<{ mode?: string }>) => {
  const mode = (event.body?.mode ?? 'incremental') as SyncMode;

  if (!MODES.includes(mode)) {
    return { queued: false, error: `Unknown mode ${mode}` };
  }

  await requestMode(appKeyValueStore, mode);
  await enqueueSyncRun({ chain: 0 });

  return { queued: true, mode };
};

export default defineLogicFunction({
  universalIdentifier: RUN_LOGIC_FUNCTION_UNIVERSAL_IDENTIFIER,
  name: 'zoho-sync-run',
  description: 'Queues a Zoho CRM sync run right away',
  timeoutSeconds: 15,
  handler,
  httpRouteTriggerSettings: {
    path: '/zoho-sync/run',
    httpMethod: 'POST',
    isAuthRequired: true,
  },
});
