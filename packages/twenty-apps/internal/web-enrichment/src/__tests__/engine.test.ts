import { beforeEach, describe, expect, it } from 'vitest';

import {
  FakeSearch,
  FakeTwenty,
  memoryStore,
  rateLimitError,
} from 'src/__tests__/fakes';
import type { EnrichmentMode } from 'src/enrich/config';
import { EnrichmentEngine } from 'src/enrich/engine';
import { loadSearchesToday } from 'src/enrich/state';

let twenty: FakeTwenty;
let search: FakeSearch;
let store: ReturnType<typeof memoryStore>;
const now = Date.parse('2026-10-17T08:00:00Z');

const runOnce = ({
  mode = 'ALL',
  dailySearchLimit = 100,
  maxSearchesThisRun = 100,
  withSearch = true,
}: {
  mode?: EnrichmentMode;
  dailySearchLimit?: number;
  maxSearchesThisRun?: number;
  withSearch?: boolean;
} = {}) =>
  new EnrichmentEngine({
    twenty,
    search: withSearch ? search.search : null,
    store,
    config: { mode, dailySearchLimit, secondsBetweenSearches: 5 },
    maxSearchesThisRun,
    budgetMs: 60_000,
    now: () => now,
    sleep: async () => {},
  }).run();

beforeEach(() => {
  twenty = new FakeTwenty();
  search = new FakeSearch();
  store = memoryStore();
});

describe('company websites', () => {
  it('takes websites from work emails first and searches only for the rest', async () => {
    const falcon = twenty.addCompany('Desert Falcon Logistics LLC');
    const pearl = twenty.addCompany('Gulf Pearl Industries', {
      country: 'Oman',
    });
    const unknown = twenty.addCompany('Nowhere Fictitious Holding');

    twenty.addPerson('Layla', 'Haddad', {
      companyId: falcon.id,
      emails: ['layla@desertfalcon.ae'],
    });
    search.pages = [
      {
        url: 'https://www.linkedin.com/company/gulf-pearl',
        title: 'Gulf Pearl Industries | LinkedIn',
        content: '',
      },
      {
        url: 'https://gulfpearl.om/en',
        title: 'Gulf Pearl Industries - Home',
        content: '',
      },
    ];

    const result = await runOnce({ mode: 'WEBSITES' });

    expect(twenty.companies.get(falcon.id)).toMatchObject({
      websiteSearch: 'FROM_EMAILS',
      domainName: { primaryLinkUrl: 'https://desertfalcon.ae' },
    });
    expect(twenty.companies.get(pearl.id)).toMatchObject({
      websiteSearch: 'FOUND',
      domainName: { primaryLinkUrl: 'https://gulfpearl.om' },
    });
    expect(twenty.companies.get(unknown.id)?.websiteSearch).toBe('NOT_FOUND');
    expect(search.queries).toEqual([
      'Nowhere Fictitious Holding official website',
      'Gulf Pearl Industries Oman official website',
    ]);
    expect(result.counts).toMatchObject({
      websitesFromEmails: 1,
      websitesFound: 1,
      websitesNotFound: 1,
      searches: 2,
    });
  });

  it('suggests instead of filling a website another company already has', async () => {
    twenty.addCompany('Desert Falcon Logistics', {
      domainName: { primaryLinkUrl: 'https://desertfalcon.ae' },
      websiteSearch: 'FOUND',
    });
    const copy = twenty.addCompany('Desert Falcon Logistics Dubai');

    twenty.addPerson('Omar', 'Farouk', {
      companyId: copy.id,
      emails: ['omar@desertfalcon.ae'],
    });

    await runOnce({ mode: 'WEBSITES' });

    expect(twenty.companies.get(copy.id)).toMatchObject({
      websiteSearch: 'REVIEW',
      domainName: { primaryLinkUrl: '' },
      websiteSuggestion: { primaryLinkUrl: 'https://desertfalcon.ae' },
    });
  });

  it('still fills websites from emails without SearXNG', async () => {
    const falcon = twenty.addCompany('Desert Falcon Logistics');
    const other = twenty.addCompany('Nowhere Fictitious Holding');

    twenty.addPerson('Layla', 'Haddad', {
      companyId: falcon.id,
      emails: ['layla@desertfalcon.ae'],
    });

    const result = await runOnce({ withSearch: false });

    expect(twenty.companies.get(falcon.id)?.websiteSearch).toBe('FROM_EMAILS');
    expect(twenty.companies.get(other.id)?.websiteSearch).toBeNull();
    expect(result.stopReason).toBe('no-search');
  });
});

