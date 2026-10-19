import {
  type CanonicalValue,
  canSendToZoho,
  stateKeyOf,
  type SyncedField,
  valueFromTwenty,
  valueFromZoho,
  valueHash,
  valueToTwenty,
  valueToZoho,
} from 'src/sync/fields/values';

// Field-level sync for every field beyond the core ones. Each record keeps, in
// its zohoFieldState field, the hash of each two-way field as it stood after
// the last sync. With that, a change on one side is told apart from a change
// on the other field by field, so editing one field in Zoho and another in
// Twenty never undoes either edit.

export type FieldState = Record<string, string>;
export type FieldValues = Record<string, CanonicalValue | undefined>;

export const parseFieldState = (raw: unknown): FieldState | null => {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);

    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as FieldState)
      : null;
  } catch {
    return null;
  }
};

export const serializeFieldState = (state: FieldState): string =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries(state).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    ),
  );

export const zohoFieldValues = (
  fields: SyncedField[],
  record: Record<string, unknown>,
): FieldValues =>
  Object.fromEntries(
    fields.map((field) => [
      field.zohoField,
      valueFromZoho(field, record[field.zohoField]),
    ]),
  );

export const twentyFieldValues = (
  fields: SyncedField[],
  record: Record<string, unknown>,
): FieldValues =>
  Object.fromEntries(
    fields.map((field) => [
      field.zohoField,
      valueFromTwenty(field, record[field.twentyField]),
    ]),
  );

export type Reconciliation = {
  // Canonical values to write, keyed by Zoho field name.
  toTwenty: Record<string, CanonicalValue>;
  toZoho: Record<string, CanonicalValue>;
  // Two-way fields in step once `toTwenty` is written, by state key.
  settled: FieldState;
  conflicts: number;
};

// `latest` says which side was edited last, for fields changed on both sides.
// A field this record never synced takes Zoho's value, or Twenty's when Zoho
// has none.
export const reconcileFields = ({
  fields,
  zoho,
  twenty,
  stored,
  latest,
}: {
  fields: SyncedField[];
  zoho: FieldValues;
  twenty: FieldValues;
  stored: FieldState | null;
  latest: 'zoho' | 'twenty';
}): Reconciliation => {
  const toTwenty: Record<string, CanonicalValue> = {};
  const toZoho: Record<string, CanonicalValue> = {};
  const settled: FieldState = {};
  let conflicts = 0;

  for (const field of fields) {
    const key = field.zohoField;
    const stateKey = stateKeyOf(field);
    const zohoValue = zoho[key];
    const twentyValue = twenty[key] ?? null;

    if (zohoValue === undefined) {
      continue;
    }

    const zohoHash = valueHash(zohoValue);
    const twentyHash = valueHash(twentyValue);

    if (field.direction === 'fromZoho') {
      if (zohoHash !== twentyHash) {
        toTwenty[key] = zohoValue;
      }
      continue;
    }
    if (zohoHash === twentyHash) {
      settled[stateKey] = zohoHash;
      continue;
    }

    const storedHash = stored?.[stateKey];

    if (storedHash === undefined) {
      if (
        zohoValue === null ||
        (field.twentyLeadsFirst === true && twentyValue !== null)
      ) {
        toZoho[key] = twentyValue;
      } else {
        toTwenty[key] = zohoValue;
        settled[stateKey] = zohoHash;
      }
    } else if (zohoHash === storedHash) {
      toZoho[key] = twentyValue;
    } else if (twentyHash === storedHash) {
      toTwenty[key] = zohoValue;
      settled[stateKey] = zohoHash;
    } else {
      conflicts += 1;
      if (latest === 'zoho') {
        toTwenty[key] = zohoValue;
        settled[stateKey] = zohoHash;
      } else {
        toZoho[key] = twentyValue;
      }
    }
  }

  return { toTwenty, toZoho, settled, conflicts };
};

