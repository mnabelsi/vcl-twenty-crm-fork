// Thin client for the Zoho CRM REST API v8, authenticated with a Self Client
// refresh token. https://www.zoho.com/crm/developer/docs/api/v8/

export type ZohoCredentials = {
  accountsUrl: string;
  apiUrlOverride: string | null;
  defaultApiUrl: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
};

export type CachedAccessToken = {
  accessToken: string;
  apiUrl: string;
  expiresAt: number;
};

export type AccessTokenCache = {
  read: () => Promise<CachedAccessToken | null>;
  write: (token: CachedAccessToken) => Promise<void>;
  clear: () => Promise<void>;
};

export type ZohoWriteResult = {
  ok: boolean;
  id: string | null;
  action: 'insert' | 'update' | null;
  code: string;
  message: string;
};

type FetchLike = typeof fetch;

export class ZohoError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = 'ZohoError';
  }
}

// Raised when Zoho refuses the client ID, secret or refresh token: retrying
// will not help until someone fixes the credentials.
export class ZohoAuthError extends ZohoError {
  constructor(message: string, code: string) {
    super(message, 401, code);
    this.name = 'ZohoAuthError';
  }
}

const TOKEN_SAFETY_MARGIN_MS = 5 * 60 * 1000;
const RETRY_DELAYS_MS = [1000, 4000, 10000];
const MAX_IDS_PER_GET = 100;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const describeTokenError = (error: string): string => {
  switch (error) {
    case 'invalid_client':
      return 'Zoho does not recognise the client ID or secret. Check them, and that the data center matches your Zoho account.';
    case 'invalid_code':
      return 'Zoho rejected the token: the grant code or refresh token is invalid, expired or revoked.';
    case 'invalid_client_secret':
      return 'Zoho rejected the client secret.';
    case 'access_denied':
      return 'Zoho refused the request; too many tokens were requested in a short time. The sync retries on its next run.';
    default:
      return `Zoho refused the token request (${error}).`;
  }
};

const tokenRequest = async (
  fetchImplementation: FetchLike,
  accountsUrl: string,
  params: Record<string, string>,
): Promise<{
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  api_domain?: string;
  error?: string;
}> => {
  const url = `${accountsUrl}/oauth/v2/token?${new URLSearchParams(params).toString()}`;
  const response = await fetchImplementation(url, { method: 'POST' });
  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    throw new ZohoError(
      `Zoho accounts server answered ${response.status} with an unreadable body`,
      response.status,
      'UNREADABLE_RESPONSE',
    );
  }
};

// Exchanges the one-time grant code from the Zoho API console for a refresh
// token. Grant codes expire after the few minutes chosen when generating them.
export const exchangeGrantCode = async ({
  accountsUrl,
  clientId,
  clientSecret,
  code,
  fetchImplementation = fetch,
}: {
  accountsUrl: string;
  clientId: string;
  clientSecret: string;
  code: string;
  fetchImplementation?: FetchLike;
}): Promise<{
  refreshToken: string;
  accessToken: string;
  apiUrl: string | null;
}> => {
  const body = await tokenRequest(fetchImplementation, accountsUrl, {
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code,
  });

  if (body.error || !body.refresh_token || !body.access_token) {
    const error = body.error ?? 'no_refresh_token';

    throw new ZohoAuthError(
      error === 'invalid_code'
        ? 'Zoho rejected the grant code: it is wrong, already used or expired. Generate a new one and paste it within its validity.'
        : body.error
          ? describeTokenError(body.error)
          : 'Zoho returned no refresh token. Generate the grant code from a Self Client and try again.',
      error,
    );
  }

  return {
    refreshToken: body.refresh_token,
    accessToken: body.access_token,
    apiUrl: body.api_domain ?? null,
  };
};

export class ZohoClient {
  private token: CachedAccessToken | null = null;

  constructor(
    private readonly credentials: ZohoCredentials,
    private readonly tokenCache: AccessTokenCache,
    private readonly fetchImplementation: FetchLike = fetch,
  ) {}

  private async accessToken(forceRefresh = false): Promise<CachedAccessToken> {
    if (!forceRefresh) {
      if (
        this.token &&
        this.token.expiresAt > Date.now() + TOKEN_SAFETY_MARGIN_MS
      ) {
        return this.token;
      }

      const cached = await this.tokenCache.read();

      if (cached && cached.expiresAt > Date.now() + TOKEN_SAFETY_MARGIN_MS) {
        this.token = cached;

        return cached;
      }
    }

    const body = await tokenRequest(
      this.fetchImplementation,
      this.credentials.accountsUrl,
      {
        grant_type: 'refresh_token',
        client_id: this.credentials.clientId,
        client_secret: this.credentials.clientSecret,
        refresh_token: this.credentials.refreshToken,
      },
    );

    if (body.error || !body.access_token) {
      const error = body.error ?? 'no_access_token';

      if (error === 'access_denied') {
        throw new ZohoError(describeTokenError(error), 429, error);
      }

      throw new ZohoAuthError(describeTokenError(error), error);
    }

    this.token = {
      accessToken: body.access_token,
      apiUrl: (
        this.credentials.apiUrlOverride ??
        body.api_domain ??
        this.credentials.defaultApiUrl
      ).replace(/\/+$/, ''),
      expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
    };
    await this.tokenCache.write(this.token);

    return this.token;
  }

