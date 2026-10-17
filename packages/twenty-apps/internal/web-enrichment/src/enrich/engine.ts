import type {
  LinkedinOutcome,
  WebsiteOutcome,
} from 'src/constants/search-outcomes';
import type { EnrichmentConfig } from 'src/enrich/config';
import {
  linkedinQuery,
  pickLinkedinProfile,
  type LinkedinDecision,
  type PersonToFind,
} from 'src/enrich/linkedin';
import {
  emptyCounts,
  type EnrichmentCounts,
  type KeyValueStore,
  loadSearchesToday,
  saveSearchesToday,
  type StopReason,
} from 'src/enrich/state';
import {
  pickWebsite,
  websiteFromEmails,
  websiteQuery,
  type WebsiteDecision,
} from 'src/enrich/website';
import type { Search, SearchResponse } from 'src/search/searxng';
import {
  type CompanyToEnrich,
  MUTATION_BATCH_SIZE,
  type PersonToEnrich,
  TwentyApiError,
  type TwentyApi,
} from 'src/twenty/gateway';

export type EngineDependencies = {
  twenty: TwentyApi;
  // Null when no SearXNG is configured: websites still come from emails.
  search: Search | null;
  store: KeyValueStore;
  config: Pick<
    EnrichmentConfig,
    'mode' | 'dailySearchLimit' | 'secondsBetweenSearches'
  >;
  // This run's share of the daily searches, so they spread over the day.
  maxSearchesThisRun: number;
  budgetMs: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

export type EngineResult = {
  counts: EnrichmentCounts;
  stopReason: StopReason;
  message: string;
  searchesToday: number;
  errors: string[];
};

// Inconclusive answers in a row before deciding the engines block SearXNG.
const BLOCKED_AFTER = 5;

type Outcome = WebsiteOutcome | LinkedinOutcome;

type PendingWrite = {
  data: Record<string, unknown>;
  outcome: Outcome;
  label: string;
  // Written instead when Twenty refuses the first version.
  fallback?: { data: Record<string, unknown>; outcome: Outcome };
};

const link = (url: string) => ({ primaryLinkUrl: url, primaryLinkLabel: '' });

const isRateLimited = (error: unknown): boolean =>
  error instanceof TwentyApiError && error.isRateLimited;

export class EnrichmentEngine {
  private readonly counts = emptyCounts();
  private readonly errors: string[] = [];
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly deadline: number;
  private searchesToday = 0;
  private searchesThisRun = 0;
  private inconclusiveInARow = 0;
  // Why web search is off for the rest of the run; emails still count.
  private searchOff: StopReason | null = null;
  // Why the whole run stopped.
  private stopped: StopReason | null = null;
  private message = '';

  constructor(private readonly deps: EngineDependencies) {
    this.now = deps.now ?? Date.now;
    this.sleep =
      deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.deadline = this.now() + deps.budgetMs;
  }

  async run(): Promise<EngineResult> {
    const { mode } = this.deps.config;

    this.searchesToday = await loadSearchesToday(this.deps.store, this.now());

    try {
      if (mode === 'ALL' || mode === 'WEBSITES') {
        await this.findWebsites();
      }
      if (!this.stopped && (mode === 'ALL' || mode === 'LINKEDIN')) {
        await this.findProfiles();
      }
    } catch (error) {
      if (!isRateLimited(error)) {
        throw error;
      }
      // Undecided records keep an empty status and come back next run.
      this.stop(
        'rate-limited',
        "Twenty's limit on requests from apps was reached: the search continues at the next run.",
      );
    }

    return {
      counts: this.counts,
      stopReason: this.stopped ?? this.searchOff ?? 'done',
      message: this.message,
      searchesToday: this.searchesToday,
      errors: this.errors,
    };
  }

  private stop(reason: StopReason, message = ''): void {
    this.stopped ??= reason;
    this.message ||= message;
  }

  private turnSearchOff(reason: StopReason, message = ''): void {
    this.searchOff ??= reason;
    this.message ||= message;
  }

  private outOfTime(): boolean {
    if (this.now() >= this.deadline) {
      this.stop('out-of-time');
    }

    return this.stopped !== null;
  }

  private canSearch(): boolean {
    const { dailySearchLimit } = this.deps.config;

    if (this.searchOff) {
      return false;
    }
    if (!this.deps.search) {
      this.turnSearchOff(
        'no-search',
        'No SearXNG URL is set: only websites from work emails are filled in.',
      );
    } else if (this.searchesToday >= dailySearchLimit) {
      this.turnSearchOff(
        'daily-limit',
        `Today's ${dailySearchLimit} searches are used: searching continues tomorrow (UTC).`,
      );
    } else if (this.searchesThisRun >= this.deps.maxSearchesThisRun) {
      this.turnSearchOff('run-share-used');
    }

    return this.searchOff === null;
  }

  // Null when the web gave no usable answer: the record stays undecided.
  private async search(query: string): Promise<SearchResponse | null> {
    const search = this.deps.search as Search;

    if (this.searchesThisRun > 0) {
      const pauseMs = this.deps.config.secondsBetweenSearches * 1000;

      await this.sleep(pauseMs * (0.7 + Math.random() * 0.6));
    }

    this.searchesThisRun += 1;
    this.searchesToday += 1;
    this.counts.searches += 1;
    await saveSearchesToday(this.deps.store, this.now(), this.searchesToday);

    let response: SearchResponse;

    try {
      response = await search(query);
    } catch (error) {
      this.turnSearchOff('search-unavailable', (error as Error).message);

      return null;
    }

    if (response.conclusive) {
      this.inconclusiveInARow = 0;

      return response;
    }

    this.inconclusiveInARow += 1;
    if (this.inconclusiveInARow >= BLOCKED_AFTER) {
      this.turnSearchOff(
        'engines-blocked',
        `The search engines behind SearXNG did not answer ${BLOCKED_AFTER} searches in a row (${response.unresponsiveEngines.join(', ') || 'no reason given'}). Searching resumes at the next run; lower the searches per day if this keeps happening.`,
      );
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Company websites
  // ---------------------------------------------------------------------------

  // Websites from work emails cost no search, so every page is read even
  // once web search is off for the run.
  private async findWebsites(): Promise<void> {
    let after: string | null = null;

    do {
      if (this.outOfTime()) {
        return;
      }

      const page = await this.deps.twenty.pageCompaniesWithoutWebsite(after);

      if (page.records.length === 0) {
        return;
      }

      const emails = await this.deps.twenty.emailsByCompany(
        page.records.map((company) => company.id),
      );
      const writes: PendingWrite[] = [];

      for (const company of page.records) {
        const decision =
          websiteFromEmails(company.name, emails.get(company.id) ?? []) ??
          (await this.searchWebsite(company));

        if (decision) {
          writes.push(this.websiteWrite(company, decision));
        }
        if (this.stopped) {
          break;
        }
      }

      await this.write('company', writes);
      after = page.hasNextPage ? page.endCursor : null;
    } while (after && !this.stopped);
  }

  private async searchWebsite(
    company: CompanyToEnrich,
  ): Promise<WebsiteDecision | null> {
    if (company.name.trim() === '') {
      return { outcome: 'NOT_FOUND', url: null, suggestion: null };
    }
    if (this.outOfTime() || !this.canSearch()) {
      return null;
    }

    const response = await this.search(
      websiteQuery(company.name, company.country),
    );

    return response ? pickWebsite(company.name, response.results) : null;
  }

  private websiteWrite(
    company: CompanyToEnrich,
    decision: WebsiteDecision,
  ): PendingWrite {
    const searchedAt = new Date(this.now()).toISOString();

    return {
      label: company.name,
      outcome: decision.outcome,
      data: {
        id: company.id,
        websiteSearch: decision.outcome,
        websiteSearchedAt: searchedAt,
        ...(decision.url ? { domainName: link(decision.url) } : {}),
        ...(decision.suggestion
          ? { websiteSuggestion: link(decision.suggestion) }
          : {}),
      },
      // Twenty keeps one company per website: a branch whose website belongs
      // to its parent, or a duplicate, keeps it as a suggestion only.
      ...(decision.url
        ? {
            fallback: {
              outcome: 'SHARED' as const,
              data: {
                id: company.id,
                websiteSearch: 'SHARED',
                websiteSearchedAt: searchedAt,
                websiteSuggestion: link(decision.url),
              },
            },
          }
        : {}),
    };
  }

  // ---------------------------------------------------------------------------
  // LinkedIn profiles
  // ---------------------------------------------------------------------------

  private async findProfiles(): Promise<void> {
    let after: string | null = null;

    while (!this.outOfTime() && this.canSearch()) {
      const page = await this.deps.twenty.pagePeopleWithoutLinkedin(after);
      const writes: PendingWrite[] = [];

      for (const person of page.records) {
        if (this.outOfTime() || !this.canSearch()) {
          break;
        }

        const toFind: PersonToFind = {
          firstName: person.firstName,
          lastName: person.lastName,
          companyName: person.companyName,
          emails: person.emails,
        };
        const query = linkedinQuery(toFind);

        if (!query) {
          writes.push(
            this.profileWrite(person, {
              outcome: 'NOT_ENOUGH_INFO',
              url: null,
              suggestion: null,
            }),
          );
          continue;
        }

        const response = await this.search(query);

        if (response) {
          writes.push(
            this.profileWrite(
              person,
              pickLinkedinProfile(toFind, response.results),
            ),
          );
        }
      }

      await this.write('person', writes);

      if (!page.hasNextPage) {
        return;
      }
      after = page.endCursor;
    }
  }

  private profileWrite(
    person: PersonToEnrich,
    decision: LinkedinDecision,
  ): PendingWrite {
    return {
      label: `${person.firstName} ${person.lastName}`.trim(),
      outcome: decision.outcome,
      data: {
        id: person.id,
        linkedinSearch: decision.outcome,
        linkedinSearchedAt: new Date(this.now()).toISOString(),
        ...(decision.url ? { linkedinLink: link(decision.url) } : {}),
        ...(decision.suggestion
          ? { linkedinSuggestion: link(decision.suggestion) }
          : {}),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Writing
  // ---------------------------------------------------------------------------

  private count(object: 'company' | 'person', outcome: Outcome): void {
    const counter: Record<string, keyof EnrichmentCounts> =
      object === 'company'
        ? {
            FROM_EMAILS: 'websitesFromEmails',
            FOUND: 'websitesFound',
            REVIEW: 'websitesToReview',
            SHARED: 'websitesShared',
            NOT_FOUND: 'websitesNotFound',
          }
        : {
            FOUND: 'profilesFound',
            REVIEW: 'profilesToReview',
            NOT_FOUND: 'profilesNotFound',
            NOT_ENOUGH_INFO: 'notEnoughInfo',
          };

    this.counts[counter[outcome]] += 1;
  }

  // In batches; a refused batch is retried record by record so one bad
  // record does not hold back the others.
  private async write(
    object: 'company' | 'person',
    writes: PendingWrite[],
  ): Promise<void> {
    const update = (data: Record<string, unknown>[]) =>
      object === 'company'
        ? this.deps.twenty.updateCompanies(data)
        : this.deps.twenty.updatePeople(data);

    for (let index = 0; index < writes.length; index += MUTATION_BATCH_SIZE) {
      const batch = writes.slice(index, index + MUTATION_BATCH_SIZE);

      try {
        await update(batch.map((pending) => pending.data));
        batch.forEach((pending) => this.count(object, pending.outcome));
        continue;
      } catch (error) {
        if (isRateLimited(error)) {
          throw error;
        }
      }

      for (const pending of batch) {
        await this.writeOne(object, pending, update);
      }
    }
  }

  private async writeOne(
    object: 'company' | 'person',
    pending: PendingWrite,
    update: (data: Record<string, unknown>[]) => Promise<void>,
  ): Promise<void> {
    for (const attempt of [
      { data: pending.data, outcome: pending.outcome },
      ...(pending.fallback ? [pending.fallback] : []),
    ]) {
      try {
        await update([attempt.data]);
        this.count(object, attempt.outcome);

        return;
      } catch (error) {
        if (isRateLimited(error)) {
          throw error;
        }
        if (attempt.data === (pending.fallback?.data ?? pending.data)) {
          this.counts.errors += 1;
          this.errors.push(
            `${pending.label}: Twenty refused the update: ${(error as Error).message}`,
          );
        }
      }
    }
  }
}
