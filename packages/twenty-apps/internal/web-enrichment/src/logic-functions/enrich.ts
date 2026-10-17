import { defineLogicFunction } from 'twenty-sdk/define';

import { ENRICH_LOGIC_FUNCTION_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import { readConfig } from 'src/enrich/config';
import { EnrichmentEngine } from 'src/enrich/engine';
import { acquireLock, releaseLock, saveStatus } from 'src/enrich/state';
import { appKeyValueStore, applicationTwenty } from 'src/runtime';
import { searxngSearch } from 'src/search/searxng';

const TIMEOUT_SECONDS = 900;
// Stop starting new searches early enough to save progress before the timeout.
const WORK_BUDGET_MS = 12 * 60 * 1000;
const RUNS_PER_DAY = 24 * 6;

const handler = async () => {
  const config = readConfig();

  if (config.mode === 'PAUSED') {
    return { stopReason: 'paused' };
  }

  const owner = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  if (
    !(await acquireLock(appKeyValueStore, owner, (TIMEOUT_SECONDS + 60) * 1000))
  ) {
    return { stopReason: 'another run is still working' };
  }

  try {
    const result = await new EnrichmentEngine({
      twenty: applicationTwenty(),
      search: config.searxngUrl
        ? searxngSearch({
            baseUrl: config.searxngUrl,
            authorization: config.searxngAuthorization,
          })
        : null,
      store: appKeyValueStore,
      config,
      maxSearchesThisRun: Math.max(
        5,
        Math.ceil((config.dailySearchLimit / RUNS_PER_DAY) * 1.5),
      ),
      budgetMs: WORK_BUDGET_MS,
    }).run();

    await saveStatus(appKeyValueStore, {
      ...result,
      finishedAt: new Date().toISOString(),
    });

    return result;
  } finally {
    await releaseLock(appKeyValueStore, owner);
  }
};

export default defineLogicFunction({
  universalIdentifier: ENRICH_LOGIC_FUNCTION_UNIVERSAL_IDENTIFIER,
  name: 'web-enrichment',
  description:
    'Fills in missing company websites and LinkedIn profiles, a few searches at a time',
  timeoutSeconds: TIMEOUT_SECONDS,
  handler,
  cronTriggerSettings: {
    pattern: '*/10 * * * *',
  },
});
