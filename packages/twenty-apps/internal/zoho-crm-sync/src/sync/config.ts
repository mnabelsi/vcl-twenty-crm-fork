import { findZohoDataCenter } from 'src/zoho/data-centers';

export type SyncDirection =
  'TWO_WAY' | 'ZOHO_TO_TWENTY' | 'TWENTY_TO_ZOHO' | 'PAUSED';

export type SyncConfig = {
  accountsUrl: string;
  apiUrlOverride: string | null;
  defaultApiUrl: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  direction: SyncDirection;
  defaultPhoneCountry: string | null;
};

const SYNC_DIRECTIONS: SyncDirection[] = [
  'TWO_WAY',
  'ZOHO_TO_TWENTY',
  'TWENTY_TO_ZOHO',
  'PAUSED',
];

const readVariable = (key: string): string => (process.env[key] ?? '').trim();

const withoutTrailingSlash = (url: string): string => url.replace(/\/+$/, '');

// Application variables arrive as strings in process.env. Missing ones are
// reported by name so the page and the health check can say what to fill in.
export const readSyncConfig = (): {
  config: SyncConfig | null;
  missing: string[];
} => {
  const dataCenter = findZohoDataCenter(readVariable('ZOHO_DATA_CENTER'));
  const clientId = readVariable('ZOHO_CLIENT_ID');
  const clientSecret = readVariable('ZOHO_CLIENT_SECRET');
  const refreshToken = readVariable('ZOHO_REFRESH_TOKEN');
  const direction = readVariable('SYNC_DIRECTION') as SyncDirection;
  const phoneCountry = readVariable('DEFAULT_PHONE_COUNTRY').toUpperCase();
  const accountsUrl = readVariable('ZOHO_ACCOUNTS_URL');
  const apiUrl = readVariable('ZOHO_API_URL');

  const missing = [
    ['ZOHO_CLIENT_ID', clientId],
    ['ZOHO_CLIENT_SECRET', clientSecret],
    ['ZOHO_REFRESH_TOKEN', refreshToken],
  ]
    .filter(([, value]) => value === '')
    .map(([key]) => key);

  if (missing.length > 0) {
    return { config: null, missing };
  }

  return {
    config: {
      accountsUrl: withoutTrailingSlash(accountsUrl || dataCenter.accountsUrl),
      apiUrlOverride: apiUrl ? withoutTrailingSlash(apiUrl) : null,
      defaultApiUrl: dataCenter.apiUrl,
      clientId,
      clientSecret,
      refreshToken,
      direction: SYNC_DIRECTIONS.includes(direction) ? direction : 'TWO_WAY',
      defaultPhoneCountry: /^[A-Z]{2}$/.test(phoneCountry)
        ? phoneCountry
        : null,
    },
    missing: [],
  };
};

export const readAccountsUrl = (): string => {
  const override = readVariable('ZOHO_ACCOUNTS_URL');

  return withoutTrailingSlash(
    override ||
      findZohoDataCenter(readVariable('ZOHO_DATA_CENTER')).accountsUrl,
  );
};

export const pullsFromZoho = (direction: SyncDirection): boolean =>
  direction === 'TWO_WAY' || direction === 'ZOHO_TO_TWENTY';

export const pushesToZoho = (direction: SyncDirection): boolean =>
  direction === 'TWO_WAY' || direction === 'TWENTY_TO_ZOHO';
