import type { WebsiteOutcome } from 'src/constants/search-outcomes';
import {
  hostMatchesCompany,
  hostOf,
  mentionsCompany,
  registrableDomain,
  siteLabel,
} from 'src/enrich/normalize';
import type { SearchResult } from 'src/search/searxng';

export type WebsiteDecision = {
  outcome: WebsiteOutcome;
  url: string | null;
  suggestion: string | null;
};

const PERSONAL_MAIL_LABELS = new Set([
  'gmail',
  'googlemail',
  'yahoo',
  'ymail',
  'rocketmail',
  'hotmail',
  'outlook',
  'live',
  'msn',
  'icloud',
  'aol',
  'protonmail',
  'gmx',
  'yandex',
  'rediffmail',
  'qq',
]);

// Personal mailboxes from providers and Gulf internet providers.
const PERSONAL_MAIL_DOMAINS = new Set([
  'me.com',
  'mac.com',
  'mail.com',
  'proton.me',
  'zoho.com',
  'zohomail.com',
  'inbox.com',
  '163.com',
  '126.com',
  'web.de',
  't-online.de',
  'emirates.net.ae',
  'eim.ae',
  'omantel.net.om',
  'qatar.net.qa',
  'batelco.com.bh',
  'tedata.net.eg',
  'link.net',
]);

const isPersonalMailDomain = (domain: string): boolean =>
  PERSONAL_MAIL_DOMAINS.has(domain) ||
  PERSONAL_MAIL_LABELS.has(siteLabel(domain));

// A company's own mail domain. Gulf government addresses typed without their
// country ("moe.gov" for "moe.gov.ae") are typos, not websites.
export const isWorkMailDomain = (domain: string): boolean =>
  domain.includes('.') &&
  !domain.endsWith('.gov') &&
  !isPersonalMailDomain(domain);

// Sites that talk about companies rather than belong to them.
const DIRECTORY_LABELS = new Set([
  'linkedin',
  'facebook',
  'instagram',
  'twitter',
  'x',
  'youtube',
  'tiktok',
  'pinterest',
  'wikipedia',
  'wikiwand',
  'wikidata',
  'crunchbase',
  'zoominfo',
  'bloomberg',
  'reuters',
  'dnb',
  'glassdoor',
  'indeed',
  'bayt',
  'naukrigulf',
  'gulftalent',
  'yellowpages',
  'yello',
  'opencorporates',
  'zawya',
  'tradearabia',
  'kompass',
  'rocketreach',
  'apollo',
  'signalhire',
  'lusha',
  'contactout',
  'craft',
  'owler',
  'cbinsights',
  'pitchbook',
  'similarweb',
  'google',
  'bing',
  'duckduckgo',
  'yahoo',
  'apple',
  'amazon',
  'github',
  'medium',
  'reddit',
  'quora',
  'emis',
  'manta',
  'bizapedia',
  'tracxn',
  'f6s',
  'clutch',
  'goodfirms',
  'trustpilot',
  'ambitionbox',
  'comparably',
  'wellfound',
  'mapquest',
  'foursquare',
  'tripadvisor',
  'cylex',
  'hotfrog',
  'dubizzle',
  'gulfnews',
  'khaleejtimes',
  'arabnews',
  'thenationalnews',
]);

const isDirectory = (host: string): boolean =>
  DIRECTORY_LABELS.has(siteLabel(host));

const asUrl = (domain: string): string => `https://${domain}`;

// The website most of the company's people use for their work email. One
// person's address only counts when it looks like the company's name.
export const websiteFromEmails = (
  companyName: string,
  emails: string[],
): WebsiteDecision | null => {
  const counts = new Map<string, number>();

  for (const email of emails) {
    const domain = registrableDomain(email.split('@')[1]?.trim() ?? '');

    if (isWorkMailDomain(domain)) {
      counts.set(domain, (counts.get(domain) ?? 0) + 1);
    }
  }

  const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  if (!top) {
    return null;
  }

  const [domain, count] = top;
  const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
  const agreed = count >= 2 && count / total >= 0.6;

  return agreed ||
    (count / total >= 0.6 && hostMatchesCompany(companyName, domain))
    ? { outcome: 'FROM_EMAILS', url: asUrl(domain), suggestion: null }
    : { outcome: 'REVIEW', url: null, suggestion: asUrl(domain) };
};

export const websiteQuery = (companyName: string, country: string): string =>
  [companyName, country, 'official website'].filter(Boolean).join(' ');

// The company's own site among the results: its address must look like the
// company's name, near the top or with the name in the page title.
export const pickWebsite = (
  companyName: string,
  results: SearchResult[],
): WebsiteDecision => {
  const candidates = results
    .slice(0, 10)
    .map((result, rank) => ({ result, rank, host: hostOf(result.url) }))
    .filter(({ host }) => host !== '' && !isDirectory(host));

  const named = candidates.find(({ host }) =>
    hostMatchesCompany(companyName, host),
  );

  if (
    named &&
    (named.rank < 5 || mentionsCompany(companyName, named.result.title))
  ) {
    return {
      outcome: 'FOUND',
      url: asUrl(registrableDomain(named.host)),
      suggestion: null,
    };
  }

  const titled =
    named ??
    candidates.find(({ result }) => mentionsCompany(companyName, result.title));

  return titled
    ? {
        outcome: 'REVIEW',
        url: null,
        suggestion: asUrl(registrableDomain(titled.host)),
      }
    : { outcome: 'NOT_FOUND', url: null, suggestion: null };
};
