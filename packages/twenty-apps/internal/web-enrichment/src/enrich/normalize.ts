// Lowercase words without accents or punctuation, so "Al-Jarba", "Al Jarba"
// and "AL JARBA" read the same.
export const words = (value: unknown): string[] =>
  typeof value === 'string'
    ? value
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/\./g, '')
        .split(/[^\p{L}\p{N}]+/u)
        .filter((word) => word !== '')
    : [];

// Common spellings of the same Arabic names in Latin script.
const NAME_SPELLINGS: Record<string, string> = {
  mohammed: 'muhammad',
  mohamed: 'muhammad',
  mohammad: 'muhammad',
  mohamad: 'muhammad',
  muhammed: 'muhammad',
  mohd: 'muhammad',
  ahmed: 'ahmad',
  abdulla: 'abdullah',
  abdallah: 'abdullah',
  abdel: 'abdul',
  abd: 'abdul',
  youssef: 'yousef',
  yousuf: 'yousef',
  yusuf: 'yousef',
  hussain: 'hussein',
  husain: 'hussein',
  hossam: 'hussam',
  khaled: 'khalid',
  mahmood: 'mahmoud',
  mahmud: 'mahmoud',
};

// A person's name as one string, so "Abdul Rahman" matches "Abdulrahman".
export const nameKey = (value: unknown): string =>
  words(value)
    .map((word) => NAME_SPELLINGS[word] ?? word)
    .join('');

const LEGAL_FORMS = new Set([
  'llc',
  'ltd',
  'limited',
  'inc',
  'incorporated',
  'corp',
  'corporation',
  'plc',
  'pjsc',
  'psc',
  'pvt',
  'gmbh',
  'sa',
  'sae',
  'saog',
  'saoc',
  'wll',
  'fze',
  'fzco',
  'fzllc',
  'fz',
  'co',
  'company',
  'est',
  'establishment',
]);

const STOP_WORDS = new Set(['the', 'and', 'of', 'for', 'in', 'al', 'el']);

// Words too common in company names to tell two companies apart.
const GENERIC_WORDS = new Set([
  'group',
  'holding',
  'holdings',
  'international',
  'intl',
  'trading',
  'general',
  'national',
  'services',
  'service',
  'solutions',
  'contracting',
  'industries',
  'industrial',
  'enterprises',
  'global',
  'middle',
  'east',
  'investment',
  'investments',
  'development',
  'consulting',
  'consultancy',
  'technologies',
  'technology',
  'systems',
  'uae',
  'ksa',
  'saudi',
  'arabia',
  'oman',
  'qatar',
  'kuwait',
  'bahrain',
  'egypt',
  'dubai',
  'abu',
  'dhabi',
]);

// The words that name a company, without its legal form.
export const companyWords = (name: unknown): string[] =>
  words(name).filter((word) => !LEGAL_FORMS.has(word) && !STOP_WORDS.has(word));

export const distinctiveCompanyWords = (name: unknown): string[] => {
  const all = companyWords(name);
  const distinctive = all.filter(
    (word) => word.length >= 3 && !GENERIC_WORDS.has(word),
  );

  return distinctive.length > 0 ? distinctive : all;
};

// Whether a text (a page title, a LinkedIn headline) names the company: its
// first two telling words side by side, so "Falcon Desert Tours" does not
// pass for "Desert Falcon Logistics".
export const mentionsCompany = (
  companyName: unknown,
  text: string,
): boolean => {
  const distinctive = distinctiveCompanyWords(companyName);
  const textWords = companyWords(text);

  if (distinctive.length <= 1) {
    return distinctive.length === 1 && textWords.includes(distinctive[0]);
  }

  const compactText = textWords.join('');

  return (
    compactText.includes(distinctive.slice(0, 2).join('')) ||
    compactText.includes(companyWords(companyName).join(''))
  );
};

// Second-level labels under which countries register names, as in .com.sa.
const SECOND_LEVEL = new Set([
  'com',
  'co',
  'gov',
  'org',
  'net',
  'edu',
  'ac',
  'sch',
  'mil',
  'ltd',
]);

export const hostOf = (url: unknown): string => {
  if (typeof url !== 'string' || url.trim() === '') {
    return '';
  }

  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(url.trim())
      ? url.trim()
      : `https://${url.trim()}`;

    return new URL(withScheme).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
};

// "careers.acme.com" -> "acme.com", "moe.gov.ae" -> "moe.gov.ae".
export const registrableDomain = (host: string): string => {
  const parts = host.toLowerCase().split('.').filter(Boolean);

  if (parts.length <= 2) {
    return parts.join('.');
  }

  const hasSecondLevel =
    parts[parts.length - 1].length === 2 &&
    SECOND_LEVEL.has(parts[parts.length - 2]);

  return parts.slice(hasSecondLevel ? -3 : -2).join('.');
};

// The name part of a domain: "acme" for "acme.com.sa".
export const siteLabel = (host: string): string =>
  registrableDomain(host).split('.')[0] ?? '';

// Whether a website's address looks like the company's name: "tabreed.ae"
// for "Tabreed Oman SAOC", "lt.com" for "Larsen & Toubro" by its initials.
export const hostMatchesCompany = (
  companyName: unknown,
  host: string,
): boolean => {
  const label = siteLabel(host).replace(/-/g, '');
  const all = companyWords(companyName);

  if (label.length < 2 || all.length === 0) {
    return false;
  }

  const compact = all.join('');
  const initials = all.map((word) => word[0]).join('');

  return (
    (label.length >= 4 && compact.includes(label)) ||
    all.some((word) => word.length >= 4 && label.includes(word)) ||
    (label.length >= 2 && label === initials)
  );
};
