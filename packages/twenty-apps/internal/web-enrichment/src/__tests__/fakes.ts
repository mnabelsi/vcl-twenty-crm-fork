import type { CompanyCheck } from 'src/constants/search-outcomes';
import type { KeyValueStore } from 'src/enrich/state';
import { hostOf } from 'src/enrich/normalize';
import type { SearchResponse, SearchResult } from 'src/search/searxng';
import {
  type CompanyToEnrich,
  PAGE_SIZE,
  type PersonToEnrich,
  TwentyApiError,
  type TwentyApi,
} from 'src/twenty/gateway';

// In-memory stand-ins for Twenty and SearXNG, close enough to the real ones
// for the enrichment rules. Names are fictitious.

export const memoryStore = (): KeyValueStore & {
  data: Map<string, unknown>;
} => {
  const data = new Map<string, unknown>();

  return {
    data,
    get: async <T>(key: string) =>
      data.has(key) ? (structuredClone(data.get(key)) as T) : null,
    set: async (key, value) => {
      data.set(key, structuredClone(value));
    },
    delete: async (key) => data.delete(key),
  };
};

type StoredCompany = {
  id: string;
  name: string;
  country: string;
  domainName: { primaryLinkUrl: string };
  websiteSearch: string | null;
  websiteSuggestion: { primaryLinkUrl: string } | null;
  emailDomains: string[];
  createdAt: number;
};

type StoredPerson = {
  id: string;
  firstName: string;
  lastName: string;
  emails: string[];
  companyId: string | null;
  linkedinLink: { primaryLinkUrl: string };
  linkedinSearch: string | null;
  linkedinSuggestion: { primaryLinkUrl: string } | null;
  companyCheck: CompanyCheck | null;
  suggestedCompanyId: string | null;
  createdAt: number;
};

let counter = 0;

const page = <T extends { id: string; createdAt: number }, R>(
  records: T[],
  after: string | null,
  map: (record: T) => R,
): { records: R[]; endCursor: string | null; hasNextPage: boolean } => {
  const sorted = [...records].sort((a, b) => b.createdAt - a.createdAt);
  const start = after
    ? sorted.findIndex((record) => record.id === after) + 1
    : 0;
  const slice = sorted.slice(start, start + PAGE_SIZE);

  return {
    records: slice.map(map),
    endCursor: slice[slice.length - 1]?.id ?? null,
    hasNextPage: sorted.length > start + PAGE_SIZE,
  };
};

export class FakeTwenty implements TwentyApi {
  companies = new Map<string, StoredCompany>();
  people = new Map<string, StoredPerson>();
  // Lets a test refuse writes, as Twenty does once its request limit is hit.
  refuseWrite: () => Error | null = () => null;

  addCompany(name: string, data: Partial<StoredCompany> = {}): StoredCompany {
    const company: StoredCompany = {
      id: `company-${++counter}`,
      name,
      country: '',
      domainName: { primaryLinkUrl: '' },
      websiteSearch: null,
      websiteSuggestion: null,
      emailDomains: [],
      createdAt: counter,
      ...data,
    };

    this.companies.set(company.id, company);

    return company;
  }

  addPerson(
    firstName: string,
    lastName: string,
    data: Partial<StoredPerson> = {},
  ): StoredPerson {
    const person: StoredPerson = {
      id: `person-${++counter}`,
      firstName,
      lastName,
      emails: [],
      companyId: null,
      linkedinLink: { primaryLinkUrl: '' },
      linkedinSearch: null,
      linkedinSuggestion: null,
      companyCheck: null,
      suggestedCompanyId: null,
      createdAt: counter,
      ...data,
    };

    this.people.set(person.id, person);

    return person;
  }

  async pageCompaniesWithoutWebsite(after: string | null) {
    return page(
      [...this.companies.values()].filter(
        (company) =>
          company.websiteSearch === null && !company.domainName.primaryLinkUrl,
      ),
      after,
      (company): CompanyToEnrich => ({
        id: company.id,
        name: company.name,
        country: company.country,
      }),
    );
  }

  async emailsByCompany(companyIds: string[]) {
    const emails = new Map<string, string[]>();

    for (const person of this.people.values()) {
      if (person.companyId && companyIds.includes(person.companyId)) {
        emails.set(person.companyId, [
          ...(emails.get(person.companyId) ?? []),
          ...person.emails,
        ]);
      }
    }

    return emails;
  }

  async pagePeopleWithoutLinkedin(after: string | null) {
    return page(
      [...this.people.values()].filter(
        (person) =>
          person.linkedinSearch === null && !person.linkedinLink.primaryLinkUrl,
      ),
      after,
      (person): PersonToEnrich => ({
        id: person.id,
        firstName: person.firstName,
        lastName: person.lastName,
        emails: person.emails,
        companyName: person.companyId
          ? (this.companies.get(person.companyId)?.name ?? '')
          : '',
      }),
    );
  }

  async listCompaniesForLinking() {
    return [...this.companies.values()].map((company) => ({
      id: company.id,
      name: company.name,
      website: company.domainName.primaryLinkUrl,
      sharedWebsite:
        company.websiteSearch === 'SHARED'
          ? (company.websiteSuggestion?.primaryLinkUrl ?? '')
          : '',
      emailDomains: [...company.emailDomains],
    }));
  }

  async listPeopleForLinking() {
    return [...this.people.values()].map((person) => ({
      id: person.id,
      companyId: person.companyId,
      emails: [...person.emails],
      companyCheck: person.companyCheck,
      suggestedCompanyId: person.suggestedCompanyId,
    }));
  }

  async updateCompanies(data: Record<string, unknown>[]) {
    const refusal = this.refuseWrite();

    if (refusal) {
      throw refusal;
    }

    // Twenty keeps one company per website.
    for (const entry of data) {
      const url = (entry.domainName as { primaryLinkUrl: string } | undefined)
        ?.primaryLinkUrl;
      const taken = [...this.companies.values()].some(
        (company) =>
          company.id !== entry.id &&
          url &&
          hostOf(company.domainName.primaryLinkUrl) === hostOf(url),
      );

      if (taken) {
        throw new TwentyApiError('A duplicate entry was detected', [
          'BAD_USER_INPUT',
        ]);
      }
    }
    for (const entry of data) {
      Object.assign(this.companies.get(entry.id as string)!, entry);
    }
  }

  async updatePeople(data: Record<string, unknown>[]) {
    const refusal = this.refuseWrite();

    if (refusal) {
      throw refusal;
    }
    for (const entry of data) {
      Object.assign(this.people.get(entry.id as string)!, entry);
    }
  }
}

export const rateLimitError = () =>
  new TwentyApiError(
    'Rate limit exceeded for application: 500 requests per 60s.',
    ['RATE_LIMITED'],
  );

// Answers each query from a list of pages it "knows", nothing otherwise.
export class FakeSearch {
  queries: string[] = [];
  pages: SearchResult[] = [];
  blockedEngines: string[] = [];

  search = async (query: string): Promise<SearchResponse> => {
    this.queries.push(query);

    if (this.blockedEngines.length > 0) {
      return {
        results: [],
        conclusive: false,
        unresponsiveEngines: this.blockedEngines,
      };
    }

    const terms = query
      .toLowerCase()
      .replace('site:linkedin.com/in', '')
      .replace('official website', '')
      .split(/\s+/)
      .filter(Boolean);
    const results = this.pages.filter((result) => {
      const text = `${result.url} ${result.title}`.toLowerCase();

      return terms.filter((term) => text.includes(term)).length >= 2;
    });

    return { results, conclusive: true, unresponsiveEngines: [] };
  };
}
