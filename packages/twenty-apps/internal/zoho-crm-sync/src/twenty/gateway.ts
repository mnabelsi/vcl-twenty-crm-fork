import type { SyncedField } from 'src/sync/fields/values';
import type {
  TwentyCompany,
  TwentyOpportunity,
  TwentyPerson,
} from 'src/sync/mapping';

// Reads and writes Twenty people and companies through the GraphQL API. Kept
// to plain queries so the app does not depend on the generated client.

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

  get isInvalidPhone(): boolean {
    return (
      this.codes.includes('INVALID_PHONE_NUMBER') || /phone/i.test(this.message)
    );
  }

  get isRateLimited(): boolean {
    return this.codes.includes('RATE_LIMITED');
  }
}

export const PERSON_FIELDS = `
  id
  name { firstName lastName }
  emails { primaryEmail additionalEmails }
  phones { primaryPhoneNumber primaryPhoneCallingCode primaryPhoneCountryCode additionalPhones }
  jobTitle
  companyId
  company { id zohoAccountId }
  zohoContactId
  zohoSyncHash
  zohoFieldState
  zohoSyncedAt
  createdBy { source }
  updatedAt
  deletedAt
`;

export const COMPANY_FIELDS = `
  id
  name
  domainName { primaryLinkUrl primaryLinkLabel secondaryLinks }
  address { addressStreet1 addressStreet2 addressCity addressState addressPostcode addressCountry }
  accountOwnerId
  zohoAccountId
  zohoSyncHash
  zohoFieldState
  zohoSyncedAt
  createdBy { source }
  updatedAt
  deletedAt
`;

export const OPPORTUNITY_FIELDS = `
  id
  name
  amount { amountMicros currencyCode }
  closeDate
  stage
  companyId
  company { id zohoAccountId }
  pointOfContactId
  pointOfContact { id zohoContactId }
  ownerId
  zohoDealId
  zohoFieldState
  zohoSyncedAt
  createdBy { source }
  updatedAt
  deletedAt
`;

export type Collection = 'people' | 'companies' | 'opportunities';

const FILTER_TYPE: Record<Collection, string> = {
  people: 'PersonFilterInput',
  companies: 'CompanyFilterInput',
  opportunities: 'OpportunityFilterInput',
};

const BASE_FIELDS: Record<Collection, string> = {
  people: PERSON_FIELDS,
  companies: COMPANY_FIELDS,
  opportunities: OPPORTUNITY_FIELDS,
};

const LINK_FIELD: Record<Collection, string> = {
  people: 'zohoContactId',
  companies: 'zohoAccountId',
  opportunities: 'zohoDealId',
};

// The selection for the Zoho fields mirrored in Twenty, beyond the base ones.
export const selectionFor = (fields: SyncedField[], base: string): string => {
  const present = new Set(base.split(/[\s{}]+/).filter(Boolean));

  return fields
    .filter((field) => !present.has(field.twentyField))
    .map((field) => {
      switch (field.kind) {
        case 'currency':
          return `${field.twentyField} { amountMicros currencyCode }`;
        case 'link':
          return `${field.twentyField} { primaryLinkUrl primaryLinkLabel }`;
        default:
          return field.twentyField;
      }
    })
    .join('\n');
};

// Twenty refuses more than this many records in one mutation by default.
export const MUTATION_BATCH_SIZE = 50;
const FILTER_BATCH_SIZE = 100;
const PAGE_SIZE = 200;

const INCLUDING_DELETED = {
  or: [{ deletedAt: { is: 'NULL' } }, { deletedAt: { is: 'NOT_NULL' } }],
};

const UNLINKED = (field: string) => ({
  or: [{ [field]: { is: 'NULL' } }, { [field]: { eq: '' } }],
});

export type Page<T> = {
  records: T[];
  endCursor: string | null;
  hasNextPage: boolean;
};

const chunk = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
};

const nodes = <T>(connection: any): T[] =>
  (connection?.edges ?? []).map((edge: { node: T }) => edge.node);

export class TwentyGateway {
  private industryValues: string[] | null | undefined;
  private extraSelection: Record<Collection, string> = {
    people: '',
    companies: '',
    opportunities: '',
  };

  constructor(private readonly request: GraphqlRequest) {}

  // Adds the mirrored Zoho fields to every read of the collection.
  useFields(collection: Collection, fields: SyncedField[]): void {
    this.extraSelection[collection] = selectionFor(
      fields,
      BASE_FIELDS[collection],
    );
  }

