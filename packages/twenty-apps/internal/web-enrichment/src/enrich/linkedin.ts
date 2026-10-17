import type { LinkedinOutcome } from 'src/constants/search-outcomes';
import {
  distinctiveCompanyWords,
  mentionsCompany,
  nameKey,
  registrableDomain,
  siteLabel,
  words,
} from 'src/enrich/normalize';
import { isPersonalMailDomain } from 'src/enrich/website';
import type { SearchResult } from 'src/search/searxng';

export type LinkedinDecision = {
  outcome: LinkedinOutcome;
  url: string | null;
  suggestion: string | null;
};

export type PersonToFind = {
  firstName: string;
  lastName: string;
  companyName: string;
  emails: string[];
};

const PROFILE_URL =
  /^https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/([^/?#]+)/i;

export const profileUrl = (url: string): string | null => {
  const match = PROFILE_URL.exec(url.trim());

  return match ? `https://www.linkedin.com/in/${match[1]}` : null;
};

// First and last name, split from the first name when the last is missing.
const nameParts = (person: PersonToFind): [string, string] | null => {
  if (words(person.lastName).length > 0 && words(person.firstName).length > 0) {
    return [nameKey(person.firstName), nameKey(person.lastName)];
  }

  const all = words(`${person.firstName} ${person.lastName}`);

  return all.length >= 2
    ? [nameKey(all[0]), nameKey(all.slice(1).join(' '))]
    : null;
};

const workDomain = (person: PersonToFind): string | null =>
  person.emails
    .map((email) => registrableDomain(email.split('@')[1]?.trim() ?? ''))
    .find((domain) => domain.includes('.') && !isPersonalMailDomain(domain)) ??
  null;

// What to search for, or null when the name alone could be anyone.
export const linkedinQuery = (person: PersonToFind): string | null => {
  if (!nameParts(person)) {
    return null;
  }

  const companyHint = distinctiveCompanyWords(person.companyName)
    .slice(0, 4)
    .join(' ');
  const domain = workDomain(person);
  const hint = companyHint || (domain ? siteLabel(domain) : '');

  return hint
    ? `site:linkedin.com/in ${person.firstName} ${person.lastName} ${hint}`
        .replace(/\s+/g, ' ')
        .trim()
    : null;
};

// LinkedIn titles read "Name - Headline | LinkedIn".
const nameInTitle = (title: string): string =>
  title.split(/\s[-–—|]\s|\s\|/)[0] ?? '';

const worksThere = (person: PersonToFind, result: SearchResult): boolean => {
  const text = `${result.title} ${result.content}`;
  const domain = workDomain(person);

  return (
    mentionsCompany(person.companyName, text) ||
    (domain !== null &&
      siteLabel(domain).length >= 3 &&
      words(text).includes(siteLabel(domain)))
  );
};

// A profile is filled in only when its name and company match and no other
// profile in the results does too.
export const pickLinkedinProfile = (
  person: PersonToFind,
  results: SearchResult[],
): LinkedinDecision => {
  const parts = nameParts(person);

  if (!parts) {
    return { outcome: 'NOT_ENOUGH_INFO', url: null, suggestion: null };
  }

  const [first, last] = parts;
  const profiles = new Map<string, SearchResult>();

  for (const result of results) {
    const url = profileUrl(result.url);
    const titleName = nameKey(nameInTitle(result.title));

    if (url && titleName.includes(first) && titleName.includes(last)) {
      profiles.set(url.toLowerCase(), { ...result, url });
    }
  }

  const named = [...profiles.values()];
  const atCompany = named.filter((result) => worksThere(person, result));

  if (atCompany.length === 1) {
    return { outcome: 'FOUND', url: atCompany[0].url, suggestion: null };
  }
  if (atCompany.length > 1 || named.length === 1) {
    return {
      outcome: 'REVIEW',
      url: null,
      suggestion: (atCompany[0] ?? named[0]).url,
    };
  }

  return { outcome: 'NOT_FOUND', url: null, suggestion: null };
};
