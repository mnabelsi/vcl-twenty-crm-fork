// Mock of the Zoho accounts server and CRM API v8, enough for the sync app.
import http from 'node:http';

const PORT = Number(process.env.PORT ?? 4555);
const BASE = process.env.BASE ?? `http://172.17.0.1:${PORT}`;
const modules = { Accounts: new Map(), Contacts: new Map() };
const log = [];
let tokenCount = 0;
let nextId = 5000000000000;
let clock = Date.parse('2026-10-17T06:00:00Z');

// Zoho answers in the org's time zone (+04:00 here).
const zohoTime = (ms) => {
  const local = new Date(ms + 4 * 3600 * 1000).toISOString().slice(0, 19);
  return `${local}+04:00`;
};
const tick = () => {
  clock = Math.max(clock + 1000, Date.now());
  return clock;
};

const add = (module, record) => {
  const id = String(nextId++);
  const stored = { ...record, id, Modified_Time: zohoTime(tick()) };
  modules[module].set(id, stored);
  return stored;
};
const edit = (module, id, changes) => {
  const record = modules[module].get(id);
  Object.assign(record, changes, { id, Modified_Time: zohoTime(tick()) });
  return record;
};

// Seed data (fictitious)
const acmetel = add('Accounts', {
  Account_Name: 'Acme Telecom',
  Website: 'https://www.acmetel.example',
  Billing_City: 'Abu Dhabi',
  Billing_Country: 'United Arab Emirates',
  Industry: 'Telecom & ICT',
  Owner: { id: 'u1', name: 'Tim', email: 'tim@apple.dev' },
});
const gulfenergy = add('Accounts', {
  Account_Name: 'Gulf Energy Oman',
  Billing_City: 'Muscat',
  Billing_Country: 'Oman',
  Industry: 'Oil & Gas',
  Owner: { id: 'u1', name: 'Tim', email: 'tim@apple.dev' },
});
const dtp = add('Accounts', {
  Account_Name: 'Desert Tech Park Authority',
  Website: 'deserttech.example',
  Industry: 'Government',
  Owner: { id: 'u2', name: 'Phil', email: 'phil.schiler@apple.dev' },
});
add('Contacts', {
  First_Name: 'Layla',
  Last_Name: 'Haddad',
  Email: 'Layla.Haddad@acmetel.example',
  Title: 'Head of Portfolio',
  Phone: '050 123 4567',
  Mailing_Country: 'UAE',
  Account_Name: { id: acmetel.id, name: 'Acme Telecom' },
});
add('Contacts', {
  First_Name: 'Sara',
  Last_Name: 'Mansour',
  Email: 'sara.mansour@gulfenergy.example',
  Title: 'HR Director',
  Phone: '+1 202 555 0143',
  Account_Name: { id: gulfenergy.id, name: 'Gulf Energy Oman' },
});
add('Contacts', {
  First_Name: 'Omar',
  Last_Name: 'Farouk',
  Email: 'omar.farouk@deserttech.example',
  Title: 'SVP Technology',
  Mobile: '+971 50 765 4321',
  Secondary_Email: 'omar@personal.example',
  Account_Name: { id: dtp.id, name: 'Desert Tech Park Authority' },
});
add('Contacts', {
  First_Name: null,
  Last_Name: 'Mononym',
  Email: 'mono@example.com',
  Phone: 'call reception',
});
for (let index = 0; index < 230; index++) {
  add('Contacts', {
    First_Name: `Bulk${index}`,
    Last_Name: 'Contact',
    Email: `bulk${index}@example.com`,
    Account_Name: { id: acmetel.id, name: 'Acme Telecom' },
  });
}

const send = (res, status, body) => {
  if (status === 204 || body === undefined) {
    res.writeHead(status);
    res.end();
    return;
  }
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

const readBody = (req) =>
  new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data ? JSON.parse(data) : null));
  });

