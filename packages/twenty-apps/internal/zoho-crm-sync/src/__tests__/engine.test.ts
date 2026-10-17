import { beforeEach, describe, expect, it } from 'vitest';

import { Clock, FakeTwenty, FakeZoho, memoryStore } from 'src/__tests__/fakes';
import type { SyncDirection } from 'src/sync/config';
import { SyncEngine } from 'src/sync/engine';
import { loadState } from 'src/sync/state';

let clock: Clock;
let zoho: FakeZoho;
let twenty: FakeTwenty;
let store: ReturnType<typeof memoryStore>;

const runOnce = async ({
  direction = 'TWO_WAY',
  budgetMs = 60_000,
  startBackfill = false,
}: {
  direction?: SyncDirection;
  budgetMs?: number;
  startBackfill?: boolean;
} = {}) => {
  clock.tick(60_000);
  const engine = new SyncEngine(
    {
      zoho,
      twenty,
      store,
      config: { direction, defaultPhoneCountry: 'AE' },
      now: clock.now,
      budgetMs,
    },
    await loadState(store),
  );

  return engine.run({ startBackfill });
};

const people = () => [...twenty.people.values()];
const companies = () => [...twenty.companies.values()];

beforeEach(() => {
  clock = new Clock();
  zoho = new FakeZoho(clock);
  twenty = new FakeTwenty(clock);
  store = memoryStore();
});

describe('first import', () => {
  it('links existing Twenty records instead of duplicating them, and creates the rest', async () => {
    const acmetel = twenty.addCompany({
      name: 'Acme & Telecom',
      domainName: { primaryLinkUrl: 'acmetel.example' },
    });
    const gulfenergy = twenty.addCompany({
      name: 'Gulf Energy Oman L.L.C.',
    });
    const layla = twenty.addPerson({
      name: { firstName: 'Layla', lastName: 'Haddad' },
      emails: {
        primaryEmail: 'layla.haddad@acmetel.example',
        additionalEmails: [],
      },
      jobTitle: 'Head of Portfolio Management',
      companyId: acmetel.id,
    });
    const sara = twenty.addPerson({
      name: { firstName: 'Sara', lastName: 'Mansour' },
      companyId: gulfenergy.id,
    });

    const zohoAcme = zoho.add('Accounts', {
      Account_Name: 'Acme Telecom',
      Website: 'https://www.acmetel.example',
    });
    const zohoGulf = zoho.add('Accounts', {
      Account_Name: 'Gulf Energy Oman',
      Billing_City: 'Muscat',
    });
    const zohoNew = zoho.add('Accounts', {
      Account_Name: 'Desert Tech Park',
      Owner: { id: 'u1', email: 'owner@example.com' },
    });

    twenty.members = [{ id: 'member-1', userEmail: 'owner@example.com' }];

    zoho.add('Contacts', {
      First_Name: 'Layla',
      Last_Name: 'Haddad',
      Email: 'LAYLA.HADDAD@acmetel.example',
      Title: 'Head of Portfolio',
      Phone: '050 123 4567',
      Account_Name: { id: zohoAcme.id },
    });
    zoho.add('Contacts', {
      First_Name: 'Sara',
      Last_Name: 'Mansour',
      Mobile: '+1 202 555 0143',
      Account_Name: { id: zohoGulf.id },
    });
    zoho.add('Contacts', {
      First_Name: 'Omar',
      Last_Name: 'Farouk',
      Email: 'omar@deserttech.example',
      Account_Name: { id: zohoNew.id },
    });

    const result = await runOnce();

    expect(result.initialImportDone).toBe(true);
    expect(result.counts).toMatchObject({
      companiesLinked: 2,
      companiesCreated: 1,
      peopleLinked: 2,
      peopleCreated: 1,
      errors: 0,
    });
    expect(companies()).toHaveLength(3);
    expect(people()).toHaveLength(3);

    // Matched by website and by name without the legal form.
    expect(twenty.companies.get(acmetel.id)?.zohoAccountId).toBe(zohoAcme.id);
    expect(twenty.companies.get(gulfenergy.id)?.zohoAccountId).toBe(
      zohoGulf.id,
    );
    // Twenty's name wins; the gap (city) is filled from Zoho.
    expect(twenty.companies.get(gulfenergy.id)?.name).toBe(
      'Gulf Energy Oman L.L.C.',
    );
    expect(twenty.companies.get(gulfenergy.id)?.address?.addressCity).toBe(
      'Muscat',
    );

    const created = companies().find(
      (company) => company.zohoAccountId === zohoNew.id,
    );

    expect(created?.accountOwnerId).toBe('member-1');

    // Matched by email; Twenty's job title wins, the phone comes from Zoho.
    const linkedLayla = twenty.people.get(layla.id)!;

    expect(linkedLayla.zohoContactId).toBeTruthy();
    expect(linkedLayla.jobTitle).toBe('Head of Portfolio Management');
    expect(linkedLayla.phones?.primaryPhoneNumber).toBe('501234567');

    // Matched by name within the same company.
    expect(twenty.people.get(sara.id)?.zohoContactId).toBeTruthy();

    const omar = people().find(
      (person) => person.emails?.primaryEmail === 'omar@deserttech.example',
    );

    expect(omar?.companyId).toBe(created?.id);

    // Twenty's winning values went back to Zoho in the same run.
    const laylaInZoho = [...zoho.modules.Contacts.values()].find(
      (contact) => contact.Last_Name === 'Haddad',
    )!;

    expect(laylaInZoho.Title).toBe('Head of Portfolio Management');
    expect(zoho.modules.Accounts.get(zohoGulf.id)?.Account_Name).toBe(
      'Gulf Energy Oman L.L.C.',
    );
  });

  it('does not push records that existed before the first run', async () => {
    twenty.addPerson({ name: { firstName: 'Only', lastName: 'InTwenty' } });

    await runOnce();

    expect(zoho.modules.Contacts.size).toBe(0);
  });

  it('continues across runs when the budget runs out', async () => {
    for (let index = 0; index < 450; index++) {
      zoho.add('Contacts', {
        Last_Name: `Person ${index}`,
        Email: `p${index}@x.com`,
      });
    }

    let result = await runOnce({ budgetMs: 1 });

    expect(result.initialImportDone).toBe(false);
    expect(result.moreWorkPending).toBe(true);

    for (let run = 0; run < 10 && !result.initialImportDone; run++) {
      result = await runOnce({ budgetMs: 1 });
    }

    expect(result.initialImportDone).toBe(true);
    expect(people()).toHaveLength(450);
  });

  it('pages through more than a page of records changed in the same second', async () => {
    const sameSecond = clock.current;

    for (let index = 0; index < 450; index++) {
      const record = zoho.add('Contacts', {
        Last_Name: `Batch ${index}`,
      });

      record.Modified_Time = `${new Date(sameSecond).toISOString().slice(0, 19)}+00:00`;
    }

    await runOnce();

    expect(people()).toHaveLength(450);
  });
});