describe('LinkedIn profiles', () => {
  it('fills confident profiles, suggests unsure ones, and skips people it cannot identify', async () => {
    const falcon = twenty.addCompany('Desert Falcon Logistics', {
      domainName: { primaryLinkUrl: 'https://desertfalcon.ae' },
    });
    const layla = twenty.addPerson('Layla', 'Haddad', { companyId: falcon.id });
    const omar = twenty.addPerson('Omar', 'Farouk', { companyId: falcon.id });
    const anonymous = twenty.addPerson('Sara', '', {
      emails: ['sara@gmail.com'],
    });

    search.pages = [
      {
        url: 'https://ae.linkedin.com/in/layla-haddad-1',
        title: 'Layla Haddad - Desert Falcon Logistics | LinkedIn',
        content: '',
      },
      {
        url: 'https://www.linkedin.com/in/omar-farouk-7',
        title: 'Omar Farouk - Falcon Desert Tours | LinkedIn',
        content: '',
      },
    ];

    const result = await runOnce({ mode: 'LINKEDIN' });

    expect(twenty.people.get(layla.id)).toMatchObject({
      linkedinSearch: 'FOUND',
      linkedinLink: {
        primaryLinkUrl: 'https://www.linkedin.com/in/layla-haddad-1',
      },
    });
    expect(twenty.people.get(omar.id)).toMatchObject({
      linkedinSearch: 'REVIEW',
      linkedinLink: { primaryLinkUrl: '' },
      linkedinSuggestion: {
        primaryLinkUrl: 'https://www.linkedin.com/in/omar-farouk-7',
      },
    });
    expect(twenty.people.get(anonymous.id)?.linkedinSearch).toBe(
      'NOT_ENOUGH_INFO',
    );
    expect(result.counts.searches).toBe(2);
  });
});

describe('limits', () => {
  it("stops at the day's searches and remembers them for the next run", async () => {
    for (const name of ['Alpha', 'Beta', 'Gamma']) {
      twenty.addCompany(`${name} Fictitious Trading`);
    }

    const first = await runOnce({ mode: 'WEBSITES', dailySearchLimit: 2 });

    expect(first.stopReason).toBe('daily-limit');
    expect(search.queries).toHaveLength(2);
    expect(await loadSearchesToday(store, now)).toBe(2);

    await runOnce({ mode: 'WEBSITES', dailySearchLimit: 2 });

    expect(search.queries).toHaveLength(2);
    expect(
      [...twenty.companies.values()].filter(
        (company) => !company.websiteSearch,
      ),
    ).toHaveLength(1);
  });

  it('leaves records undecided and stops searching when the engines are blocked', async () => {
    for (let index = 0; index < 8; index++) {
      twenty.addCompany(`Fictitious Company ${index}`);
    }
    search.blockedEngines = ['google: CAPTCHA', 'bing: timeout'];

    const result = await runOnce({ mode: 'WEBSITES' });

    expect(result.stopReason).toBe('engines-blocked');
    expect(result.message).toContain('google: CAPTCHA');
    expect(search.queries).toHaveLength(5);
    expect(
      [...twenty.companies.values()].every(
        (company) => company.websiteSearch === null,
      ),
    ).toBe(true);
  });

  it("stops at Twenty's request limit without losing the decisions to come", async () => {
    const falcon = twenty.addCompany('Desert Falcon Logistics');

    twenty.addPerson('Layla', 'Haddad', {
      companyId: falcon.id,
      emails: ['layla@desertfalcon.ae'],
    });
    twenty.refuseWrite = rateLimitError;

    const stopped = await runOnce();

    expect(stopped.stopReason).toBe('rate-limited');
    expect(twenty.companies.get(falcon.id)?.websiteSearch).toBeNull();

    twenty.refuseWrite = () => null;
    await runOnce();

    expect(twenty.companies.get(falcon.id)?.websiteSearch).toBe('FROM_EMAILS');
  });
});
