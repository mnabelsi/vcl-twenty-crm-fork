import { beforeEach, describe, expect, it } from 'vitest';

import {
  Clock,
  FakeMetadata,
  FakeTwenty,
  FakeZoho,
  memoryStore,
} from 'src/__tests__/fakes';
import type { SyncDirection } from 'src/sync/config';
import { SyncEngine } from 'src/sync/engine';
import { loadSchema, SCHEMA_MAX_AGE_MS } from 'src/sync/fields/schema';
import { loadState } from 'src/sync/state';

let clock: Clock;
let zoho: FakeZoho;
let twenty: FakeTwenty;
let metadata: FakeMetadata;
let store: ReturnType<typeof memoryStore>;

const runOnce = async ({
  direction = 'TWO_WAY',
  startBackfill = false,
  refreshFields = false,
}: {
  direction?: SyncDirection;
  startBackfill?: boolean;
  refreshFields?: boolean;
} = {}) => {
  clock.tick(60_000);
  const engine = new SyncEngine(
    {
      zoho,
      twenty,
      metadata,
      store,
      config: { direction, defaultPhoneCountry: 'AE' },
      now: clock.now,
      budgetMs: 60_000,
    },
    await loadState(store),
  );

  return engine.run({ startBackfill, refreshFields });
};

// The first run creates the fields; the next ones move the data.
const runUntilSettled = async (options: Parameters<typeof runOnce>[0] = {}) => {
  let result = await runOnce(options);

  for (let run = 0; run < 5 && result.moreWorkPending; run++) {
    result = await runOnce(options);
  }

  return result;
};

const people = () => [...twenty.people.values()] as Record<string, any>[];
const opportunities = () =>
  [...twenty.opportunities.values()] as Record<string, any>[];

beforeEach(() => {
  clock = new Clock();
  zoho = new FakeZoho(clock);
  twenty = new FakeTwenty(clock);
  metadata = new FakeMetadata();
  store = memoryStore();

  zoho.fields.Contacts = [
    { api_name: 'First_Name', data_type: 'text' },
    { api_name: 'Last_Name', data_type: 'text' },
    { api_name: 'Email', data_type: 'email' },
    {
      api_name: 'Lead_Source',
      data_type: 'picklist',
      field_label: 'Lead Source',
      pick_list_values: [
        { display_value: '-None-', actual_value: '-None-' },
        { display_value: 'Trade Show', actual_value: 'Trade Show' },
        { display_value: 'Referral', actual_value: 'Referral' },
      ],
    },
    { api_name: 'Department', data_type: 'text', field_label: 'Department' },
    {
      api_name: 'Date_of_Birth',
      data_type: 'date',
      field_label: 'Date of Birth',
    },
    {
      api_name: 'Email_Opt_Out',
      data_type: 'boolean',
      field_label: 'Email Opt Out',
    },
    {
      api_name: 'Created_Time',
      data_type: 'datetime',
      field_label: 'Created Time',
      read_only: true,
    },
    {
      api_name: 'Owner',
      data_type: 'ownerlookup',
      field_label: 'Contact Owner',
    },
  ];
  zoho.fields.Accounts = [
    { api_name: 'Account_Name', data_type: 'text' },
    {
      api_name: 'Industry',
      data_type: 'picklist',
      field_label: 'Industry',
      pick_list_values: [{ display_value: 'Banking', actual_value: 'Banking' }],
    },
    {
      api_name: 'Annual_Revenue',
      data_type: 'currency',
      field_label: 'Annual Revenue',
    },
  ];
  zoho.fields.Deals = [
    { api_name: 'Deal_Name', data_type: 'text', field_label: 'Deal Name' },
    { api_name: 'Amount', data_type: 'currency', field_label: 'Amount' },
    { api_name: 'Closing_Date', data_type: 'date', field_label: 'Closing Date' },
    {
      api_name: 'Stage',
      data_type: 'picklist',
      field_label: 'Stage',
      pick_list_values: [
        { display_value: 'Qualification', actual_value: 'Qualification' },
        { display_value: 'Negotiation/Review', actual_value: 'Negotiation/Review' },
        { display_value: 'Closed Won', actual_value: 'Closed Won' },
      ],
    },
    { api_name: 'Account_Name', data_type: 'lookup' },
    { api_name: 'Contact_Name', data_type: 'lookup' },
    { api_name: 'Probability', data_type: 'integer', field_label: 'Probability (%)' },
    { api_name: 'Next_Step', data_type: 'text', field_label: 'Next Step' },
  ];
});