  private fieldsOf(collection: Collection): string {
    return `${BASE_FIELDS[collection]}\n${this.extraSelection[collection]}`;
  }

  private async findAll<T>(
    collection: Collection,
    filters: Record<string, unknown>[],
  ): Promise<T[]> {
    const fields = this.fieldsOf(collection);
    const records: T[] = [];

    for (const filter of filters) {
      let after: string | null = null;

      do {
        const data = await this.request(
          `query Find($filter: ${FILTER_TYPE[collection]}, $after: String) {
            ${collection}(filter: $filter, first: ${PAGE_SIZE}, after: $after) {
              edges { node { ${fields} } }
              pageInfo { hasNextPage endCursor }
            }
          }`,
          { filter, after },
        );
        const connection = data[collection];

        records.push(...nodes<T>(connection));
        after = connection.pageInfo.hasNextPage
          ? connection.pageInfo.endCursor
          : null;
      } while (after);
    }

    return records;
  }

  findPeopleByZohoIds(zohoIds: string[]): Promise<TwentyPerson[]> {
    return this.findAll<TwentyPerson>(
      'people',
      chunk(zohoIds, FILTER_BATCH_SIZE).map((ids) => ({
        and: [{ zohoContactId: { in: ids } }, INCLUDING_DELETED],
      })),
    );
  }

  findPeopleByEmails(emails: string[]): Promise<TwentyPerson[]> {
    return this.findAll<TwentyPerson>(
      'people',
      chunk(emails, FILTER_BATCH_SIZE).map((batch) => ({
        emails: { primaryEmail: { in: batch } },
      })),
    );
  }

  findPeopleByCompanyIds(companyIds: string[]): Promise<TwentyPerson[]> {
    return this.findAll<TwentyPerson>(
      'people',
      chunk(companyIds, FILTER_BATCH_SIZE).map((ids) => ({
        companyId: { in: ids },
      })),
    );
  }

  findPeopleByIds(ids: string[]): Promise<TwentyPerson[]> {
    return this.findAll<TwentyPerson>(
      'people',
      chunk(ids, FILTER_BATCH_SIZE).map((batch) => ({
        id: { in: batch },
      })),
    );
  }

  findCompaniesByZohoIds(zohoIds: string[]): Promise<TwentyCompany[]> {
    return this.findAll<TwentyCompany>(
      'companies',
      chunk(zohoIds, FILTER_BATCH_SIZE).map((ids) => ({
        and: [{ zohoAccountId: { in: ids } }, INCLUDING_DELETED],
      })),
    );
  }

  findCompaniesByIds(ids: string[]): Promise<TwentyCompany[]> {
    return this.findAll<TwentyCompany>(
      'companies',
      chunk(ids, FILTER_BATCH_SIZE).map((batch) => ({
        id: { in: batch },
      })),
    );
  }

  findOpportunitiesByZohoIds(zohoIds: string[]): Promise<TwentyOpportunity[]> {
    return this.findAll<TwentyOpportunity>(
      'opportunities',
      chunk(zohoIds, FILTER_BATCH_SIZE).map((ids) => ({
        and: [{ zohoDealId: { in: ids } }, INCLUDING_DELETED],
      })),
    );
  }

  // Every company that is not linked to Zoho yet, to match new Zoho accounts
  // by website or name.
  listUnlinkedCompanies(): Promise<TwentyCompany[]> {
    return this.findAll<TwentyCompany>('companies', [
      UNLINKED('zohoAccountId'),
    ]);
  }

  async listWorkspaceMembers(): Promise<{ id: string; userEmail: string }[]> {
    const data = await this.request(
      `query { workspaceMembers(first: ${PAGE_SIZE}) { edges { node { id userEmail } } } }`,
    );

    return nodes(data.workspaceMembers);
  }

  // Option values of the company "industry" select, when the workspace has one.
  async companyIndustryValues(): Promise<string[] | null> {
    if (this.industryValues !== undefined) {
      return this.industryValues;
    }

    try {
      const data = await this.request(
        `query { company: __type(name: "CompanyUpdateInput") { inputFields { name type { kind name ofType { name } } } } }`,
      );
      const field = data.company?.inputFields?.find(
        (inputField: { name: string }) => inputField.name === 'industry',
      );
      const enumName =
        field?.type?.kind === 'ENUM'
          ? field.type.name
          : field?.type?.ofType?.name;

      if (!enumName) {
        this.industryValues = null;

        return null;
      }

      const enumData = await this.request(
        `query Values($name: String!) { __type(name: $name) { kind enumValues { name } } }`,
        { name: enumName },
      );

      this.industryValues =
        enumData.__type?.kind === 'ENUM'
          ? enumData.__type.enumValues.map(
              (value: { name: string }) => value.name,
            )
          : null;
    } catch {
      this.industryValues = null;
    }

    return this.industryValues ?? null;
  }

