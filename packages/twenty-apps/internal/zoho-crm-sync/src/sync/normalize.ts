import { createHash } from 'crypto';
import {
  type CountryCode,
  parsePhoneNumberFromString,
} from 'libphonenumber-js';

export type PhoneValue = {
  // National significant number, the way Twenty stores it: 501234567
  number: string;
  // With the plus sign, the way Twenty stores it: +971
  callingCode: string;
  // ISO country, empty when the calling code is shared by several countries
  countryCode: string;
};

export const cleanText = (value: unknown): string =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';

export const cleanEmail = (value: unknown): string =>
  cleanText(value).toLowerCase();

// Reads a phone number written by a person (Zoho keeps whatever was typed) or
// stored by Twenty. Numbers without a +country prefix use the fallback country.
export const parsePhone = (
  raw: unknown,
  fallbackCountry: string | null,
): PhoneValue | null => {
  const text = cleanText(raw).replace(/^00(?=[1-9])/, '+');

  if (text === '') {
    return null;
  }

  const parsed = parsePhoneNumberFromString(
    text,
    fallbackCountry
      ? { defaultCountry: fallbackCountry as CountryCode }
      : undefined,
  );

  if (!parsed || !parsed.isPossible()) {
    return null;
  }

  return {
    number: parsed.nationalNumber,
    callingCode: `+${parsed.countryCallingCode}`,
    countryCode: parsed.country ?? '',
  };
};

export const phoneFromTwenty = (
  number: string | null | undefined,
  callingCode: string | null | undefined,
  countryCode: string | null | undefined,
): PhoneValue | null => {
  const digits = cleanText(number);

  if (digits === '') {
    return null;
  }

  const prefix = cleanText(callingCode);
  const parsed = parsePhone(
    prefix && !digits.startsWith('+') ? `${prefix}${digits}` : digits,
    cleanText(countryCode) || null,
  );

  // Twenty accepted the number when it was saved, so keep it even when this
  // copy of the phone metadata cannot read it.
  return (
    parsed ?? {
      number: digits.replace(/[^\d]/g, ''),
      callingCode: prefix,
      countryCode: cleanText(countryCode),
    }
  );
};

export const phoneToE164 = (phone: PhoneValue | null): string =>
  phone ? `${phone.callingCode}${phone.number}` : '';

// What Zoho shows: "+971 501234567"
export const phoneToZoho = (phone: PhoneValue | null): string | null =>
  phone ? `${phone.callingCode} ${phone.number}`.trim() : null;

// Compares websites by host only, so "https://www.acme.com/" and "acme.com"
// count as the same value on both sides.
export const websiteHost = (value: unknown): string => {
  const text = cleanText(value).toLowerCase();

  if (text === '') {
    return '';
  }

  return text
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#]/)[0]
    .replace(/\.$/, '');
};

const LEGAL_SUFFIXES = new Set([
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
]);

// Lowercase, without punctuation and trailing legal forms: matches
// "Acme Trading L.L.C." with "ACME Trading".
export const companyNameKey = (value: unknown): string => {
  const words = cleanText(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    // "L.L.C." reads as one word, "llc"
    .replace(/\./g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter((word) => word !== '');

  while (words.length > 1 && LEGAL_SUFFIXES.has(words[words.length - 1])) {
    words.pop();
  }

  return words.join(' ');
};

export const personNameKey = (firstName: unknown, lastName: unknown): string =>
  `${cleanText(firstName)} ${cleanText(lastName)}`
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(',')}}`;
  }

  return JSON.stringify(value ?? null);
};

export const fingerprint = (value: unknown): string =>
  createHash('sha256')
    .update(stableStringify(value))
    .digest('hex')
    .slice(0, 32);
