import { randomUUID } from 'crypto';

import type {
  FieldKind,
  SelectOption,
  SyncedField,
} from 'src/sync/fields/values';
import { fingerprint } from 'src/sync/normalize';

// Works out, from Zoho's field list for a module and the fields Twenty already
// has, which Twenty fields to create and how each Zoho field maps. Pure: the
// schema module carries out the plan.

export type ZohoModule = 'Accounts' | 'Contacts' | 'Deals';
export type TwentyObjectName = 'company' | 'person' | 'opportunity';

export type ZohoFieldMetadata = {
  api_name: string;
  data_type: string;
  field_label?: string | null;
  display_label?: string | null;
  read_only?: boolean | null;
  field_read_only?: boolean | null;
  json_type?: string | null;
  visible?: boolean | null;
  decimal_place?: number | null;
  pick_list_values?:
    | { display_value?: string | null; actual_value?: string | null }[]
    | null;
  formula?: { return_type?: string | null } | null;
  rollup_summary?: { return_type?: string | null } | null;
};

export type TwentyOption = {
  id: string;
  value: string;
  label: string;
  color: string;
  position: number;
};

export type TwentyFieldMetadata = {
  id: string;
  name: string;
  label: string;
  type: string;
  options?: TwentyOption[] | null;
  isActive?: boolean | null;
};

export type FieldToCreate = {
  zohoField: string;
  name: string;
  label: string;
  type: string;
  description: string;
  icon: string;
  options?: TwentyOption[];
  settings?: Record<string, unknown>;
};

export type OptionsUpdate = {
  zohoField: string;
  fieldId: string;
  previousValues: string[];
  options: TwentyOption[];
};

export type SkippedField = {
  module: ZohoModule;
  zohoField: string;
  label: string;
  reason: string;
};

export type ModulePlan = {
  fields: SyncedField[];
  creates: FieldToCreate[];
  optionUpdates: OptionsUpdate[];
  skipped: SkippedField[];
};

export type ModuleConfig = {
  module: ZohoModule;
  object: TwentyObjectName;
  // Zoho fields the core sync already handles.
  coreFields: string[];
  // Zoho fields kept in an existing Twenty field rather than a new one.
  existingFields: Record<
    string,
    { twentyField: string; kind: FieldKind; nonNullable?: boolean }
  >;
};

export const MODULE_CONFIGS: ModuleConfig[] = [
  {
    module: 'Accounts',
    object: 'company',
    coreFields: [
      'Account_Name',
      'Website',
      'Billing_Street',
      'Billing_City',
      'Billing_State',
      'Billing_Code',
      'Billing_Country',
    ],
    existingFields: {
      Annual_Revenue: { twentyField: 'annualRevenue', kind: 'currency' },
    },
  },
  {
    module: 'Contacts',
    object: 'person',
    coreFields: [
      'First_Name',
      'Last_Name',
      'Full_Name',
      'Email',
      'Secondary_Email',
      'Phone',
      'Mobile',
      'Title',
      'Account_Name',
    ],
    existingFields: {},
  },
  {
    module: 'Deals',
    object: 'opportunity',
    coreFields: ['Account_Name', 'Contact_Name'],
    existingFields: {
      Deal_Name: { twentyField: 'name', kind: 'text' },
      Amount: { twentyField: 'amount', kind: 'currency' },
      Closing_Date: { twentyField: 'closeDate', kind: 'dateOnDatetime' },
      Stage: { twentyField: 'stage', kind: 'select', nonNullable: true },
    },
  },
];

// Zoho internals with nothing to show in Twenty.
const IGNORED_FIELDS = new Set(['Record_Image', 'Layout', 'id']);

const TWENTY_TYPE_BY_KIND: Record<FieldKind, string> = {
  text: 'TEXT',
  link: 'LINKS',
  number: 'NUMBER',
  currency: 'CURRENCY',
  date: 'DATE',
  datetime: 'DATE_TIME',
  boolean: 'BOOLEAN',
  select: 'SELECT',
  multiselect: 'MULTI_SELECT',
  dateOnDatetime: 'DATE_TIME',
};

