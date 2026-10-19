import { describe, expect, it } from 'vitest';

import {
  reconcileFields,
  stateAfterPull,
  stateAfterPush,
  twentyFieldsChanged,
} from 'src/sync/fields/reconcile';
import {
  mergeOptions,
  moduleConfigFor,
  optionValueFor,
  planModule,
  twentyFieldNameFor,
} from 'src/sync/fields/schema-plan';
import {
  type SyncedField,
  valueFromTwenty,
  valueFromZoho,
  valueHash,
  valueToTwenty,
  valueToZoho,
} from 'src/sync/fields/values';

const field = (
  kind: SyncedField['kind'],
  extra: Partial<SyncedField> = {},
): SyncedField => ({
  zohoField: 'Field',
  twentyField: 'zohoField',
  label: 'Field',
  kind,
  direction: 'both',
  ...extra,
});

const tier = field('select', {
  options: [
    { value: 'GOLD', label: 'Gold', zoho: 'Gold' },
    { value: 'SILVER_PLUS', label: 'Silver plus', zoho: 'Silver +' },
  ],
});

// Zoho value -> Twenty -> read back must give the same canonical value, and
// the same from Twenty to Zoho, or the sync would keep rewriting the field.
const roundTrips = (syncedField: SyncedField, zohoRaw: unknown) => {
  const fromZoho = valueFromZoho(syncedField, zohoRaw) ?? null;
  const twentyRaw = valueToTwenty(syncedField, fromZoho, 'AED');
  const backFromTwenty = valueFromTwenty(syncedField, twentyRaw);
  const zohoAgain = valueToZoho(syncedField, backFromTwenty);

  expect(backFromTwenty).toEqual(fromZoho);
  expect(valueFromZoho(syncedField, zohoAgain) ?? null).toEqual(fromZoho);
};

describe('field values', () => {
  it('round-trip between Zoho and Twenty for every kind', () => {
    roundTrips(field('text'), '  Line one\r\nLine two  ');
    roundTrips(field('text'), null);
    roundTrips(field('link'), 'https://acme.example/about');
    roundTrips(field('number'), 42.5);
    roundTrips(field('number'), 0);
    roundTrips(field('currency'), 125000.75);
    roundTrips(field('date'), '2026-10-19');
    roundTrips(field('datetime'), '2026-10-19T09:30:00+04:00');
    roundTrips(field('boolean'), true);
    roundTrips(field('boolean'), false);
    roundTrips(tier, 'Silver +');
    roundTrips(
      field('multiselect', { options: tier.options }),
      ['Silver +', 'Gold'],
    );
    roundTrips(field('dateOnDatetime'), '2026-12-31');
  });

  it('reads lookups and tags by name', () => {
    expect(
      valueFromZoho(field('text'), { id: '1', name: 'Nadia Karam' }),
    ).toBe('Nadia Karam');
    expect(
      valueFromZoho(field('text'), [{ name: 'VIP' }, { name: 'Gulf' }]),
    ).toBe('VIP, Gulf');
  });

  it('reads the same instant whatever the time zone', () => {
    expect(
      valueFromZoho(field('datetime'), '2026-10-19T13:30:00+04:00'),
    ).toEqual(valueFromTwenty(field('datetime'), '2026-10-19T09:30:00.000Z'));
  });

  it('keeps the day picked in Twenty for a Zoho date', () => {
    // Picked in Beirut: local midnight is 21:00 UTC the day before.
    expect(
      valueFromTwenty(field('dateOnDatetime'), '2026-12-30T21:00:00.000Z'),
    ).toBe('2026-12-31');
    expect(
      valueFromTwenty(field('dateOnDatetime'), '2026-12-31T00:00:00.000Z'),
    ).toBe('2026-12-31');
  });

  it('treats an unknown picklist value as unreadable, not empty', () => {
    expect(valueFromZoho(tier, 'Platinum')).toBeUndefined();
    expect(valueFromZoho(tier, '-None-')).toBeNull();
  });

  it('sends Zoho the picklist value, not the Twenty one', () => {
    expect(valueToZoho(tier, 'SILVER_PLUS')).toBe('Silver +');
    expect(valueToZoho(field('datetime'), '2026-10-19T09:30:00Z')).toBe(
      '2026-10-19T09:30:00+00:00',
    );
  });
});

