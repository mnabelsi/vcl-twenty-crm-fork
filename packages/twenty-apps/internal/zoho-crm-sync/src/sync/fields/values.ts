import { fingerprint } from 'src/sync/normalize';

// Every Zoho field the app mirrors has a kind. A value is read from either side
// into one canonical form, so equal data gives equal hashes whichever side it
// was read from.

export type FieldKind =
  | 'text'
  | 'link'
  | 'number'
  | 'currency'
  | 'date'
  | 'datetime'
  | 'boolean'
  | 'select'
  | 'multiselect'
  // A Zoho date held in a Twenty date-time field (Closing_Date and closeDate).
  | 'dateOnDatetime';

export type CanonicalValue = string | number | boolean | string[] | null;

export type SelectOption = {
  // Twenty option value, UPPER_SNAKE_CASE
  value: string;
  label: string;
  // Zoho actual value
  zoho: string;
};

export type SyncedField = {
  zohoField: string;
  twentyField: string;
  label: string;
  kind: FieldKind;
  // Read-only Zoho fields (formulas, lookups, system times) only come in.
  direction: 'both' | 'fromZoho';
  options?: SelectOption[];
  // Twenty refuses an empty value (the opportunity stage).
  nonNullable?: boolean;
  // An existing Twenty field: its value is kept when both sides hold one the
  // first time the field syncs.
  twentyLeadsFirst?: boolean;
  // Key of the field in a record's field state, tied to the Twenty field id:
  // a field deleted and created again starts over instead of reading as
  // emptied in Twenty.
  stateKey?: string;
};

export const stateKeyOf = (field: SyncedField): string =>
  field.stateKey ?? field.zohoField;

const MICROS = 1_000_000;
const HALF_DAY_MS = 12 * 60 * 60 * 1000;

const roundNumber = (value: number): number =>
  Math.abs(value) < 1e12 ? Math.round(value * MICROS) / MICROS : value;

const toNumber = (raw: unknown): number | null => {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? roundNumber(raw) : null;
  }
  if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = Number(raw.replace(/,/g, ''));

    return Number.isFinite(parsed) ? roundNumber(parsed) : null;
  }

  return null;
};

const normalizeText = (raw: string): string | null => {
  const text = raw.replace(/\r\n?/g, '\n').trim();

  return text === '' ? null : text;
};

// Lookups arrive as { name, id }, tags as [{ name }]: kept as their names.
const textOf = (raw: unknown): string | null => {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (typeof raw === 'string') {
    return normalizeText(raw);
  }
  if (typeof raw === 'number' || typeof raw === 'boolean') {
    return String(raw);
  }
  if (Array.isArray(raw)) {
    const parts = raw
      .map((item) => textOf(item))
      .filter((item): item is string => item !== null);

    return parts.length > 0 ? parts.join(', ') : null;
  }
  if (typeof raw === 'object') {
    const named = raw as { name?: unknown; display_value?: unknown };

    if (typeof named.name === 'string') {
      return normalizeText(named.name);
    }
    if (typeof named.display_value === 'string') {
      return normalizeText(named.display_value);
    }

    return normalizeText(JSON.stringify(raw));
  }

  return null;
};

const dateOf = (raw: unknown): string | null =>
  typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw)
    ? raw.slice(0, 10)
    : null;

const dateTimeOf = (raw: unknown): string | null => {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return null;
  }

  const parsed = Date.parse(raw);

  return Number.isNaN(parsed)
    ? null
    : `${new Date(parsed).toISOString().slice(0, 19)}Z`;
};

// A date picked in Twenty is saved as local midnight, so in Beirut it reads
// 21:00 the day before in UTC: the nearest midnight gives the day meant.
const dateOfDateTime = (raw: unknown): string | null => {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return null;
  }

  const parsed = Date.parse(raw);

  return Number.isNaN(parsed)
    ? null
    : new Date(parsed + HALF_DAY_MS).toISOString().slice(0, 10);
};

const isEmptyPicklistValue = (value: string) =>
  value === '' || value === '-None-';

export const optionForZohoValue = (
  field: SyncedField,
  zohoValue: string,
): SelectOption | undefined =>
  field.options?.find((option) => option.zoho === zohoValue) ??
  field.options?.find(
    (option) => option.label.toLowerCase() === zohoValue.toLowerCase(),
  );

// Picklist values Zoho holds that have no Twenty option yet.
export const unknownZohoOptions = (
  field: SyncedField,
  raw: unknown,
): string[] => {
  if (field.kind !== 'select' && field.kind !== 'multiselect') {
    return [];
  }

  const values = (Array.isArray(raw) ? raw : [raw])
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => !isEmptyPicklistValue(value));

  return values.filter((value) => !optionForZohoValue(field, value));
};