const ICON_BY_KIND: Record<FieldKind, string> = {
  text: 'IconAbc',
  link: 'IconLink',
  number: 'IconHash',
  currency: 'IconCurrencyDollar',
  date: 'IconCalendar',
  datetime: 'IconCalendarTime',
  boolean: 'IconCheckbox',
  select: 'IconTag',
  multiselect: 'IconTags',
  dateOnDatetime: 'IconCalendar',
};

const OPTION_COLORS = [
  'blue',
  'green',
  'orange',
  'purple',
  'sky',
  'turquoise',
  'pink',
  'yellow',
  'red',
  'gray',
];

const IDENTIFIER_MAX_LENGTH = 63;

const kindForType = (
  type: string | null | undefined,
): { kind: FieldKind; forcedFromZoho: boolean } | null => {
  switch (type) {
    case 'text':
    case 'textarea':
    case 'email':
    case 'phone':
      return { kind: 'text', forcedFromZoho: false };
    case 'autonumber':
      return { kind: 'text', forcedFromZoho: true };
    case 'website':
      return { kind: 'link', forcedFromZoho: false };
    case 'picklist':
      return { kind: 'select', forcedFromZoho: false };
    case 'multiselectpicklist':
      return { kind: 'multiselect', forcedFromZoho: false };
    case 'integer':
    case 'bigint':
    case 'long':
    case 'double':
    case 'decimal':
    case 'percent':
      return { kind: 'number', forcedFromZoho: false };
    case 'currency':
      return { kind: 'currency', forcedFromZoho: false };
    case 'date':
      return { kind: 'date', forcedFromZoho: false };
    case 'datetime':
      return { kind: 'datetime', forcedFromZoho: false };
    case 'boolean':
      return { kind: 'boolean', forcedFromZoho: false };
    // Lookups and owners are shown by name; the link itself stays in Zoho.
    case 'lookup':
    case 'ownerlookup':
    case 'userlookup':
      return { kind: 'text', forcedFromZoho: true };
    default:
      return null;
  }
};

const kindForField = (
  field: ZohoFieldMetadata,
): { kind: FieldKind; fromZoho: boolean } | null => {
  const computed =
    field.data_type === 'formula'
      ? field.formula?.return_type
      : field.data_type === 'rollup_summary'
        ? (field.rollup_summary?.return_type ?? 'double')
        : null;

  if (computed !== null && computed !== undefined) {
    const kind = kindForType(computed);

    return { kind: kind?.kind ?? 'text', fromZoho: true };
  }

  const kind = kindForType(field.data_type);

  if (!kind) {
    return null;
  }

  return {
    kind: kind.kind,
    fromZoho:
      kind.forcedFromZoho ||
      field.read_only === true ||
      field.field_read_only === true ||
      // Tags and other structured values are shown as text, not written back.
      (kind.kind === 'text' &&
        (field.json_type === 'jsonarray' || field.json_type === 'jsonobject')) ||
      field.api_name === 'Tag',
  };
};

const shortHash = (value: string, length: number) =>
  fingerprint(value).slice(0, length);

export const stateKeyFor = (zohoField: string, twentyFieldId: string) =>
  `${zohoField}:${twentyFieldId.replace(/-/g, '').slice(0, 8)}`;

export const twentyFieldNameFor = (zohoField: string): string => {
  const pascal = zohoField
    .split(/[^A-Za-z0-9]+/)
    .filter((part) => part !== '')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('');
  const name = `zoho${pascal || shortHash(zohoField, 8)}`;

  return name.length <= IDENTIFIER_MAX_LENGTH
    ? name
    : `${name.slice(0, IDENTIFIER_MAX_LENGTH - 9)}X${shortHash(zohoField, 8)}`;
};

// Twenty option values are UPPER_SNAKE_CASE starting with a letter.
export const optionValueFor = (text: string): string => {
  const base = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const value =
    base === ''
      ? `OPTION_${shortHash(text, 6).toUpperCase()}`
      : /^[A-Z]/.test(base)
        ? base
        : `V_${base}`;

  return value.slice(0, IDENTIFIER_MAX_LENGTH).replace(/_+$/, '');
};

const optionLabelFor = (text: string, fallback: string): string => {
  const label = text
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, IDENTIFIER_MAX_LENGTH)
    .trim();

  return label === '' ? fallback : label;
};