  private async request(
    method: string,
    path: string,
    {
      query,
      body,
      headers,
    }: {
      query?: Record<string, string | number | undefined>;
      body?: unknown;
      headers?: Record<string, string>;
    } = {},
  ): Promise<{ status: number; json: any }> {
    const search = new URLSearchParams();

    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) {
        search.set(key, String(value));
      }
    }

    let refreshed = false;

    for (let attempt = 0; ; attempt++) {
      const token = await this.accessToken(refreshed);
      const url = `${token.apiUrl}/crm/v8${path}${search.size > 0 ? `?${search.toString()}` : ''}`;
      const response = await this.fetchImplementation(url, {
        method,
        headers: {
          Authorization: `Zoho-oauthtoken ${token.accessToken}`,
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });

      if (response.status === 204 || response.status === 304) {
        return { status: response.status, json: null };
      }

      const text = await response.text();
      let json: any = null;

      try {
        json = text === '' ? null : JSON.parse(text);
      } catch {
        json = null;
      }

      if (response.status === 401 && !refreshed) {
        // The cached token was revoked or expired early: get a new one once.
        refreshed = true;
        await this.tokenCache.clear();
        continue;
      }

      const retryable = response.status === 429 || response.status >= 500;

      if (retryable && attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }

      if (response.ok || response.status === 207) {
        return { status: response.status, json };
      }

      const code =
        json?.code ?? json?.data?.[0]?.code ?? `HTTP_${response.status}`;
      const message =
        json?.message ?? json?.data?.[0]?.message ?? text.slice(0, 300);

      if (response.status === 401) {
        throw new ZohoAuthError(
          `Zoho refused the access token: ${message}`,
          code,
        );
      }

      throw new ZohoError(
        `Zoho ${method} ${path} failed (${code}): ${message}`,
        response.status,
        code,
      );
    }
  }

  // Records changed at or after `since` (all records when it is null), oldest
  // change first, one page of up to 200.
  async listModified<T>(
    module: string,
    fields: string[],
    { since, page }: { since: string | null; page: number },
  ): Promise<{ records: T[]; moreRecords: boolean }> {
    const { json } = await this.request('GET', `/${module}`, {
      query: {
        fields: fields.join(','),
        per_page: 200,
        page,
        sort_by: 'Modified_Time',
        sort_order: 'asc',
      },
      headers: since ? { 'If-Modified-Since': since } : undefined,
    });

    return {
      records: (json?.data ?? []) as T[],
      moreRecords: Boolean(json?.info?.more_records),
    };
  }

  async getByIds<T>(
    module: string,
    ids: string[],
    fields: string[],
  ): Promise<T[]> {
    const records: T[] = [];

    for (let index = 0; index < ids.length; index += MAX_IDS_PER_GET) {
      const { json } = await this.request('GET', `/${module}`, {
        query: {
          ids: ids.slice(index, index + MAX_IDS_PER_GET).join(','),
          fields: fields.join(','),
        },
      });

      records.push(...((json?.data ?? []) as T[]));
    }

    return records;
  }

  // Up to 100 records per call. Each entry carries the Zoho id to update.
  async update(
    module: string,
    records: Record<string, unknown>[],
  ): Promise<ZohoWriteResult[]> {
    const { json } = await this.request('PUT', `/${module}`, {
      body: { data: records },
    });

    return readWriteResults(json, records.length);
  }

  // Up to 100 records per call. Zoho updates the record holding the same value
  // in the first duplicate check field it finds, and inserts the rest.
  async upsert(
    module: string,
    records: Record<string, unknown>[],
    duplicateCheckFields: string[],
  ): Promise<ZohoWriteResult[]> {
    const { json } = await this.request('POST', `/${module}/upsert`, {
      body: {
        data: records,
        duplicate_check_fields: duplicateCheckFields,
      },
    });

    return readWriteResults(json, records.length);
  }

  async organizationName(): Promise<string | null> {
    try {
      const { json } = await this.request('GET', '/org');

      return json?.org?.[0]?.company_name ?? null;
    } catch (error) {
      if (error instanceof ZohoAuthError) {
        throw error;
      }

      // The org endpoint needs the ZohoCRM.org.READ scope, which the sync
      // itself does not: fall back to a record read to prove access.
      await this.request('GET', '/Contacts', {
        query: { fields: 'Last_Name', per_page: 1 },
      });

      return null;
    }
  }
}

const readWriteResults = (json: any, expected: number): ZohoWriteResult[] => {
  const data: any[] = json?.data ?? [];

  return Array.from({ length: expected }, (_, index) => {
    const entry = data[index];

    if (!entry) {
      return {
        ok: false,
        id: null,
        action: null,
        code: 'NO_RESULT',
        message: 'Zoho returned no result for this record',
      };
    }

    const ok = entry.status === 'success';
    const details = entry.details ?? {};
    const detailText =
      !ok && details && Object.keys(details).length > 0
        ? ` ${JSON.stringify(details)}`
        : '';

    return {
      ok,
      id: details.id ?? null,
      action:
        entry.action === 'insert' || entry.action === 'update'
          ? entry.action
          : null,
      code: entry.code ?? 'UNKNOWN',
      message: `${entry.message ?? ''}${detailText}`.trim(),
    };
  });
};