// Undefined when Zoho holds a picklist value Twenty has no option for: the
// field is then left alone for this record rather than read as empty.
export const valueFromZoho = (
  field: SyncedField,
  raw: unknown,
): CanonicalValue | undefined => {
  switch (field.kind) {
    case 'text':
    case 'link':
      return textOf(raw);
    case 'number':
    case 'currency':
      return toNumber(raw);
    case 'date':
    case 'dateOnDatetime':
      return dateOf(raw);
    case 'datetime':
      return dateTimeOf(raw);
    case 'boolean':
      return raw === true;
    case 'select': {
      if (typeof raw !== 'string' || isEmptyPicklistValue(raw.trim())) {
        return null;
      }

      return optionForZohoValue(field, raw.trim())?.value;
    }
    case 'multiselect': {
      if (!Array.isArray(raw)) {
        return null;
      }

      if (unknownZohoOptions(field, raw).length > 0) {
        return undefined;
      }

      const values = raw
        .filter((value): value is string => typeof value === 'string')
        .map((value) => optionForZohoValue(field, value.trim())?.value)
        .filter((value): value is string => Boolean(value));

      return values.length > 0 ? [...new Set(values)].sort() : null;
    }
  }
};

export const valueFromTwenty = (
  field: SyncedField,
  raw: unknown,
): CanonicalValue => {
  switch (field.kind) {
    case 'text':
      return typeof raw === 'string' ? normalizeText(raw) : textOf(raw);
    case 'link': {
      const url = (raw as { primaryLinkUrl?: unknown } | null)?.primaryLinkUrl;

      return typeof url === 'string' ? normalizeText(url) : null;
    }
    case 'number':
      return toNumber(raw);
    case 'currency': {
      const micros = toNumber(
        (raw as { amountMicros?: unknown } | null)?.amountMicros,
      );

      return micros === null ? null : roundNumber(micros / MICROS);
    }
    case 'date':
      return dateOf(raw);
    case 'dateOnDatetime':
      return dateOfDateTime(raw);
    case 'datetime':
      return dateTimeOf(raw);
    case 'boolean':
      return raw === true;
    case 'select':
      return typeof raw === 'string' && raw !== '' ? raw : null;
    case 'multiselect': {
      if (!Array.isArray(raw)) {
        return null;
      }

      const values = raw.filter(
        (value): value is string => typeof value === 'string' && value !== '',
      );

      return values.length > 0 ? [...new Set(values)].sort() : null;
    }
  }
};

export const valueToTwenty = (
  field: SyncedField,
  value: CanonicalValue,
  currencyCode: string,
): unknown => {
  switch (field.kind) {
    case 'text':
      return value ?? '';
    case 'link':
      return { primaryLinkUrl: value ?? '', primaryLinkLabel: '' };
    case 'number':
      return value;
    case 'currency':
      return {
        amountMicros:
          typeof value === 'number' ? Math.round(value * MICROS) : null,
        currencyCode,
      };
    case 'date':
    case 'datetime':
    case 'select':
      return value;
    case 'dateOnDatetime':
      return typeof value === 'string' ? `${value}T00:00:00.000Z` : null;
    case 'boolean':
      return value === true;
    case 'multiselect':
      return Array.isArray(value) ? value : [];
  }
};

// A Twenty option with no Zoho value (one of Twenty's own stages, say) is
// not sent: Zoho would refuse it or keep a value its picklist does not have.
export const canSendToZoho = (
  field: SyncedField,
  value: CanonicalValue,
): boolean => {
  const mapped = (entry: string) =>
    Boolean(field.options?.some((option) => option.value === entry));

  if (field.kind === 'select') {
    return typeof value !== 'string' || mapped(value);
  }
  if (field.kind === 'multiselect') {
    return !Array.isArray(value) || value.every(mapped);
  }

  return true;
};

const zohoOption = (field: SyncedField, value: string): string => {
  const option = field.options?.find((candidate) => candidate.value === value);

  return option?.zoho ?? option?.label ?? value;
};

// Zoho expects date-times as yyyy-MM-ddTHH:mm:ss±HH:mm.
const toZohoDateTime = (value: string): string =>
  `${new Date(Date.parse(value)).toISOString().slice(0, 19)}+00:00`;

export const valueToZoho = (
  field: SyncedField,
  value: CanonicalValue,
): unknown => {
  switch (field.kind) {
    case 'text':
    case 'link':
    case 'number':
    case 'currency':
    case 'date':
    case 'dateOnDatetime':
      return value ?? null;
    case 'datetime':
      return typeof value === 'string' ? toZohoDateTime(value) : null;
    case 'boolean':
      return value === true;
    case 'select':
      return typeof value === 'string' ? zohoOption(field, value) : null;
    case 'multiselect':
      return Array.isArray(value)
        ? value.map((entry) => zohoOption(field, entry))
        : [];
  }
};

export const valueHash = (value: CanonicalValue): string =>
  fingerprint(value).slice(0, 10);
