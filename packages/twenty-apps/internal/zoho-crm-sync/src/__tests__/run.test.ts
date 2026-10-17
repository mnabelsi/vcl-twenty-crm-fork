import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  Clock,
  FakeTwenty,
  FakeZoho,
  memoryStore,
  rateLimitError,
} from 'src/__tests__/fakes';
import { requestMode, runSync } from 'src/sync/run';
import { CONNECTED_AT_KEY, loadStatus, REQUEST_KEY } from 'src/sync/state';
import { ZohoAuthError } from 'src/zoho/client';

const VARIABLES = {
  ZOHO_CLIENT_ID: 'client',
  ZOHO_CLIENT_SECRET: 'secret',
  ZOHO_REFRESH_TOKEN: 'refresh',
  SYNC_DIRECTION: 'TWO_WAY',
};

let clock: Clock;
let store: ReturnType<typeof memoryStore>;
let twenty: FakeTwenty;
let zoho: FakeZoho;

const rejectingZoho = () => {
  const failing = new FakeZoho(clock);

  failing.listModified = async () => {
    throw new ZohoAuthError('Zoho rejected the token', 'invalid_code');
  };

  return failing;
};

const run = (createZoho: () => FakeZoho = () => zoho) =>
  runSync({
    store,
    twenty,
    createZoho,
    budgetMs: 60_000,
    lockTtlMs: 60_000,
    now: clock.now,
  });

beforeEach(() => {
  clock = new Clock();
  store = memoryStore();
  twenty = new FakeTwenty(clock);
  zoho = new FakeZoho(clock);
  Object.assign(process.env, VARIABLES);
});

afterEach(() => {
  for (const key of Object.keys(VARIABLES)) {
    delete process.env[key];
  }
});

describe('runSync', () => {
  it('says what is missing when not configured', async () => {
    delete process.env.ZOHO_REFRESH_TOKEN;

    const result = await run();

    expect(result.outcome).toBe('skipped');
    expect(result.message).toContain('ZOHO_REFRESH_TOKEN');
    expect(result.retryAfterMs).toBeUndefined();
  });

  it('waits for the new credentials right after connecting', async () => {
    await store.set(CONNECTED_AT_KEY, clock.now());
    await requestMode(store, 'full-pull');

    const result = await run(rejectingZoho);

    expect(result.outcome).toBe('skipped');
    expect(result.retryAfterMs).toBeGreaterThan(0);
    expect((await loadStatus(store)).recentErrors).toEqual([]);
    // The requested action is kept for the retry.
    expect(await store.get(REQUEST_KEY)).toBe('full-pull');
  });

  it('reports refused credentials, then clears that error once a run gets through', async () => {
    const failed = await run(rejectingZoho);

    expect(failed.outcome).toBe('failed');
    expect((await loadStatus(store)).recentErrors[0]).toMatchObject({
      object: 'run',
      message: 'Zoho rejected the token',
    });

    zoho.add('Contacts', { Last_Name: 'Example' });
    const recovered = await run();

    expect(recovered.outcome).toBe('ok');
    expect((await loadStatus(store)).recentErrors).toEqual([]);
    expect((await loadStatus(store)).totals.peopleCreated).toBe(1);
  });

  it("continues a minute later when Twenty's request limit is reached", async () => {
    zoho.add('Accounts', { Account_Name: 'Fictitious Trading' });
    twenty.listUnlinkedCompanies = async () => {
      throw rateLimitError();
    };

    const stopped = await run();

    expect(stopped.outcome).toBe('ok');
    expect(stopped.retryAfterMs).toBe(60_000);
    expect(stopped.message).toContain('continues in a minute');
    expect((await loadStatus(store)).recentErrors).toEqual([]);

    twenty.listUnlinkedCompanies = FakeTwenty.prototype.listUnlinkedCompanies;
    const resumed = await run();

    expect(resumed.retryAfterMs).toBeUndefined();
    expect((await loadStatus(store)).totals.companiesCreated).toBe(1);
  });

  it('steps aside while another run holds the lock', async () => {
    await store.set('zoho-sync:lock', {
      owner: 'other',
      until: clock.now() + 60_000,
    });

    const result = await run();

    expect(result.outcome).toBe('skipped');
    expect(result.status).toBeNull();
  });
});