describe('every Zoho field', () => {
  it('creates a Twenty field for each Zoho field, then fills them', async () => {
    const zohoContact = zoho.add('Contacts', {
      First_Name: 'Rania',
      Last_Name: 'Saleh',
      Email: 'rania@cedarbank.example',
      Lead_Source: 'Trade Show',
      Department: 'Learning & Development',
      Date_of_Birth: '1988-04-12',
      Email_Opt_Out: true,
      Created_Time: '2026-01-05T10:00:00+04:00',
      Owner: { id: 'u1', name: 'Karim Aziz', email: 'karim@example.com' },
    });

    const first = await runOnce();

    expect(first.counts.fieldsCreated).toBe(
      metadata.created.length,
    );
    expect(metadata.created.map((field) => field.name)).toEqual(
      expect.arrayContaining([
        'zohoLeadSource',
        'zohoDepartment',
        'zohoDateOfBirth',
        'zohoEmailOptOut',
        'zohoCreatedTime',
        'zohoOwner',
        'zohoIndustry',
        'zohoProbability',
        'zohoNextStep',
      ]),
    );
    // Zoho's Annual_Revenue lands in Twenty's own Annual Revenue field.
    expect(metadata.created.map((field) => field.name)).not.toContain(
      'zohoAnnualRevenue',
    );
    // New fields are used from the next run.
    expect(first.followUpSoon).toBe(true);
    expect(people()).toHaveLength(0);

    await runUntilSettled();

    const rania = people().find(
      (person) => person.zohoContactId === zohoContact.id,
    )!;

    expect(rania).toMatchObject({
      zohoLeadSource: 'TRADE_SHOW',
      zohoDepartment: 'Learning & Development',
      zohoDateOfBirth: '1988-04-12',
      zohoEmailOptOut: true,
      zohoCreatedTime: '2026-01-05T06:00:00Z',
      zohoOwner: 'Karim Aziz',
    });
    // The state is keyed by Zoho field and Twenty field id.
    expect(Object.keys(JSON.parse(rania.zohoFieldState))).toContainEqual(
      expect.stringMatching(/^Lead_Source:[0-9a-f]{8}$/),
    );
  });

  it('fills the new fields on records linked before they existed', async () => {
    zoho.fields.Contacts = zoho.fields.Contacts.filter(
      (field) => field.api_name !== 'Department',
    );
    const zohoContact = zoho.add('Contacts', {
      Last_Name: 'Haddad',
      Department: 'Finance',
    });

    await runUntilSettled();
    expect(people()[0].zohoDepartment).toBeUndefined();

    // A field added in Zoho later, found on the next refresh.
    zoho.fields.Contacts.push({
      api_name: 'Department',
      data_type: 'text',
      field_label: 'Department',
    });
    clock.tick(SCHEMA_MAX_AGE_MS + 1);
    await runUntilSettled();

    expect(
      people().find((person) => person.zohoContactId === zohoContact.id)
        ?.zohoDepartment,
    ).toBe('Finance');
  });

  it('keeps an edit on each side when different fields changed', async () => {
    const zohoContact = zoho.add('Contacts', {
      Last_Name: 'Mansour',
      Department: 'HR',
      Lead_Source: 'Referral',
    });

    await runUntilSettled();

    const sara = people()[0];

    twenty.editPerson(sara.id, { zohoDepartment: 'People & Culture' });
    zoho.edit('Contacts', zohoContact.id, { Lead_Source: 'Trade Show' });
    zoho.writes = [];

    await runUntilSettled();

    expect(twenty.people.get(sara.id)).toMatchObject({
      zohoDepartment: 'People & Culture',
      zohoLeadSource: 'TRADE_SHOW',
    });
    expect(zoho.modules.Contacts.get(zohoContact.id)).toMatchObject({
      Department: 'People & Culture',
      Lead_Source: 'Trade Show',
    });
    // Only the changed field went to Zoho.
    expect(zoho.writes).toEqual([
      expect.objectContaining({
        module: 'Contacts',
        kind: 'update',
        records: [{ id: zohoContact.id, Department: 'People & Culture' }],
      }),
    ]);

    // Nothing moves once both sides agree.
    zoho.writes = [];
    const settled = await runOnce();

    expect(zoho.writes).toEqual([]);
    expect(settled.counts.peopleUpdated).toBe(0);
  });

  it('creates a field deleted in Twenty again without emptying Zoho', async () => {
    const zohoContact = zoho.add('Contacts', {
      Last_Name: 'Aoun',
      Department: 'Strategy',
    });

    await runUntilSettled();

    const person = people()[0];
    const objectFields = metadata.objects.person.fields;

    // Deleted by hand in Twenty settings, with its data.
    objectFields.splice(
      objectFields.findIndex((field) => field.name === 'zohoDepartment'),
      1,
    );
    delete (twenty.people.get(person.id) as Record<string, unknown>)
      .zohoDepartment;
    zoho.writes = [];

    await runUntilSettled();

    expect(metadata.field('person', 'zohoDepartment')).toBeDefined();
    expect(zoho.modules.Contacts.get(zohoContact.id)?.Department).toBe(
      'Strategy',
    );
    expect(zoho.writes).toEqual([]);
    expect(
      (twenty.people.get(person.id) as Record<string, unknown>).zohoDepartment,
    ).toBe('Strategy');
  });

  it('never sends read-only fields to Zoho', async () => {
    const zohoContact = zoho.add('Contacts', {
      Last_Name: 'Farouk',
      Owner: { id: 'u1', name: 'Karim Aziz' },
    });

    await runUntilSettled();

    const omar = people()[0];

    twenty.editPerson(omar.id, { zohoOwner: 'Someone else' });
    zoho.writes = [];
    await runUntilSettled();

    expect(zoho.writes).toEqual([]);
    expect(zoho.modules.Contacts.get(zohoContact.id)?.Owner).toEqual({
      id: 'u1',
      name: 'Karim Aziz',
    });
  });

  it('adds a Twenty option for a picklist value Zoho no longer lists', async () => {
    zoho.add('Contacts', { Last_Name: 'Nassar', Lead_Source: 'Cold Call' });

    await runUntilSettled();

    expect(people()[0].zohoLeadSource).toBe('COLD_CALL');
    expect(
      metadata
        .field('person', 'zohoLeadSource')
        ?.options?.map((option) => option.label),
    ).toContain('Cold Call');
  });

  it('sends the mirrored fields of a person created in Twenty', async () => {
    await runUntilSettled();

    const person = twenty.addPerson({
      name: { firstName: 'Lina', lastName: 'Daher' },
      emails: { primaryEmail: 'lina@cedarbank.example', additionalEmails: [] },
    });

    twenty.editPerson(person.id, {
      zohoDepartment: 'Digital',
      zohoLeadSource: 'REFERRAL',
    });
    await runUntilSettled();

    const created = [...zoho.modules.Contacts.values()].find(
      (contact) => contact.Last_Name === 'Daher',
    );

    expect(created).toMatchObject({
      Department: 'Digital',
      Lead_Source: 'Referral',
    });
  });

  it('keeps the core sync running when Zoho refuses the field list', async () => {
    // A connection made before this version: no field settings, no Deals.
    zoho.missingScopes = new Set(['settings', 'Deals']);
    zoho.add('Contacts', { Last_Name: 'Khoury', Email: 'k@example.com' });

    const result = await runUntilSettled();

    expect(people()).toHaveLength(1);
    expect(result.warning).toMatch(/Reconnect Zoho/);
    expect(metadata.created).toEqual([]);
  });
});