const authorized = (req) =>
  /^Zoho-oauthtoken tok-\d+$/.test(req.headers.authorization ?? '');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const entry = {
    at: new Date().toISOString(),
    method: req.method,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
    ims: req.headers['if-modified-since'] ?? null,
  };
  log.push(entry);

  try {
    if (url.pathname === '/oauth/v2/token' && req.method === 'POST') {
      const params = url.searchParams;
      if (
        params.get('client_id') !== 'mock-client' ||
        params.get('client_secret') !== 'mock-secret'
      ) {
        return send(res, 200, { error: 'invalid_client' });
      }
      if (params.get('grant_type') === 'authorization_code') {
        if (params.get('code') !== 'GOOD-CODE')
          return send(res, 200, { error: 'invalid_code' });
        tokenCount++;
        return send(res, 200, {
          access_token: `tok-${tokenCount}`,
          refresh_token: 'good-refresh',
          expires_in: 3600,
          api_domain: BASE,
          token_type: 'Bearer',
        });
      }
      if (params.get('grant_type') === 'refresh_token') {
        if (params.get('refresh_token') !== 'good-refresh')
          return send(res, 200, { error: 'invalid_code' });
        tokenCount++;
        return send(res, 200, {
          access_token: `tok-${tokenCount}`,
          expires_in: 3600,
          api_domain: BASE,
          token_type: 'Bearer',
        });
      }
      return send(res, 200, { error: 'unsupported_grant_type' });
    }

    if (url.pathname === '/_state')
      return send(res, 200, {
        tokenCount,
        Accounts: [...modules.Accounts.values()],
        Contacts: [...modules.Contacts.values()],
      });
    if (url.pathname === '/_log')
      return send(
        res,
        200,
        log.slice(-Number(url.searchParams.get('n') ?? 50)),
      );
    if (url.pathname === '/_edit') {
      const { module, id, changes } = await readBody(req);
      return send(res, 200, edit(module, id, changes));
    }
    if (url.pathname === '/_add') {
      const { module, record } = await readBody(req);
      return send(res, 200, add(module, record));
    }

    const match = url.pathname.match(/^\/crm\/v8\/(\w+)(\/upsert)?$/);
    if (!match)
      return send(res, 404, {
        code: 'INVALID_URL_PATTERN',
        message: 'not found',
        status: 'error',
      });
    if (!authorized(req))
      return send(res, 401, {
        code: 'INVALID_TOKEN',
        details: {},
        message: 'invalid oauth token',
        status: 'error',
      });

    const [, module, upsert] = match;

    if (module === 'org')
      return send(res, 200, {
        org: [{ company_name: 'Example Org (mock)', id: '1' }],
      });

    const store = modules[module];
    if (!store)
      return send(res, 400, {
        code: 'INVALID_MODULE',
        message: 'the module name given seems to be invalid',
        status: 'error',
      });

    if (req.method === 'GET') {
      const ids = url.searchParams.get('ids');
      if (ids) {
        const data = ids
          .split(',')
          .map((id) => store.get(id))
          .filter(Boolean);
        return data.length
          ? send(res, 200, { data, info: { more_records: false } })
          : send(res, 204);
      }
      if (!url.searchParams.get('fields'))
        return send(res, 400, {
          code: 'REQUIRED_PARAM_MISSING',
          message: 'fields is required',
          status: 'error',
        });
      const perPage = Math.min(
        Number(url.searchParams.get('per_page') ?? 200),
        200,
      );
      const page = Number(url.searchParams.get('page') ?? 1);
      if (page > 10)
        return send(res, 400, {
          code: 'DISCRETE_PAGINATION_LIMIT_EXCEEDED',
          message: 'page limit',
          status: 'error',
        });
      const ims = req.headers['if-modified-since'];
      const since = ims ? Date.parse(ims) : -Infinity;
      // Strictly after, the stricter reading of Zoho's docs.
      const all = [...store.values()]
        .filter((record) => Date.parse(record.Modified_Time) > since)
        .sort(
          (a, b) =>
            Date.parse(a.Modified_Time) - Date.parse(b.Modified_Time) ||
            a.id.localeCompare(b.id),
        );
      if (all.length === 0) return send(res, ims ? 304 : 204);
      const data = all.slice((page - 1) * perPage, page * perPage);
      if (data.length === 0) return send(res, 204);
      return send(res, 200, {
        data,
        info: {
          per_page: perPage,
          count: data.length,
          page,
          more_records: all.length > page * perPage,
        },
      });
    }

    const body = await readBody(req);
    const results = (body?.data ?? []).map((record) => {
      if (req.method === 'PUT') {
        if (!store.has(record.id))
          return {
            code: 'INVALID_DATA',
            details: { api_name: 'id' },
            message: 'the id given seems to be invalid',
            status: 'error',
          };
        const updated = edit(module, record.id, record);
        return {
          code: 'SUCCESS',
          details: {
            id: updated.id,
            Modified_Time: updated.Modified_Time,
          },
          message: 'record updated',
          status: 'success',
          action: 'update',
        };
      }
      if (upsert) {
        if (module === 'Contacts' && !record.Last_Name)
          return {
            code: 'MANDATORY_NOT_FOUND',
            details: { api_name: 'Last_Name' },
            message: 'required field not found',
            status: 'error',
          };
        if (module === 'Accounts' && !record.Account_Name)
          return {
            code: 'MANDATORY_NOT_FOUND',
            details: { api_name: 'Account_Name' },
            message: 'required field not found',
            status: 'error',
          };
        const field = (body.duplicate_check_fields ?? [])[0];
        const duplicate =
          field && record[field]
            ? [...store.values()].find(
                (existing) =>
                  String(existing[field] ?? '').toLowerCase() ===
                  String(record[field]).toLowerCase(),
              )
            : null;
        if (duplicate) {
          const updated = edit(module, duplicate.id, record);
          return {
            code: 'SUCCESS',
            duplicate_field: field,
            action: 'update',
            details: { id: updated.id },
            message: 'record updated',
            status: 'success',
          };
        }
        const created = add(module, record);
        return {
          code: 'SUCCESS',
          duplicate_field: null,
          action: 'insert',
          details: { id: created.id },
          message: 'record added',
          status: 'success',
        };
      }
      return {
        code: 'INVALID_REQUEST_METHOD',
        message: 'unsupported',
        status: 'error',
      };
    });
    return send(
      res,
      results.some((result) => result.status === 'error') ? 207 : 200,
      { data: results },
    );
  } catch (error) {
    send(res, 500, { code: 'INTERNAL_ERROR', message: String(error) });
  }
});

server.listen(PORT, '0.0.0.0', () =>
  console.log(`mock zoho on ${PORT}, base ${BASE}`),
);