const uniqueValue = (candidate: string, taken: Set<string>): string => {
  if (!taken.has(candidate)) {
    return candidate;
  }

  for (let suffix = 2; ; suffix++) {
    const value = `${candidate.slice(0, IDENTIFIER_MAX_LENGTH - 4)}_${suffix}`;

    if (!taken.has(value)) {
      return value;
    }
  }
};

// Maps Zoho picklist values to Twenty options, adding options for the values
// Twenty does not have. Existing options are never removed or renamed: they
// may hold data.
export const mergeOptions = ({
  zohoValues,
  twentyOptions,
  previous,
}: {
  zohoValues: { actual: string; display: string }[];
  twentyOptions: TwentyOption[];
  previous: SelectOption[];
}): { selectOptions: SelectOption[]; options: TwentyOption[]; added: number } => {
  const options = twentyOptions.map((option) => ({ ...option }));
  const byValue = new Map(options.map((option) => [option.value, option]));
  const selectOptions: SelectOption[] = [];
  const mappedValues = new Set<string>();
  const mappedZoho = new Set<string>();
  let added = 0;

  for (const entry of previous) {
    const option = byValue.get(entry.value);

    if (option && !mappedZoho.has(entry.zoho)) {
      selectOptions.push({ ...entry, label: option.label });
      mappedValues.add(entry.value);
      mappedZoho.add(entry.zoho);
    }
  }

  for (const { actual, display } of zohoValues) {
    if (actual === '' || actual === '-None-' || mappedZoho.has(actual)) {
      continue;
    }

    const candidate = optionValueFor(actual);
    const existing =
      (byValue.has(candidate) && !mappedValues.has(candidate)
        ? byValue.get(candidate)
        : undefined) ??
      options.find(
        (option) =>
          !mappedValues.has(option.value) &&
          option.label.toLowerCase() === display.toLowerCase(),
      );

    if (existing) {
      selectOptions.push({
        value: existing.value,
        label: existing.label,
        zoho: actual,
      });
      mappedValues.add(existing.value);
      mappedZoho.add(actual);
      continue;
    }

    const value = uniqueValue(candidate, new Set(byValue.keys()));
    const position =
      options.reduce((max, option) => Math.max(max, option.position), -1) + 1;
    const option: TwentyOption = {
      id: randomUUID(),
      value,
      label: optionLabelFor(display || actual, value),
      color: OPTION_COLORS[position % OPTION_COLORS.length],
      position,
    };

    options.push(option);
    byValue.set(value, option);
    selectOptions.push({ value, label: option.label, zoho: actual });
    mappedValues.add(value);
    mappedZoho.add(actual);
    added += 1;
  }

  return { selectOptions, options, added };
};

const zohoLabelOf = (field: ZohoFieldMetadata): string =>
  (field.field_label || field.display_label || field.api_name).trim();

const picklistOf = (
  field: ZohoFieldMetadata,
): { actual: string; display: string }[] =>
  (field.pick_list_values ?? [])
    .map((value) => {
      const actual = (value.actual_value ?? value.display_value ?? '').trim();

      return { actual, display: (value.display_value ?? actual).trim() };
    })
    .filter((value) => value.actual !== '');

