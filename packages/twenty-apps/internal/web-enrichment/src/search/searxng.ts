export type SearchResult = { url: string; title: string; content: string };

export type SearchResponse = {
  results: SearchResult[];
  // An empty answer means "nothing on the web" only when every engine
  // answered; blocked or timed-out engines leave the question open.
  conclusive: boolean;
  unresponsiveEngines: string[];
};

export type Search = (query: string) => Promise<SearchResponse>;

// SearXNG itself cannot be used (wrong address, JSON output off, limiter).
export class SearchUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SearchUnavailableError';
  }
}

const TIMEOUT_MS = 30_000;

export const searxngSearch =
  ({
    baseUrl,
    authorization,
  }: {
    baseUrl: string;
    authorization: string | null;
  }): Search =>
  async (query) => {
    const url = new URL(`${baseUrl.replace(/\/+$/, '')}/search`);

    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('safesearch', '0');

    let response: Response;

    try {
      response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          ...(authorization ? { Authorization: authorization } : {}),
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new SearchUnavailableError(
        `SearXNG could not be reached at ${baseUrl}: ${(error as Error).message}`,
      );
    }

    if (response.status === 403) {
      throw new SearchUnavailableError(
        'SearXNG refused JSON results: add "json" to search.formats in its settings.yml.',
      );
    }
    if (response.status === 429) {
      throw new SearchUnavailableError(
        'SearXNG is rate limiting the Twenty server: set server.limiter to false in its settings.yml.',
      );
    }
    if (response.status === 401) {
      throw new SearchUnavailableError(
        'SearXNG asks for a password: fill in the SearXNG Authorization header setting.',
      );
    }
    if (!response.ok) {
      throw new SearchUnavailableError(
        `SearXNG answered with status ${response.status}.`,
      );
    }

    const body = (await response.json()) as {
      results?: { url?: unknown; title?: unknown; content?: unknown }[];
      unresponsive_engines?: unknown[][];
    };
    const results = (body.results ?? []).map((result) => ({
      url: String(result.url ?? ''),
      title: String(result.title ?? ''),
      content: String(result.content ?? ''),
    }));
    const unresponsiveEngines = (body.unresponsive_engines ?? []).map((entry) =>
      entry.map(String).join(': '),
    );

    return {
      results,
      conclusive: results.length > 0 || unresponsiveEngines.length === 0,
      unresponsiveEngines,
    };
  };
