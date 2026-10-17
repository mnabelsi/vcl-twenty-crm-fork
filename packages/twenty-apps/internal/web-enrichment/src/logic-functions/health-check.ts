import { defineHealthCheck } from 'twenty-sdk/define';

import { HEALTH_CHECK_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import { readConfig } from 'src/enrich/config';
import { loadStatus } from 'src/enrich/state';
import { appKeyValueStore } from 'src/runtime';
import { searxngSearch } from 'src/search/searxng';

export default defineHealthCheck({
  universalIdentifier: HEALTH_CHECK_UNIVERSAL_IDENTIFIER,
  name: 'health-check',
  handler: async () => {
    const config = readConfig();

    // A missing SearXNG URL is already flagged by Twenty itself.
    if (!config.searxngUrl) {
      return { status: 'OK' };
    }

    try {
      await searxngSearch({
        baseUrl: config.searxngUrl,
        authorization: config.searxngAuthorization,
      })('twenty crm');
    } catch (error) {
      return {
        status: 'ERROR',
        title: 'SearXNG cannot be used',
        description: (error as Error).message,
      };
    }

    const status = await loadStatus(appKeyValueStore);

    if (status?.stopReason === 'engines-blocked') {
      return {
        status: 'WARNING',
        title: 'Search engines are blocking SearXNG',
        description: status.message,
      };
    }

    return { status: 'OK' };
  },
});