describe('reconcileFields', () => {
  const fields = [
    field('text', { zohoField: 'A', twentyField: 'zohoA' }),
    field('text', { zohoField: 'B', twentyField: 'zohoB' }),
    field('text', {
      zohoField: 'C',
      twentyField: 'zohoC',
      direction: 'fromZoho',
    }),
  ];
  const stored = { A: valueHash('a'), B: valueHash('b') };

  it('keeps an edit on each side when different fields changed', () => {
    const result = reconcileFields({
      fields,
      zoho: { A: 'a2', B: 'b', C: 'c' },
      twenty: { A: 'a', B: 'b2', C: 'c' },
      stored,
      latest: 'zoho',
    });

    expect(result.toTwenty).toEqual({ A: 'a2' });
    expect(result.toZoho).toEqual({ B: 'b2' });
    expect(result.conflicts).toBe(0);

    // After a pull, B keeps its old hash so the push still sends it.
    expect(stateAfterPull(fields, stored, result)).toEqual({
      A: valueHash('a2'),
      B: valueHash('b'),
    });
    expect(stateAfterPush(fields, stored, result)).toEqual({
      A: valueHash('a2'),
      B: valueHash('b2'),
    });
  });

  it('lets the latest edit win when the same field changed on both sides', () => {
    const zohoWins = reconcileFields({
      fields,
      zoho: { A: 'from zoho' },
      twenty: { A: 'from twenty' },
      stored,
      latest: 'zoho',
    });
    const twentyWins = reconcileFields({
      fields,
      zoho: { A: 'from zoho' },
      twenty: { A: 'from twenty' },
      stored,
      latest: 'twenty',
    });

    expect(zohoWins.toTwenty).toEqual({ A: 'from zoho' });
    expect(zohoWins.conflicts).toBe(1);
    expect(twentyWins.toZoho).toEqual({ A: 'from twenty' });
  });

  it('fills a field never synced from whichever side has a value', () => {
    const result = reconcileFields({
      fields,
      zoho: { A: 'zoho value', B: null },
      twenty: { A: null, B: 'twenty value' },
      stored: null,
      latest: 'twenty',
    });

    expect(result.toTwenty).toEqual({ A: 'zoho value' });
    expect(result.toZoho).toEqual({ B: 'twenty value' });
  });

  it('only ever copies read-only fields into Twenty', () => {
    const result = reconcileFields({
      fields,
      zoho: { C: 'formula result' },
      twenty: { C: 'edited in Twenty' },
      stored,
      latest: 'twenty',
    });

    expect(result.toTwenty).toEqual({ C: 'formula result' });
    expect(result.toZoho).toEqual({});
    expect(
      twentyFieldsChanged(fields, { A: 'a', B: 'b', C: 'edited' }, stored),
    ).toBe(false);
  });

  it('leaves a field alone when Zoho holds a value Twenty cannot read', () => {
    const result = reconcileFields({
      fields,
      zoho: { A: undefined },
      twenty: { A: 'a' },
      stored,
      latest: 'zoho',
    });

    expect(result.toTwenty).toEqual({});
    expect(result.toZoho).toEqual({});
  });
});

