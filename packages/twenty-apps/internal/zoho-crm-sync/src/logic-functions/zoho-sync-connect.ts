import { MetadataApiClient } from 'twenty-client-sdk/metadata';
import { defineLogicFunction } from 'twenty-sdk/define';
import type { RoutePayload } from 'twenty-sdk/logic-function';

import { CONNECT_LOGIC_FUNCTION_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import { readAccountsUrl } from 'src/sync/config';
import { appKeyValueStore, enqueueSyncRun } from 'src/sync/runtime';
import { CONNECTED_AT_KEY, TOKEN_KEY, updateStatus } from 'src/sync/state';
import { exchangeGrantCode, ZohoAuthError } from 'src/zoho/client';

// Turns the grant code generated in the Zoho API console (Self Client) into a
// refresh token and saves it in the app's ZOHO_REFRESH_TOKEN variable.
const handler = async (event: RoutePayload<{ grantCode?: string }>) => {
  const grantCode = (event.body?.grantCode ?? '').trim();
  const clientId = (process.env.ZOHO_CLIENT_ID ?? '').trim();
  const clientSecret = (process.env.ZOHO_CLIENT_SECRET ?? '').trim();

  if (grantCode === '') {
    return {
      connected: false,
      error: 'Paste the grant code from the Zoho API console.',
    };
  }
  if (clientId === '' || clientSecret === '') {
    return {
      connected: false,
      error:
        'Fill in the Zoho client ID and client secret in the app settings first.',
    };
  }

  try {
    const { refreshToken } = await exchangeGrantCode({
      accountsUrl: readAccountsUrl(),
      clientId,
      clientSecret,
      code: grantCode,
    });

    await new MetadataApiClient({ runAs: 'application' }).mutation({
      updateOneApplicationVariable: {
        __args: { key: 'ZOHO_REFRESH_TOKEN', value: refreshToken },
      },
    });
  } catch (error) {
    return {
      connected: false,
      error:
        error instanceof ZohoAuthError
          ? error.message
          : `Could not connect to Zoho: ${(error as Error).message}`,
    };
  }

  await appKeyValueStore.delete(TOKEN_KEY);
  await appKeyValueStore.set(CONNECTED_AT_KEY, Date.now());
  await updateStatus(appKeyValueStore, (status) => ({
    ...status,
    zohoOrganization: null,
  }));
  await enqueueSyncRun({ chain: 0 }, 10000);

  return { connected: true };
};

export default defineLogicFunction({
  universalIdentifier: CONNECT_LOGIC_FUNCTION_UNIVERSAL_IDENTIFIER,
  name: 'zoho-sync-connect',
  description: 'Exchanges a Zoho grant code for a refresh token and saves it',
  timeoutSeconds: 30,
  handler,
  httpRouteTriggerSettings: {
    path: '/zoho-sync/connect',
    httpMethod: 'POST',
    isAuthRequired: true,
  },
});
