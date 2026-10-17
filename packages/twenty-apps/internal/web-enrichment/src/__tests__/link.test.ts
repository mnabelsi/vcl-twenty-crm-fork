import { beforeEach, describe, expect, it } from 'vitest';

import { FakeTwenty } from 'src/__tests__/fakes';
import { linkPeopleToCompanies } from 'src/link/linker';

let twenty: FakeTwenty;

beforeEach(() => {
  twenty = new FakeTwenty();
});

describe('learning company domains', () => {
  it('learns the website and the work domains of its people, never personal ones', async () => {
    const falcon = twenty.addCompany('Desert Falcon Logistics', {
      domainName: { primaryLinkUrl: 'desertfalcon.ae' },
    });

    for (const email of ['a@dfl-group.com', 'b@dfl-group.com', 'c@gmail.com']) {
      twenty.addPerson('Fictitious', 'Person', {
        companyId: falcon.id,
        emails: [email],
      });
    }
    // One person's domain counts only when it looks like the company's name.
    twenty.addPerson('Other', 'Person', {
      companyId: falcon.id,
      emails: ['x@consultco.com'],
    });
    twenty.addPerson('Another', 'Person', {
      companyId: falcon.id,
      emails: ['y@desertfalcon.com.sa'],
    });

    await linkPeopleToCompanies(twenty);

    expect(twenty.companies.get(falcon.id)?.emailDomains).toEqual([
      'desertfalcon.ae',
      'desertfalcon.com.sa',
      'dfl-group.com',
    ]);
  });

  it('lets a branch share the website of its group', async () => {
    twenty.addCompany('Gulf Pearl Industries', {
      domainName: { primaryLinkUrl: 'gulfpearl.com' },
    });
    const branch = twenty.addCompany('Gulf Pearl Industries - Bahrain', {
      websiteSearch: 'SHARED',
      websiteSuggestion: { primaryLinkUrl: 'https://gulfpearl.com' },
    });

    await linkPeopleToCompanies(twenty);

    expect(twenty.companies.get(branch.id)?.emailDomains).toEqual([
      'gulfpearl.com',
    ]);
  });
});

describe('linking people', () => {
  it('links a person without company to the one company of their domain', async () => {
    const falcon = twenty.addCompany('Desert Falcon Logistics', {
      domainName: { primaryLinkUrl: 'desertfalcon.ae' },
    });
    const layla = twenty.addPerson('Layla', 'Haddad', {
      emails: ['layla@desertfalcon.ae'],
    });

    const counts = await linkPeopleToCompanies(twenty);

    expect(twenty.people.get(layla.id)).toMatchObject({
      companyId: falcon.id,
      companyCheck: 'LINKED',
    });
    expect(counts.peopleLinked).toBe(1);

    // A second sweep finds nothing left to do.
    const again = await linkPeopleToCompanies(twenty);

    expect(again.peopleLinked).toBe(0);
    expect(again.companiesWithNewDomains).toBe(0);
  });

  it('suggests the group when several companies share the domain', async () => {
    const group = twenty.addCompany('Gulf Pearl Industries', {
      domainName: { primaryLinkUrl: 'gulfpearl.com' },
    });

    twenty.addCompany('Gulf Pearl Industries - Bahrain', {
      websiteSearch: 'SHARED',
      websiteSuggestion: { primaryLinkUrl: 'https://gulfpearl.com' },
    });
    const omar = twenty.addPerson('Omar', 'Farouk', {
      emails: ['omar@gulfpearl.com'],
    });

    await linkPeopleToCompanies(twenty);

    expect(twenty.people.get(omar.id)).toMatchObject({
      companyId: null,
      companyCheck: 'CHOOSE',
      suggestedCompanyId: group.id,
    });
  });

  it('flags a domain that several people use but no company has', async () => {
    const first = twenty.addPerson('Sara', 'Nasser', {
      emails: ['sara@bluewave.example'],
    });
    const second = twenty.addPerson('Hadi', 'Nasser', {
      emails: ['hadi@bluewave.example'],
    });
    const alone = twenty.addPerson('Rami', 'Aziz', {
      emails: ['rami@lonely.example'],
    });

    await linkPeopleToCompanies(twenty);

    expect(twenty.people.get(first.id)?.companyCheck).toBe(
      'NO_COMPANY_FOR_DOMAIN',
    );
    expect(twenty.people.get(second.id)?.companyCheck).toBe(
      'NO_COMPANY_FOR_DOMAIN',
    );
    expect(twenty.people.get(alone.id)?.companyCheck).toBeNull();
  });

  it('flags, without moving, a person whose email belongs to another company', async () => {
    const falcon = twenty.addCompany('Desert Falcon Logistics', {
      domainName: { primaryLinkUrl: 'desertfalcon.ae' },
    });
    const pearl = twenty.addCompany('Gulf Pearl Industries', {
      domainName: { primaryLinkUrl: 'gulfpearl.com' },
    });
    const moved = twenty.addPerson('Layla', 'Haddad', {
      companyId: falcon.id,
      emails: ['layla@gulfpearl.com'],
    });
    const fine = twenty.addPerson('Omar', 'Farouk', {
      companyId: falcon.id,
      emails: ['omar@desertfalcon.ae'],
    });

    await linkPeopleToCompanies(twenty);

    expect(twenty.people.get(moved.id)).toMatchObject({
      companyId: falcon.id,
      companyCheck: 'OTHER_COMPANY',
      suggestedCompanyId: pearl.id,
    });
    expect(twenty.people.get(fine.id)?.companyCheck).toBeNull();
  });

  it('leaves a person marked Checked alone', async () => {
    const falcon = twenty.addCompany('Desert Falcon Logistics', {
      domainName: { primaryLinkUrl: 'desertfalcon.ae' },
    });

    twenty.addCompany('Gulf Pearl Industries', {
      domainName: { primaryLinkUrl: 'gulfpearl.com' },
    });
    const checked = twenty.addPerson('Layla', 'Haddad', {
      companyId: falcon.id,
      emails: ['layla@gulfpearl.com'],
      companyCheck: 'CHECKED',
    });

    await linkPeopleToCompanies(twenty);

    expect(twenty.people.get(checked.id)).toMatchObject({
      companyId: falcon.id,
      companyCheck: 'CHECKED',
      suggestedCompanyId: null,
    });
  });
});
