import {
  decideCompanyCheck,
  learnEmailDomains,
  linkingContext,
} from 'src/link/domains';
import {
  MUTATION_BATCH_SIZE,
  TwentyApiError,
  type TwentyApi,
} from 'src/twenty/gateway';

export type LinkingApi = Pick<
  TwentyApi,
  | 'listCompaniesForLinking'
  | 'listPeopleForLinking'
  | 'updateCompanies'
  | 'updatePeople'
>;

export type LinkCounts = {
  companiesWithNewDomains: number;
  peopleLinked: number;
  severalCompaniesFit: number;
  noCompanyForDomain: number;
  emailOfAnotherCompany: number;
  errors: number;
};

const sameDomains = (current: string[], learned: Set<string>): boolean =>
  current.length === learned.size &&
  current.every((domain) => learned.has(domain));

// One sweep over every company and person: learns the domains of companies,
// links people who have none, and flags the rest for a person to check.
export const linkPeopleToCompanies = async (
  twenty: LinkingApi,
): Promise<LinkCounts> => {
  const counts: LinkCounts = {
    companiesWithNewDomains: 0,
    peopleLinked: 0,
    severalCompaniesFit: 0,
    noCompanyForDomain: 0,
    emailOfAnotherCompany: 0,
    errors: 0,
  };
  const companies = await twenty.listCompaniesForLinking();
  const people = await twenty.listPeopleForLinking();
  const learned = learnEmailDomains(companies, people);
  const companyWrites = companies
    .filter(
      (company) =>
        !sameDomains(
          company.emailDomains,
          learned.get(company.id) ?? new Set(),
        ),
    )
    .map((company) => ({
      id: company.id,
      emailDomains: [...(learned.get(company.id) ?? [])].sort(),
    }));

  counts.companiesWithNewDomains = companyWrites.length;
  counts.errors += await writeAll(
    (data) => twenty.updateCompanies(data),
    companyWrites,
  );

  const context = linkingContext(companies, people, learned);
  const personWrites: Record<string, unknown>[] = [];

  for (const person of people) {
    const decision = decideCompanyCheck(person, context);

    if (decision.companyId) {
      counts.peopleLinked += 1;
    }
    if (decision.companyCheck === 'CHOOSE') {
      counts.severalCompaniesFit += 1;
    } else if (decision.companyCheck === 'NO_COMPANY_FOR_DOMAIN') {
      counts.noCompanyForDomain += 1;
    } else if (decision.companyCheck === 'OTHER_COMPANY') {
      counts.emailOfAnotherCompany += 1;
    }

    if (
      decision.companyId ||
      decision.companyCheck !== person.companyCheck ||
      decision.suggestedCompanyId !== person.suggestedCompanyId
    ) {
      personWrites.push({
        id: person.id,
        companyCheck: decision.companyCheck,
        suggestedCompanyId: decision.suggestedCompanyId,
        ...(decision.companyId ? { companyId: decision.companyId } : {}),
      });
    }
  }

  counts.errors += await writeAll(
    (data) => twenty.updatePeople(data),
    personWrites,
  );

  return counts;
};

// Writes in batches, record by record when a batch is refused; returns the
// number of records Twenty refused. Its request limit stops the sweep.
const writeAll = async (
  update: (data: Record<string, unknown>[]) => Promise<void>,
  rows: Record<string, unknown>[],
): Promise<number> => {
  let refused = 0;

  for (let index = 0; index < rows.length; index += MUTATION_BATCH_SIZE) {
    const batch = rows.slice(index, index + MUTATION_BATCH_SIZE);

    try {
      await update(batch);
      continue;
    } catch (error) {
      if (error instanceof TwentyApiError && error.isRateLimited) {
        throw error;
      }
    }

    for (const row of batch) {
      try {
        await update([row]);
      } catch (error) {
        if (error instanceof TwentyApiError && error.isRateLimited) {
          throw error;
        }
        refused += 1;
      }
    }
  }

  return refused;
};