// A record about to be created in Zoho: every two-way value Twenty holds goes.
export const reconcileForInsert = (
  fields: SyncedField[],
  twenty: FieldValues,
): Reconciliation => {
  const toZoho: Record<string, CanonicalValue> = {};
  const settled: FieldState = {};

  for (const field of fields) {
    if (field.direction !== 'both') {
      continue;
    }

    const value = twenty[field.zohoField] ?? null;

    if (value === null) {
      settled[stateKeyOf(field)] = valueHash(null);
    } else {
      toZoho[field.zohoField] = value;
    }
  }

  return { toTwenty: {}, toZoho, settled, conflicts: 0 };
};

// The state to save after a pull: fields waiting to go to Zoho keep their
// previous hash so the push still sees them as changed in Twenty.
export const stateAfterPull = (
  fields: SyncedField[],
  stored: FieldState | null,
  reconciliation: Reconciliation,
): FieldState => {
  const state: FieldState = {};

  for (const field of fields) {
    const key = stateKeyOf(field);

    if (field.direction !== 'both') {
      continue;
    }
    if (reconciliation.settled[key] !== undefined) {
      state[key] = reconciliation.settled[key];
    } else if (stored?.[key] !== undefined) {
      state[key] = stored[key];
    }
  }

  return state;
};

// The state to save once Zoho accepted `toZoho`.
export const stateAfterPush = (
  fields: SyncedField[],
  stored: FieldState | null,
  reconciliation: Reconciliation,
): FieldState => {
  const state = stateAfterPull(fields, stored, reconciliation);

  for (const field of fields) {
    if (field.zohoField in reconciliation.toZoho) {
      state[stateKeyOf(field)] = valueHash(
        reconciliation.toZoho[field.zohoField],
      );
    }
  }

  return state;
};

// True when a two-way field changed in Twenty since the last sync, which is
// the only case where the push needs to read the Zoho record.
export const twentyFieldsChanged = (
  fields: SyncedField[],
  twenty: FieldValues,
  stored: FieldState | null,
): boolean =>
  fields.some((field) => {
    if (field.direction !== 'both') {
      return false;
    }

    const value = twenty[field.zohoField] ?? null;
    const storedHash = stored?.[stateKeyOf(field)];

    return storedHash === undefined
      ? value !== null
      : valueHash(value) !== storedHash;
  });

export const twentyDataFor = (
  fields: SyncedField[],
  values: Record<string, CanonicalValue>,
  currencyCode: string,
): Record<string, unknown> => {
  const data: Record<string, unknown> = {};

  for (const field of fields) {
    if (!(field.zohoField in values)) {
      continue;
    }

    const value = values[field.zohoField];

    if (value === null && field.nonNullable) {
      continue;
    }
    data[field.twentyField] = valueToTwenty(field, value, currencyCode);
  }

  return data;
};

// Values Zoho cannot take are dropped from `values` too, so they are not
// recorded as synced and Twenty's value stays as it is.
export const zohoDataFor = (
  fields: SyncedField[],
  values: Record<string, CanonicalValue>,
): Record<string, unknown> => {
  const data: Record<string, unknown> = {};

  for (const field of fields) {
    if (!(field.zohoField in values)) {
      continue;
    }
    if (!canSendToZoho(field, values[field.zohoField])) {
      delete values[field.zohoField];
      continue;
    }
    data[field.zohoField] = valueToZoho(field, values[field.zohoField]);
  }

  return data;
};

// Whether a write-back after a push changes anything in Twenty.
export const pushChangesTwenty = (
  fields: SyncedField[],
  stored: FieldState | null,
  reconciliation: Reconciliation,
): boolean =>
  Object.keys(reconciliation.toTwenty).length > 0 ||
  !sameFieldState(stateAfterPush(fields, stored, reconciliation), stored);

export const sameFieldState = (
  a: FieldState | null,
  b: FieldState | null,
): boolean => serializeFieldState(a ?? {}) === serializeFieldState(b ?? {});