describe('deals', () => {
  it('brings deals in as opportunities, linked to their company and contact', async () => {
    const account = zoho.add('Accounts', { Account_Name: 'Cedar Bank' });
    const contact = zoho.add('Contacts', {
      Last_Name: 'Saleh',
      Account_Name: { id: account.id },
    });

    twenty.members = [{ id: 'member-1', userEmail: 'karim@example.com' }];
    const deal = zoho.add('Deals', {
      Deal_Name: 'Cedar Bank AI Academy',
      Amount: 250000,
      Closing_Date: '2026-12-15',
      Stage: 'Negotiation/Review',
      Probability: 75,
      Next_Step: 'Send revised proposal',
      Account_Name: { id: account.id, name: 'Cedar Bank' },
      Contact_Name: { id: contact.id, name: 'Saleh' },
      Owner: { id: 'u1', name: 'Karim Aziz', email: 'karim@example.com' },
    });

    const result = await runUntilSettled();

    expect(result.counts.errors).toBe(0);

    const opportunity = opportunities().find(
      (candidate) => candidate.zohoDealId === deal.id,
    )!;
    const company = [...twenty.companies.values()].find(
      (candidate) => candidate.zohoAccountId === account.id,
    )!;
    const person = people().find(
      (candidate) => candidate.zohoContactId === contact.id,
    )!;

    expect(opportunity).toMatchObject({
      name: 'Cedar Bank AI Academy',
      amount: { amountMicros: 250_000_000_000, currencyCode: 'AED' },
      closeDate: '2026-12-15T00:00:00.000Z',
      stage: 'NEGOTIATION_REVIEW',
      zohoProbability: 75,
      zohoNextStep: 'Send revised proposal',
      companyId: company.id,
      pointOfContactId: person.id,
      ownerId: 'member-1',
    });
    // Zoho's stages became options of Twenty's Stage field.
    expect(
      metadata
        .field('opportunity', 'stage')
        ?.options?.map((option) => option.value),
    ).toEqual(['NEW', 'QUALIFICATION', 'NEGOTIATION_REVIEW', 'CLOSED_WON']);
  });

  it('sends a stage change made in Twenty to Zoho', async () => {
    const deal = zoho.add('Deals', {
      Deal_Name: 'Pharma onboarding',
      Stage: 'Qualification',
      Closing_Date: '2026-11-30',
    });

    await runUntilSettled();

    const opportunity = opportunities()[0];

    twenty.editOpportunity(opportunity.id, {
      stage: 'CLOSED_WON',
      closeDate: '2026-11-19T21:00:00.000Z',
    });
    zoho.writes = [];
    await runUntilSettled();

    expect(zoho.modules.Deals.get(deal.id)).toMatchObject({
      Stage: 'Closed Won',
      Closing_Date: '2026-11-20',
    });
    expect(zoho.writes[0].records).toEqual([
      { id: deal.id, Stage: 'Closed Won', Closing_Date: '2026-11-20' },
    ]);
  });

  it('creates a deal in Zoho for an opportunity made in Twenty, with its company', async () => {
    await runUntilSettled();

    const company = twenty.addCompany({ name: 'Gulf Retail Group' });
    const opportunity = twenty.addOpportunity({
      name: 'Retail upskilling',
      stage: 'NEW',
      companyId: company.id,
    });

    twenty.editOpportunity(opportunity.id, {
      stage: 'QUALIFICATION',
      amount: { amountMicros: 90_000_000_000, currencyCode: 'AED' },
      closeDate: '2027-01-31T00:00:00.000Z',
    });

    const result = await runUntilSettled();

    expect(result.counts.errors).toBe(0);

    const zohoAccount = [...zoho.modules.Accounts.values()].find(
      (account) => account.Account_Name === 'Gulf Retail Group',
    )!;
    const zohoDeal = [...zoho.modules.Deals.values()].find(
      (deal) => deal.Deal_Name === 'Retail upskilling',
    )!;

    expect(zohoDeal).toMatchObject({
      Stage: 'Qualification',
      Amount: 90000,
      Closing_Date: '2027-01-31',
      Account_Name: { id: zohoAccount.id },
    });
    expect(twenty.opportunities.get(opportunity.id)?.zohoDealId).toBe(
      zohoDeal.id,
    );

    // Settled: the next run writes nothing anywhere.
    zoho.writes = [];
    await runOnce();
    expect(zoho.writes).toEqual([]);
  });

  it('skips deals when the connection has no Deals scope', async () => {
    zoho.missingScopes = new Set(['Deals']);
    zoho.add('Deals', { Deal_Name: 'Hidden deal', Stage: 'Qualification' });
    zoho.add('Contacts', { Last_Name: 'Still synced' });

    const result = await runUntilSettled();

    expect(opportunities()).toHaveLength(0);
    expect(people()).toHaveLength(1);
    expect(result.warning).toMatch(/Reconnect Zoho/);
    expect((await loadSchema(store))?.modules.Deals).toBeUndefined();
  });
});