describe('steady state', () => {
  beforeEach(async () => {
    const account = zoho.add('Accounts', {
      Account_Name: 'Mountain Valley',
      Website: 'mountainvalley.example',
    });

    zoho.add('Contacts', {
      First_Name: 'Nadia',
      Last_Name: 'Saleh',
      Email: 'nadia@mountainview.example',
      Phone: '+20 100 123 4567',
      Account_Name: { id: account.id },
    });
    await runOnce();
    zoho.writes = [];
  });

  it('does nothing when nothing changed', async () => {
    const before = JSON.stringify(
      [...twenty.people.values()].map((person) => person.updatedAt),
    );
    const result = await runOnce();

    expect(zoho.writes).toEqual([]);
    expect(
      result.counts.peopleUpdated + result.counts.zohoContactsUpdated,
    ).toBe(0);
    expect(
      JSON.stringify(
        [...twenty.people.values()].map((person) => person.updatedAt),
      ),
    ).toBe(before);
  });

  it('sends a Twenty edit to Zoho, only the changed field, without an echo back', async () => {
    const nadia = people()[0];

    twenty.editPerson(nadia.id, {
      jobTitle: 'Director of Human Resources',
    });
    await runOnce();

    expect(zoho.writes).toHaveLength(1);
    expect(zoho.writes[0].records).toEqual([
      { id: nadia.zohoContactId, Title: 'Director of Human Resources' },
    ]);

    zoho.writes = [];
    const result = await runOnce();

    expect(zoho.writes).toEqual([]);
    expect(result.counts.peopleUpdated).toBe(0);
  });

  it('brings a Zoho edit into Twenty without sending it back', async () => {
    const nadia = people()[0];

    zoho.edit('Contacts', nadia.zohoContactId as string, {
      Title: 'CHRO',
      Secondary_Email: 'n@mv.example',
    });
    const result = await runOnce();

    expect(result.counts.peopleUpdated).toBe(1);
    expect(twenty.people.get(nadia.id)?.jobTitle).toBe('CHRO');
    expect(twenty.people.get(nadia.id)?.emails?.additionalEmails).toEqual([
      'n@mv.example',
    ]);
    expect(zoho.writes).toEqual([]);

    await runOnce();
    expect(zoho.writes).toEqual([]);
  });

  it('keeps the latest edit when both sides changed', async () => {
    const nadia = people()[0];

    twenty.editPerson(nadia.id, { jobTitle: 'Edited in Twenty first' });
    zoho.edit('Contacts', nadia.zohoContactId as string, {
      Title: 'Edited in Zoho later',
    });
    const result = await runOnce();

    expect(result.counts.conflicts).toBeGreaterThan(0);
    expect(twenty.people.get(nadia.id)?.jobTitle).toBe('Edited in Zoho later');
    expect(
      zoho.modules.Contacts.get(nadia.zohoContactId as string)?.Title,
    ).toBe('Edited in Zoho later');
  });

  it('creates a new Twenty person in Zoho, creating the company first', async () => {
    const company = twenty.addCompany({
      name: 'Pharma & Health',
      domainName: { primaryLinkUrl: 'pharmaco.example' },
    });
    const rana = twenty.addPerson({
      name: { firstName: 'Rana', lastName: 'Khalil' },
      emails: {
        primaryEmail: 'rkhalil@pharmaco.example',
        additionalEmails: [],
      },
      phones: {
        primaryPhoneNumber: '1001234567',
        primaryPhoneCallingCode: '+20',
        primaryPhoneCountryCode: 'EG',
        additionalPhones: [],
      },
      companyId: company.id,
    });

    await runOnce();

    const zohoCompanyId = twenty.companies.get(company.id)
      ?.zohoAccountId as string;
    const zohoContactId = twenty.people.get(rana.id)?.zohoContactId as string;

    expect(zoho.modules.Accounts.get(zohoCompanyId)?.Account_Name).toBe(
      'Pharma & Health',
    );
    expect(zoho.modules.Contacts.get(zohoContactId)).toMatchObject({
      First_Name: 'Rana',
      Last_Name: 'Khalil',
      Email: 'rkhalil@pharmaco.example',
      Phone: '+20 1001234567',
      Account_Name: { id: zohoCompanyId },
    });

    zoho.writes = [];
    await runOnce();
    expect(zoho.writes).toEqual([]);
  });

  it('leaves people Twenty created from emails out of Zoho', async () => {
    twenty.addPerson({
      name: { firstName: 'Newsletter', lastName: 'Sender' },
      emails: { primaryEmail: 'news@example.com', additionalEmails: [] },
      source: 'EMAIL',
    });
    await runOnce();

    expect(zoho.writes).toEqual([]);
  });

  it('does not bring back a person deleted in Twenty', async () => {
    const nadia = people()[0];

    twenty.people.get(nadia.id)!.deletedAt = clock.iso();
    zoho.edit('Contacts', nadia.zohoContactId as string, {
      Title: 'Changed in Zoho',
    });
    await runOnce();

    expect(people()).toHaveLength(1);
    expect(twenty.people.get(nadia.id)?.jobTitle).not.toBe('Changed in Zoho');
  });

  it('keeps a Zoho phone number it cannot read', async () => {
    const nadia = people()[0];

    zoho.edit('Contacts', nadia.zohoContactId as string, {
      Mobile: 'ask the assistant',
    });
    await runOnce();
    twenty.editPerson(nadia.id, { jobTitle: 'HR' });
    await runOnce();

    expect(
      zoho.modules.Contacts.get(nadia.zohoContactId as string)?.Mobile,
    ).toBe('ask the assistant');
  });

  it('saves a person without the phones Twenty refuses, and says so', async () => {
    twenty.rejectPhone = () => true;
    zoho.add('Contacts', {
      Last_Name: 'Odd Phone',
      Phone: '+971 50 000 0000',
    });
    const result = await runOnce();

    expect(
      people().find((person) => person.name?.lastName === 'Odd Phone'),
    ).toBeDefined();
    expect(result.errors[0]?.message).toContain('without its phone numbers');
  });

  it('only mirrors Zoho to Twenty in the one-way mode', async () => {
    const nadia = people()[0];

    twenty.editPerson(nadia.id, { jobTitle: 'Local edit' });
    await runOnce({ direction: 'ZOHO_TO_TWENTY' });

    expect(zoho.writes).toEqual([]);
  });
});

describe('backfill', () => {
  it('sends unlinked Twenty records to Zoho, linking ones Zoho already has', async () => {
    await runOnce();
    zoho.add('Contacts', {
      Last_Name: 'Existing',
      Email: 'existing@x.com',
    });
    // Created in Zoho after the person below is linked by the upsert.
    const before = zoho.modules.Contacts.size;

    twenty.addPerson({
      name: { firstName: 'Already', lastName: 'Existing' },
      emails: { primaryEmail: 'existing@x.com', additionalEmails: [] },
    });
    const store2 = await loadState(store);

    // Pretend the person predates the sync so only the backfill sends it.
    store2.push.people = { since: clock.iso(), after: null, passMax: null };
    await store.set('zoho-sync:state', store2);
    twenty.addPerson({ name: { firstName: 'Brand', lastName: 'New' } });
    const linkedPersonCount = people().length;

    const result = await runOnce({
      direction: 'TWENTY_TO_ZOHO',
      startBackfill: true,
    });

    expect(result.backfillRunning).toBe(false);
    expect(people()).toHaveLength(linkedPersonCount);
    expect(people().every((person) => person.zohoContactId)).toBe(true);
    expect(zoho.modules.Contacts.size).toBe(before + 1);
  });
});
