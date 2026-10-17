import type { CompanyCheck } from 'src/constants/search-outcomes';
import {
  hostMatchesCompany,
  hostOf,
  registrableDomain,
} from 'src/enrich/normalize';
import { isWorkMailDomain } from 'src/enrich/website';

export type CompanyForLinking = {
  id: string;
  name: string;
  website: string;
  // A website the company shares with another one (its group, a duplicate).
  sharedWebsite: string;
  emailDomains: string[];
};

export type PersonForLinking = {
  id: string;
  companyId: string | null;
  emails: string[];
  companyCheck: CompanyCheck | null;
  suggestedCompanyId: string | null;
};

export type LinkDecision = {
  companyCheck: CompanyCheck | null;
  suggestedCompanyId: string | null;
  // Set only to link a person who has no company yet.
  companyId?: string;
};

export const workDomainsOf = (emails: string[]): string[] => [
  ...new Set(
    emails
      .map((email) => registrableDomain(email.split('@')[1]?.trim() ?? ''))
      .filter(isWorkMailDomain),
  ),
];

// A company's domains: those it already has, its website, and the work
// domains of its people, used by two of them or matching the company's name.
// Domains are only ever added, never taken away.
export const learnEmailDomains = (
  companies: CompanyForLinking[],
  people: PersonForLinking[],
): Map<string, Set<string>> => {
  const learned = new Map<string, Set<string>>();
  const names = new Map<string, string>();

  for (const company of companies) {
    const domains = new Set(
      company.emailDomains.map((domain) => domain.trim().toLowerCase()),
    );

    for (const url of [company.website, company.sharedWebsite]) {
      const host = hostOf(url);

      if (host) {
        domains.add(registrableDomain(host));
      }
    }
    domains.delete('');
    learned.set(company.id, domains);
    names.set(company.id, company.name);
  }

  const usage = new Map<string, Map<string, number>>();

  for (const person of people) {
    if (!person.companyId || !learned.has(person.companyId)) {
      continue;
    }

    const counts = usage.get(person.companyId) ?? new Map<string, number>();

    for (const domain of workDomainsOf(person.emails)) {
      counts.set(domain, (counts.get(domain) ?? 0) + 1);
    }
    usage.set(person.companyId, counts);
  }

  for (const [companyId, counts] of usage) {
    for (const [domain, count] of counts) {
      if (count >= 2 || hostMatchesCompany(names.get(companyId), domain)) {
        learned.get(companyId)?.add(domain);
      }
    }
  }

  return learned;
};

export type LinkingContext = {
  learned: Map<string, Set<string>>;
  owners: Map<string, string[]>;
  // The company whose website is the domain, preferred when several fit.
  websiteOwner: Map<string, string>;
  // People without a company per domain that no company has.
  unlinkedByUnknownDomain: Map<string, number>;
};

export const linkingContext = (
  companies: CompanyForLinking[],
  people: PersonForLinking[],
  learned: Map<string, Set<string>>,
): LinkingContext => {
  const owners = new Map<string, string[]>();

  for (const [companyId, domains] of learned) {
    for (const domain of domains) {
      owners.set(domain, [...(owners.get(domain) ?? []), companyId]);
    }
  }

  const websiteOwner = new Map<string, string>();

  for (const company of companies) {
    const host = hostOf(company.website);

    if (host) {
      websiteOwner.set(registrableDomain(host), company.id);
    }
  }

  const unlinkedByUnknownDomain = new Map<string, number>();

  for (const person of people) {
    if (person.companyId) {
      continue;
    }
    for (const domain of workDomainsOf(person.emails)) {
      if (!owners.has(domain)) {
        unlinkedByUnknownDomain.set(
          domain,
          (unlinkedByUnknownDomain.get(domain) ?? 0) + 1,
        );
      }
    }
  }

  return { learned, owners, websiteOwner, unlinkedByUnknownDomain };
};

const preferredOwner = (
  context: LinkingContext,
  domain: string,
  owners: string[],
): string => {
  const websiteOwner = context.websiteOwner.get(domain);

  return websiteOwner && owners.includes(websiteOwner)
    ? websiteOwner
    : owners[0];
};

// People without a company are linked when exactly one company has their
// domain; anything else is only flagged. Existing links are never changed,
// and a person marked Checked is left as is.
export const decideCompanyCheck = (
  person: PersonForLinking,
  context: LinkingContext,
): LinkDecision => {
  if (person.companyCheck === 'CHECKED') {
    return {
      companyCheck: 'CHECKED',
      suggestedCompanyId: person.suggestedCompanyId,
    };
  }

  const domains = workDomainsOf(person.emails);
  const ownedDomain = domains.find((domain) => context.owners.has(domain));

  if (!person.companyId) {
    if (ownedDomain) {
      const owners = context.owners.get(ownedDomain) as string[];

      return owners.length === 1
        ? {
            companyCheck: 'LINKED',
            suggestedCompanyId: null,
            companyId: owners[0],
          }
        : {
            companyCheck: 'CHOOSE',
            suggestedCompanyId: preferredOwner(context, ownedDomain, owners),
          };
    }

    return {
      companyCheck: domains.some(
        (domain) => (context.unlinkedByUnknownDomain.get(domain) ?? 0) >= 2,
      )
        ? 'NO_COMPANY_FOR_DOMAIN'
        : null,
      suggestedCompanyId: null,
    };
  }

  const unchanged: LinkDecision = {
    companyCheck: person.companyCheck === 'LINKED' ? 'LINKED' : null,
    suggestedCompanyId: null,
  };
  const ownDomains = context.learned.get(person.companyId);

  if (!ownedDomain || domains.some((domain) => ownDomains?.has(domain))) {
    return unchanged;
  }

  return {
    companyCheck: 'OTHER_COMPANY',
    suggestedCompanyId: preferredOwner(
      context,
      ownedDomain,
      context.owners.get(ownedDomain) as string[],
    ),
  };
};
