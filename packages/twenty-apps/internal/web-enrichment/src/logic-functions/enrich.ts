import { defineLogicFunction } from 'twenty-sdk/define';

import { ENRICH_LOGIC_FUNCTION_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import { readConfig } from 'src/enrich/config';
import { EnrichmentEngine } from 'src/enrich/engine';
import {
  acquireLock,
  linkSweepDue,
  releaseLock,
  saveLinkStatus,
  saveStatus,
} from 'src/enrich/state';
import { linkPeopleToCompanies } from 'src/link/linker';
import { appKeyValueStore, applicationTwenty } from 'src/runtime';
import { searxngSearch } from 'src/search/searxng';
import { TwentyApiError } from 'src/twenty/gateway';

const TIMEOUT_SECONDS = 900;
// Stop starting new searches early enough to save progress before the timeout.
const WORK_BUDGET_MS = 12 * 60 * 1000;
const RUNS_PER_DAY = 24 * 6;
const LINK_SWEEP_EVERY_MS = 30 * 60 * 1000;

const linkByEmailDomain = async () => {
  const now = Date.now();

  if (!(await linkSweepDue(appKeyValueStore, now, LINK_SWEEP_EVERY_MS))) {
    return null;
  }

  try {
    const counts = await linkPeopleToCompanies(applicationTwenty());

    await saveLinkStatus(appKeyValueStore, {
      finishedAt: new Date().toISOString(),
      counts,
    });

    return counts;
  } catch (error) {
    // The next run sweeps again; the searches below still get their turn.
    if (error instanceof TwentyApiError && error.isRateLimited) {
      return null;
    }
    throw error;
  }
};

const handler = async () => {
  const config = readConfig();
  const owner = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  if (
    !(await acquireLock(appKeyValueStore, owner, (TIMEOUT_SECONDS + 60) * 1000))
  ) {
    return { stopReason: 'another run is still working' };
  }

  try {
    const linking = config.linkByEmailDomain ? await linkByEmailDomain() : null;

    if (config.mode === 'PAUSED') {
      return { linking, stopReason: 'paused' };
    }

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

    return { linking, ...result };
  } finally {
    await releaseLock(appKeyValueStore, owner);
  }
};

export default defineLogicFunction({
  universalIdentifier: ENRICH_LOGIC_FUNCTION_UNIVERSAL_IDENTIFIER,
  name: 'web-enrichment',
  description:
    'Links people to companies by email domain, then fills in missing company websites and LinkedIn profiles, a few searches at a time',
  timeoutSeconds: TIMEOUT_SECONDS,
  handler,
  cronTriggerSettings: {
    pattern: '*/10 * * * *',
  },
});