export const planModule = ({
  config,
  zohoFields,
  twentyFields,
  previous,
}: {
  config: ModuleConfig;
  zohoFields: ZohoFieldMetadata[];
  twentyFields: TwentyFieldMetadata[];
  previous: SyncedField[];
}): ModulePlan => {
  const plan: ModulePlan = {
    fields: [],
    creates: [],
    optionUpdates: [],
    skipped: [],
  };
  const core = new Set(config.coreFields);
  const twentyByName = new Map(
    twentyFields.map((field) => [field.name, field]),
  );
  const takenLabels = new Set(
    twentyFields.map((field) => field.label.trim().toLowerCase()),
  );
  const previousByZohoField = new Map(
    previous.map((field) => [field.zohoField, field]),
  );

  for (const zohoField of zohoFields) {
    const apiName = zohoField.api_name;

    if (
      !apiName ||
      core.has(apiName) ||
      IGNORED_FIELDS.has(apiName) ||
      apiName.endsWith('__s') ||
      zohoField.visible === false
    ) {
      continue;
    }

    const label = zohoLabelOf(zohoField);
    const existing = config.existingFields[apiName];
    const typed = kindForField(zohoField);

    if (!typed) {
      plan.skipped.push({
        module: config.module,
        zohoField: apiName,
        label,
        reason: `Zoho fields of type "${zohoField.data_type}" have no Twenty equivalent`,
      });
      continue;
    }

    const kind = existing?.kind ?? typed.kind;
    const twentyName = existing?.twentyField ?? twentyFieldNameFor(apiName);
    const twentyField = twentyByName.get(twentyName);
    const expectedType = TWENTY_TYPE_BY_KIND[kind];

    if (twentyField && twentyField.isActive === false) {
      plan.skipped.push({
        module: config.module,
        zohoField: apiName,
        label,
        reason: `The Twenty field "${twentyName}" is deactivated; reactivate it to sync this field`,
      });
      continue;
    }
    if (twentyField && twentyField.type !== expectedType) {
      plan.skipped.push({
        module: config.module,
        zohoField: apiName,
        label,
        reason: `Twenty already has a field "${twentyName}" of type ${twentyField.type}, not ${expectedType}`,
      });
      continue;
    }
    if (!twentyField && existing) {
      plan.skipped.push({
        module: config.module,
        zohoField: apiName,
        label,
        reason: `The Twenty field "${twentyName}" is missing`,
      });
      continue;
    }

    const synced: SyncedField = {
      zohoField: apiName,
      twentyField: twentyName,
      label: twentyField?.label ?? label,
      kind,
      direction: typed.fromZoho ? 'fromZoho' : 'both',
      ...(existing?.nonNullable ? { nonNullable: true } : {}),
      ...(twentyField ? { stateKey: stateKeyFor(apiName, twentyField.id) } : {}),
    };
    let createOptions: TwentyOption[] | undefined;

    if (kind === 'select' || kind === 'multiselect') {
      const merged = mergeOptions({
        zohoValues: picklistOf(zohoField),
        twentyOptions: twentyField?.options ?? [],
        previous: previousByZohoField.get(apiName)?.options ?? [],
      });

      synced.options = merged.selectOptions;
      if (!twentyField) {
        createOptions = merged.options;
      } else if (merged.added > 0) {
        plan.optionUpdates.push({
          zohoField: apiName,
          fieldId: twentyField.id,
          previousValues: (twentyField.options ?? []).map(
            (option) => option.value,
          ),
          options: merged.options,
        });
      }
    }

    if (!twentyField) {
      // Twenty refuses a select without options.
      if (createOptions && createOptions.length === 0) {
        createOptions = [
          {
            id: randomUUID(),
            value: 'NONE',
            label: 'None',
            color: 'gray',
            position: 0,
          },
        ];
      }

      const createLabel = takenLabels.has(label.toLowerCase())
        ? `${label} (Zoho)`
        : label;

      takenLabels.add(createLabel.toLowerCase());
      synced.label = createLabel.slice(0, IDENTIFIER_MAX_LENGTH);
      plan.creates.push({
        zohoField: apiName,
        name: twentyName,
        label: synced.label,
        type: expectedType,
        description: `Zoho CRM ${config.module} field ${apiName}, kept in step by the Zoho CRM Sync app.${
          synced.direction === 'fromZoho'
            ? ' Read-only in Zoho: edits made here are not sent to Zoho.'
            : ''
        }`,
        icon: ICON_BY_KIND[kind],
        ...(createOptions ? { options: createOptions } : {}),
        ...(kind === 'number'
          ? {
              settings: {
                decimals: Math.min(
                  Math.max(
                    zohoField.decimal_place ??
                      (['integer', 'bigint', 'long'].includes(
                        zohoField.data_type,
                      )
                        ? 0
                        : 2),
                    0,
                  ),
                  5,
                ),
                type: 'number',
              },
            }
          : {}),
      });
    }

    plan.fields.push(synced);
  }

  return plan;
};

export const moduleConfigFor = (module: ZohoModule): ModuleConfig =>
  MODULE_CONFIGS.find((config) => config.module === module) as ModuleConfig;
