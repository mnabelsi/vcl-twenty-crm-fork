import { defineHealthCheck } from 'twenty-sdk/define';

import { HEALTH_CHECK_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import { readSyncConfig } from 'src/sync/config';
import { appKeyValueStore } from 'src/sync/runtime';
import { loadStatus } from 'src/sync/state';
import { sealedTokenCache } from 'src/sync/token-cache';
import { ZohoAuthError, ZohoClient } from 'src/zoho/client';

export default defineHealthCheck({
  universalIdentifier: HEALTH_CHECK_UNIVERSAL_IDENTIFIER,
  name: 'health-check',
  handler: async () => {
    const { config } = readSyncConfig();

    // Missing variables are already flagged by Twenty itself.
    if (!config) {
      return { status: 'OK' };
    }

    try {
      await new ZohoClient(
        config,
        sealedTokenCache(
          appKeyValueStore,
          config.clientSecret,
          config.refreshToken,
        ),
      ).organizationName();
    } catch (error) {
      if (error instanceof ZohoAuthError) {
        return {
          status: 'ERROR',
          title: 'Zoho refused the credentials',
          description: `${error.message} Connect again with a new grant code on the Zoho CRM Sync page.`,
        };
      }

      return {
        status: 'WARNING',
        title: 'Zoho could not be reached',
        description: (error as Error).message,
      };
    }

    const status = await loadStatus(appKeyValueStore);

    if (status.lastRunOutcome === 'failed') {
      return {
        status: 'ERROR',
        title: 'The last sync run failed',
        description: status.lastRunMessage ?? undefined,
      };
    }
    if (status.lastRunOutcome === 'partial') {
      return {
        status: 'WARNING',
        title: 'Some records could not be synced',
        description: 'Open the Zoho CRM Sync page to see which ones and why.',
      };
    }

    return { status: 'OK' };
  },
});
