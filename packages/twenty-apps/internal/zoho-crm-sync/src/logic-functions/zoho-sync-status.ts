import { defineLogicFunction } from 'twenty-sdk/define';

import { STATUS_LOGIC_FUNCTION_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import { readSyncConfig } from 'src/sync/config';
import { appKeyValueStore } from 'src/sync/runtime';
import { isLocked, loadStatus } from 'src/sync/state';
import { findZohoDataCenter } from 'src/zoho/data-centers';

// What the Zoho CRM Sync page shows.
const handler = async () => {
  const { config, missing } = readSyncConfig();
  const status = await loadStatus(appKeyValueStore);

  return {
    configured: config !== null,
    missing,
    hasClientCredentials:
      !missing.includes('ZOHO_CLIENT_ID') &&
      !missing.includes('ZOHO_CLIENT_SECRET'),
    dataCenter: findZohoDataCenter(process.env.ZOHO_DATA_CENTER).label,
    direction: config?.direction ?? process.env.SYNC_DIRECTION ?? 'TWO_WAY',
    running: await isLocked(appKeyValueStore),
    status,
  };
};

export default defineLogicFunction({
  universalIdentifier: STATUS_LOGIC_FUNCTION_UNIVERSAL_IDENTIFIER,
  name: 'zoho-sync-status',
  description: 'Returns the state of the Zoho CRM sync for the app page',
  timeoutSeconds: 15,
  handler,
  httpRouteTriggerSettings: {
    path: '/zoho-sync/status',
    httpMethod: 'GET',
    isAuthRequired: true,
  },
});