describe('field plan', () => {
  it('names Twenty fields after the Zoho API name', () => {
    expect(twentyFieldNameFor('Lead_Source')).toBe('zohoLeadSource');
    expect(twentyFieldNameFor('Customer_Tier1')).toBe('zohoCustomerTier1');
    expect(twentyFieldNameFor(`${'Very_Long_'.repeat(10)}Name`).length).toBe(
      63,
    );
  });

  it('builds valid Twenty option values', () => {
    expect(optionValueFor('Closed Won')).toBe('CLOSED_WON');
    expect(optionValueFor('Id. Decision Makers')).toBe('ID_DECISION_MAKERS');
    expect(optionValueFor('2nd call')).toBe('V_2ND_CALL');
    expect(optionValueFor('عميل مهم')).toMatch(/^OPTION_[0-9A-F]{6}$/);
  });

  it('adds options without touching existing ones', () => {
    const merged = mergeOptions({
      zohoValues: [
        { actual: 'New', display: 'New' },
        { actual: 'Closed Won', display: 'Closed Won' },
        { actual: 'Closed, Lost', display: 'Closed, Lost' },
      ],
      twentyOptions: [
        { id: 'o1', value: 'NEW', label: 'New', color: 'red', position: 0 },
      ],
      previous: [],
    });

    expect(merged.added).toBe(2);
    expect(merged.options[0]).toEqual({
      id: 'o1',
      value: 'NEW',
      label: 'New',
      color: 'red',
      position: 0,
    });
    expect(merged.selectOptions.map((option) => option.value)).toEqual([
      'NEW',
      'CLOSED_WON',
      'CLOSED_LOST',
    ]);
    // Twenty refuses commas in option labels.
    expect(merged.options[2].label).toBe('Closed Lost');
  });

  it('maps every field type and skips what Twenty cannot hold', () => {
    const plan = planModule({
      config: moduleConfigFor('Accounts'),
      zohoFields: [
        { api_name: 'Account_Name', data_type: 'text' },
        { api_name: 'Industry', data_type: 'picklist', field_label: 'Industry',
          pick_list_values: [{ display_value: 'Banking', actual_value: 'Banking' }] },
        { api_name: 'Employees', data_type: 'integer', field_label: 'Employees' },
        { api_name: 'Annual_Revenue', data_type: 'currency', field_label: 'Annual Revenue' },
        { api_name: 'Parent_Account', data_type: 'lookup', field_label: 'Parent Account' },
        { api_name: 'Score', data_type: 'formula', field_label: 'Score',
          formula: { return_type: 'double' } },
        { api_name: 'Attachments', data_type: 'fileupload', field_label: 'Attachments' },
        { api_name: 'Locked__s', data_type: 'boolean' },
        { api_name: 'Hidden', data_type: 'text', visible: false },
      ],
      twentyFields: [
        { id: 'f1', name: 'name', label: 'Name', type: 'TEXT' },
        { id: 'f2', name: 'industry', label: 'Industry', type: 'SELECT' },
        { id: 'f3', name: 'annualRevenue', label: 'Annual Revenue', type: 'CURRENCY' },
      ],
      previous: [],
    });

    expect(
      plan.fields.map((entry) => [entry.zohoField, entry.twentyField, entry.direction]),
    ).toEqual([
      ['Industry', 'zohoIndustry', 'both'],
      ['Employees', 'zohoEmployees', 'both'],
      ['Annual_Revenue', 'annualRevenue', 'both'],
      ['Parent_Account', 'zohoParentAccount', 'fromZoho'],
      ['Score', 'zohoScore', 'fromZoho'],
    ]);
    expect(plan.creates.map((create) => [create.name, create.type, create.label])).toEqual([
      ['zohoIndustry', 'SELECT', 'Industry (Zoho)'],
      ['zohoEmployees', 'NUMBER', 'Employees'],
      ['zohoParentAccount', 'TEXT', 'Parent Account'],
      ['zohoScore', 'NUMBER', 'Score'],
    ]);
    expect(plan.skipped).toEqual([
      expect.objectContaining({ zohoField: 'Attachments' }),
    ]);
  });

  it('refuses to reuse a Twenty field of another type', () => {
    const plan = planModule({
      config: moduleConfigFor('Contacts'),
      zohoFields: [{ api_name: 'Lead_Source', data_type: 'picklist' }],
      twentyFields: [
        { id: 'f1', name: 'zohoLeadSource', label: 'Lead Source', type: 'TEXT' },
      ],
      previous: [],
    });

    expect(plan.fields).toEqual([]);
    expect(plan.skipped[0].reason).toContain('of type TEXT');
  });
});
