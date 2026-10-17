export type EnrichmentMode = 'ALL' | 'WEBSITES' | 'LINKEDIN' | 'PAUSED';

export type EnrichmentConfig = {
  searxngUrl: string | null;
  searxngAuthorization: string | null;
  mode: EnrichmentMode;
  dailySearchLimit: number;
  secondsBetweenSearches: number;
};

const MODES: EnrichmentMode[] = ['ALL', 'WEBSITES', 'LINKEDIN', 'PAUSED'];

const readVariable = (key: string): string => (process.env[key] ?? '').trim();

const readNumber = (key: string, fallback: number): number => {
  const value = Number(readVariable(key));

  return readVariable(key) !== '' && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
};

// Application variables arrive as strings in process.env.
export const readConfig = (): EnrichmentConfig => {
  const mode = readVariable('ENRICHMENT_MODE') as EnrichmentMode;

  return {
    searxngUrl: readVariable('SEARXNG_URL') || null,
    searxngAuthorization: readVariable('SEARXNG_AUTHORIZATION') || null,
    mode: MODES.includes(mode) ? mode : 'ALL',
    dailySearchLimit: Math.floor(readNumber('DAILY_SEARCH_LIMIT', 1500)),
    secondsBetweenSearches: readNumber('SECONDS_BETWEEN_SEARCHES', 5),
  };
};