  async pageUpdatedSince<T>(
    collection: Collection,
    since: string,
    after: string | null,
    first = 100,
  ): Promise<Page<T>> {
    const fields = this.fieldsOf(collection);
    const data = await this.request(
      `query Updated($filter: ${FILTER_TYPE[collection]}, $after: String) {
        ${collection}(
          filter: $filter
          orderBy: [{ updatedAt: AscNullsFirst }, { id: AscNullsFirst }]
          first: ${first}
          after: $after
        ) {
          edges { node { ${fields} } }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { filter: { updatedAt: { gt: since } }, after },
    );
    const connection = data[collection];

    return {
      records: nodes<T>(connection),
      endCursor: connection.pageInfo.endCursor ?? null,
      hasNextPage: Boolean(connection.pageInfo.hasNextPage),
    };
  }

  async pageUnlinked<T>(
    collection: Collection,
    after: string | null,
    first = 100,
  ): Promise<Page<T>> {
    const fields = this.fieldsOf(collection);
    const data = await this.request(
      `query Unlinked($filter: ${FILTER_TYPE[collection]}, $after: String) {
        ${collection}(filter: $filter, orderBy: [{ id: AscNullsFirst }], first: ${first}, after: $after) {
          edges { node { ${fields} } }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { filter: UNLINKED(LINK_FIELD[collection]), after },
    );
    const connection = data[collection];

    return {
      records: nodes<T>(connection),
      endCursor: connection.pageInfo.endCursor ?? null,
      hasNextPage: Boolean(connection.pageInfo.hasNextPage),
    };
  }

  async createPeople(data: Record<string, unknown>[]): Promise<TwentyPerson[]> {
    return this.write<TwentyPerson>(
      'createPeople',
      'PersonCreateInput',
      this.fieldsOf('people'),
      data,
      false,
    );
  }

  // Partial updates: only the fields present in each entry change.
  async updatePeople(data: Record<string, unknown>[]): Promise<TwentyPerson[]> {
    return this.write<TwentyPerson>(
      'createPeople',
      'PersonCreateInput',
      this.fieldsOf('people'),
      data,
      true,
    );
  }

  async createCompanies(
    data: Record<string, unknown>[],
  ): Promise<TwentyCompany[]> {
    return this.write<TwentyCompany>(
      'createCompanies',
      'CompanyCreateInput',
      this.fieldsOf('companies'),
      data,
      false,
    );
  }

  async updateCompanies(
    data: Record<string, unknown>[],
  ): Promise<TwentyCompany[]> {
    return this.write<TwentyCompany>(
      'createCompanies',
      'CompanyCreateInput',
      this.fieldsOf('companies'),
      data,
      true,
    );
  }

  async createOpportunities(
    data: Record<string, unknown>[],
  ): Promise<TwentyOpportunity[]> {
    return this.write<TwentyOpportunity>(
      'createOpportunities',
      'OpportunityCreateInput',
      this.fieldsOf('opportunities'),
      data,
      false,
    );
  }

  async updateOpportunities(
    data: Record<string, unknown>[],
  ): Promise<TwentyOpportunity[]> {
    return this.write<TwentyOpportunity>(
      'createOpportunities',
      'OpportunityCreateInput',
      this.fieldsOf('opportunities'),
      data,
      true,
    );
  }

  private async write<T>(
    mutation: string,
    inputType: string,
    fields: string,
    data: Record<string, unknown>[],
    upsert: boolean,
  ): Promise<T[]> {
    const results: T[] = [];

    for (const batch of chunk(data, MUTATION_BATCH_SIZE)) {
      const response = await this.request(
        `mutation Write($data: [${inputType}!]!) {
          ${mutation}(data: $data${upsert ? ', upsert: true' : ''}) { ${fields} }
        }`,
        { data: batch },
      );

      results.push(...(response[mutation] as T[]));
    }

    return results;
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
