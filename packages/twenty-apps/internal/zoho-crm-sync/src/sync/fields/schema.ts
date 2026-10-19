import {
  mergeOptions,
  MODULE_CONFIGS,
  moduleConfigFor,
  planModule,
  type SkippedField,
  stateKeyFor,
  type TwentyObjectName,
  type ZohoFieldMetadata,
  type ZohoModule,
} from 'src/sync/fields/schema-plan';
import type { SyncedField } from 'src/sync/fields/values';
import type { KeyValueStore } from 'src/sync/state';
import type { TwentyMetadataApi } from 'src/twenty/metadata';
import { ZohoAuthError, ZohoError } from 'src/zoho/client';

// The field map the sync works from, rebuilt from Zoho's field list every few
// hours and saved in the app's key-value store between runs.

export type ModuleSchema = { fields: SyncedField[] };

export type SyncSchema = {
  version: 1;
  refreshedAt: number;
  currencyCode: string;
  modules: Partial<Record<ZohoModule, ModuleSchema>>;
  skipped: SkippedField[];
  // Why some modules are not synced, shown on the page.
  warning: string | null;
};

export type SchemaZohoApi = {
  listFields: (module: string) => Promise<ZohoFieldMetadata[]>;
  organizationCurrency: () => Promise<string | null>;
};

export const SCHEMA_KEY = 'zoho-sync:schema';
export const SCHEMA_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const DEFAULT_CURRENCY = 'USD';

export const SCOPES_WARNING =
  'Reconnect Zoho on the Zoho CRM Sync page with the scopes shown there to sync every field and Deals. Contacts and Accounts keep syncing their main fields until then.';

export const loadSchema = (store: KeyValueStore) =>
  store.get<SyncSchema>(SCHEMA_KEY);

export const saveSchema = (store: KeyValueStore, schema: SyncSchema) =>
  store.set(SCHEMA_KEY, schema);

export const schemaFields = (
  schema: SyncSchema | null,
  module: ZohoModule,
): SyncedField[] => schema?.modules[module]?.fields ?? [];

const isScopeProblem = (error: unknown): boolean =>
  error instanceof ZohoError &&
  !(error instanceof ZohoAuthError) &&
  /SCOPE|NO_PERMISSION|OAUTH/i.test(error.code);

export type SchemaRefresh = {
  schema: SyncSchema;
  // Zoho fields that are new to the sync, by module: their values are read
  // again for every record.
  addedFields: Partial<Record<ZohoModule, string[]>>;
  fieldsCreated: number;
};

export const refreshSchema = async ({
  zoho,
  metadata,
  previous,
  now,
}: {
  zoho: SchemaZohoApi;
  metadata: TwentyMetadataApi;
  previous: SyncSchema | null;
  now: number;
}): Promise<SchemaRefresh> => {
  const objects = await metadata.listObjects(
    MODULE_CONFIGS.map((config) => config.object),
  );
  const schema: SyncSchema = {
    version: 1,
    refreshedAt: now,
    currencyCode:
      (await zoho.organizationCurrency().catch(() => null)) ??
      previous?.currencyCode ??
      DEFAULT_CURRENCY,
    modules: {},
    skipped: [],
    warning: null,
  };
  const addedFields: Partial<Record<ZohoModule, string[]>> = {};
  let fieldsCreated = 0;

  for (const config of MODULE_CONFIGS) {
    const object = objects[config.object];
    let zohoFields: ZohoFieldMetadata[];

    try {
      zohoFields = await zoho.listFields(config.module);
    } catch (error) {
      if (error instanceof ZohoAuthError) {
        throw error;
      }
      if (isScopeProblem(error)) {
        schema.warning = SCOPES_WARNING;
      } else {
        schema.warning = `Could not read the Zoho ${config.module} fields: ${(error as Error).message}`;
      }
      // Keep what worked before rather than dropping the module's fields.
      if (previous?.modules[config.module]) {
        schema.modules[config.module] = previous.modules[config.module];
      }
      continue;
    }

    if (!object) {
      schema.warning = `Twenty has no ${config.object} object to sync ${config.module} into.`;
      continue;
    }

    const previousFields = schemaFields(previous, config.module);
    const plan = planModule({
      config,
      zohoFields,
      twentyFields: object.fields,
      previous: previousFields,
    });
    const failed = new Set<string>();

    for (const create of plan.creates) {
      try {
        const created = await metadata.createField(object.id, create);
        const field = plan.fields.find(
          (candidate) => candidate.zohoField === create.zohoField,
        );

        if (field) {
          field.stateKey = stateKeyFor(create.zohoField, created.id);
        }
        fieldsCreated += 1;
      } catch (error) {
        failed.add(create.zohoField);
        plan.skipped.push({
          module: config.module,
          zohoField: create.zohoField,
          label: create.label,
          reason: `Twenty refused to create the field: ${(error as Error).message}`,
        });
      }
    }

    for (const update of plan.optionUpdates) {
      try {
        await metadata.updateFieldOptions(update.fieldId, update.options);
      } catch {
        // Without the new options, those Zoho values stay unreadable and the
        // field is left alone on the records holding them.
        const field = plan.fields.find(
          (candidate) => candidate.zohoField === update.zohoField,
        );

        if (field?.options) {
          field.options = field.options.filter((option) =>
            update.previousValues.includes(option.value),
          );
        }
      }
    }

    const fields = plan.fields.filter((field) => !failed.has(field.zohoField));
    // A field created again in Twenty counts as new: its values are read again.
    const known = new Set(
      previousFields.map((field) => `${field.zohoField}|${field.stateKey}`),
    );
    const added = fields
      .filter((field) => !known.has(`${field.zohoField}|${field.stateKey}`))
      .map((field) => field.zohoField);

    if (added.length > 0) {
      addedFields[config.module] = added;
    }
    schema.modules[config.module] = { fields };
    schema.skipped.push(...plan.skipped);
  }

  return { schema, addedFields, fieldsCreated };
};

// Adds Twenty options for picklist values found on Zoho records that the
// field list did not mention (values removed from the picklist since).
export const addMissingOptions = async ({
  metadata,
  schema,
  module,
  object,
  missing,
}: {
  metadata: TwentyMetadataApi;
  schema: SyncSchema;
  module: ZohoModule;
  object: TwentyObjectName;
  missing: Map<string, Set<string>>;
}): Promise<boolean> => {
  const fields = schema.modules[module]?.fields;

  if (!fields || missing.size === 0) {
    return false;
  }

  const objects = await metadata.listObjects([object]);
  const twentyFields = objects[object]?.fields ?? [];
  let changed = false;

  for (const [zohoField, values] of missing) {
    const field = fields.find((candidate) => candidate.zohoField === zohoField);
    const twentyField = twentyFields.find(
      (candidate) => candidate.name === field?.twentyField,
    );

    if (!field || !twentyField) {
      continue;
    }

    const merged = mergeOptions({
      zohoValues: [...values].map((value) => ({
        actual: value,
        display: value,
      })),
      twentyOptions: twentyField.options ?? [],
      previous: field.options ?? [],
    });

    try {
      if (merged.added > 0) {
        await metadata.updateFieldOptions(twentyField.id, merged.options);
      }
      field.options = merged.selectOptions;
      changed = true;
    } catch {
      // Left unreadable; tried again on the next page that holds the value.
    }
  }

  return changed;
};

export const moduleObject = (module: ZohoModule): TwentyObjectName =>
  moduleConfigFor(module).object;
