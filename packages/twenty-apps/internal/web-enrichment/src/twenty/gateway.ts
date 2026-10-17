// Reads and writes Twenty people and companies through the GraphQL API.

export type GraphqlRequest = (
  query: string,
  variables?: Record<string, unknown>,
) => Promise<any>;

export class TwentyApiError extends Error {
  constructor(
    message: string,
    readonly codes: string[],
  ) {
    super(message);
    this.name = 'TwentyApiError';
  }

  get isRateLimited(): boolean {
    return this.codes.includes('RATE_LIMITED');
  }
}

export const graphqlErrorFromBody = (body: any): TwentyApiError | null => {
  const errors: any[] = body?.errors ?? [];

  if (errors.length === 0) {
    return null;
  }

  return new TwentyApiError(
    errors.map((error) => error.message).join('; '),
    errors.flatMap((error) =>
      [error.extensions?.code, error.extensions?.subCode].filter(
        (code): code is string => typeof code === 'string',
      ),
    ),
  );
};

export type CompanyToEnrich = {
  id: string;
  name: string;
  country: string;
};

export type PersonToEnrich = {
  id: string;
  firstName: string;
  lastName: string;
  emails: string[];
  companyName: string;
};

export type Page<T> = {
  records: T[];
  endCursor: string | null;
  hasNextPage: boolean;
};

export type TwentyApi = {
  pageCompaniesWithoutWebsite: (
    after: string | null,
  ) => Promise<Page<CompanyToEnrich>>;
  emailsByCompany: (companyIds: string[]) => Promise<Map<string, string[]>>;
  pagePeopleWithoutLinkedin: (
    after: string | null,
  ) => Promise<Page<PersonToEnrich>>;
  updateCompanies: (data: Record<string, unknown>[]) => Promise<void>;
  updatePeople: (data: Record<string, unknown>[]) => Promise<void>;
};

export const PAGE_SIZE = 50;
// Twenty refuses more than this many records in one mutation by default.
export const MUTATION_BATCH_SIZE = 50;

const EMPTY_LINK = (field: string) => ({
  or: [
    { [field]: { primaryLinkUrl: { is: 'NULL' } } },
    { [field]: { primaryLinkUrl: { eq: '' } } },
  ],
});

const emailsOf = (emails: any): string[] =>
  [emails?.primaryEmail, ...(emails?.additionalEmails ?? [])].filter(
    (email): email is string => typeof email === 'string' && email !== '',
  );

const nodes = (connection: any): any[] =>
  (connection?.edges ?? []).map((edge: { node: unknown }) => edge.node);

const pageOf = <T>(connection: any, map: (node: any) => T): Page<T> => ({
  records: nodes(connection).map(map),
  endCursor: connection?.pageInfo?.endCursor ?? null,
  hasNextPage: Boolean(connection?.pageInfo?.hasNextPage),
});

export const twentyGateway = (request: GraphqlRequest): TwentyApi => ({
  // Newest first, so records added after the backfill started come quickly.
  pageCompaniesWithoutWebsite: async (after) => {
    const data = await request(
      `query Companies($filter: CompanyFilterInput, $after: String) {
        companies(filter: $filter, orderBy: [{ createdAt: DescNullsLast }], first: ${PAGE_SIZE}, after: $after) {
          edges { node { id name address { addressCountry } } }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      {
        filter: {
          and: [{ websiteSearch: { is: 'NULL' } }, EMPTY_LINK('domainName')],
        },
        after,
      },
    );

    return pageOf(data.companies, (node) => ({
      id: node.id,
      name: node.name ?? '',
      country: node.address?.addressCountry ?? '',
    }));
  },

  emailsByCompany: async (companyIds) => {
    const emails = new Map<string, string[]>();
    let after: string | null = null;

    do {
      const data = await request(
        `query People($filter: PersonFilterInput, $after: String) {
          people(filter: $filter, first: 200, after: $after) {
            edges { node { companyId emails { primaryEmail additionalEmails } } }
            pageInfo { hasNextPage endCursor }
          }
        }`,
        { filter: { companyId: { in: companyIds } }, after },
      );

      for (const node of nodes(data.people)) {
        emails.set(node.companyId, [
          ...(emails.get(node.companyId) ?? []),
          ...emailsOf(node.emails),
        ]);
      }
      after = data.people.pageInfo.hasNextPage
        ? data.people.pageInfo.endCursor
        : null;
    } while (after);

    return emails;
  },

  pagePeopleWithoutLinkedin: async (after) => {
    const data = await request(
      `query People($filter: PersonFilterInput, $after: String) {
        people(filter: $filter, orderBy: [{ createdAt: DescNullsLast }], first: ${PAGE_SIZE}, after: $after) {
          edges { node { id name { firstName lastName } emails { primaryEmail additionalEmails } company { name } } }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      {
        filter: {
          and: [{ linkedinSearch: { is: 'NULL' } }, EMPTY_LINK('linkedinLink')],
        },
        after,
      },
    );

    return pageOf(data.people, (node) => ({
      id: node.id,
      firstName: node.name?.firstName ?? '',
      lastName: node.name?.lastName ?? '',
      emails: emailsOf(node.emails),
      companyName: node.company?.name ?? '',
    }));
  },

  // Partial updates: only the fields present in each entry change.
  updateCompanies: async (data) => {
    await request(
      `mutation Write($data: [CompanyCreateInput!]!) {
        createCompanies(data: $data, upsert: true) { id }
      }`,
      { data },
    );
  },

  updatePeople: async (data) => {
    await request(
      `mutation Write($data: [PersonCreateInput!]!) {
        createPeople(data: $data, upsert: true) { id }
      }`,
      { data },
    );
  },
});
