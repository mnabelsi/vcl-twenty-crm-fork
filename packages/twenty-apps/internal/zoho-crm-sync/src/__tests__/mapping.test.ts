import { describe, expect, it } from 'vitest';

import {
  companyDataForTwenty,
  companyFingerprint,
  companyValuesFromTwenty,
  companyValuesFromZoho,
  mergePersonValues,
  personDataForTwenty,
  personFingerprint,
  personValuesFromTwenty,
  personValuesFromZoho,
  type TwentyPerson,
  zohoContactChanges,
} from 'src/sync/mapping';
import { companyNameKey, parsePhone, websiteHost } from 'src/sync/normalize';

describe('parsePhone', () => {
  it('reads international numbers whatever their spacing', () => {
    expect(parsePhone('+971 50 123 4567', null)).toEqual({
      number: '501234567',
      callingCode: '+971',
      countryCode: 'AE',
    });
    expect(parsePhone('00971501234567', null)?.number).toBe('501234567');
  });

  it('uses the fallback country for local numbers', () => {
    expect(parsePhone('050 123 4567', 'AE')).toEqual({
      number: '501234567',
      callingCode: '+971',
      countryCode: 'AE',
    });
    expect(parsePhone('050 123 4567', null)).toBeNull();
  });

  it('ignores text that is not a phone number', () => {
    expect(parsePhone('n/a', 'AE')).toBeNull();
    expect(parsePhone('', 'AE')).toBeNull();
  });
});

describe('normalisation keys', () => {
  it('compares websites by host', () => {
    expect(websiteHost('https://www.Acme.com/about')).toBe('acme.com');
    expect(websiteHost('acme.com')).toBe('acme.com');
  });

  it('matches company names without legal forms or punctuation', () => {
    expect(companyNameKey('Acme Trading L.L.C.')).toBe(
      companyNameKey('ACME Trading'),
    );
    expect(companyNameKey('Pharma & Health')).toBe('pharma and health');
    expect(companyNameKey('A&B')).toBe('a and b');
  });
});

describe('person round trip', () => {
  const contact = {
    id: 'z1',
    First_Name: 'Layla',
    Last_Name: 'Haddad',
    Email: 'Layla.Haddad@AcmeTel.example',
    Secondary_Email: 'layla@example.com',
    Phone: '+971 50 123 4567',
    Mobile: '050 111 2222',
    Title: ' Head of Portfolio ',
    Mailing_Country: 'United Arab Emirates',
    Account_Name: { id: 'a1', name: 'Acme & Telecom' },
  };

  it('gives the same fingerprint read from Zoho and read back from Twenty', () => {
    const fromZoho = personValuesFromZoho(contact, null);
    const data = personDataForTwenty(fromZoho, null) as Partial<TwentyPerson>;
    const storedInTwenty: TwentyPerson = {
      id: 't1',
      ...data,
      company: { id: 'c1', zohoAccountId: 'a1' },
    };

    expect(personFingerprint(personValuesFromTwenty(storedInTwenty))).toBe(
      personFingerprint(fromZoho),
    );
  });

  it('keeps the Twenty-only emails and phones when Zoho values are applied', () => {
    const existing: TwentyPerson = {
      id: 't1',
      emails: {
        primaryEmail: 'old@x.com',
        additionalEmails: ['old2@x.com', 'keep@x.com'],
      },
      phones: {
        primaryPhoneNumber: '',
        primaryPhoneCallingCode: '',
        primaryPhoneCountryCode: '',
        additionalPhones: [
          {
            number: '501234567',
            callingCode: '+971',
            countryCode: 'AE',
          },
          {
            number: '509999999',
            callingCode: '+971',
            countryCode: 'AE',
          },
        ],
      },
    };
    const data = personDataForTwenty(
      personValuesFromZoho(contact, null),
      existing,
    ) as any;

    expect(data.emails).toEqual({
      primaryEmail: 'layla.haddad@acmetel.example',
      additionalEmails: ['layla@example.com', 'keep@x.com'],
    });
    expect(
      data.phones.additionalPhones.map((phone: any) => phone.number),
    ).toEqual(['501112222', '509999999']);
  });

  it('treats a one-word name the same whichever side holds it', () => {
    const fromTwenty = personValuesFromTwenty({
      id: 't',
      name: { firstName: 'Ahmed', lastName: '' },
    });
    const changes = zohoContactChanges(fromTwenty, null);

    expect(changes).toMatchObject({ First_Name: null, Last_Name: 'Ahmed' });

    const backFromZoho = personValuesFromZoho(
      { id: 'z', First_Name: null, Last_Name: 'Ahmed' },
      null,
    );

    expect(personFingerprint(backFromZoho)).toBe(personFingerprint(fromTwenty));
  });
});

describe('zohoContactChanges', () => {
  it('sends only the values that differ', () => {
    const current = personValuesFromZoho(
      {
        id: 'z',
        First_Name: 'Rana',
        Last_Name: 'Khalil',
        Email: 'rana@pharmaco.example',
        Phone: 'ext. 42',
      },
      'AE',
    );
    const values = { ...current, jobTitle: 'Digital Manager' };

    // The unreadable phone in Zoho reads as empty on both sides: it is kept.
    expect(zohoContactChanges(values, current)).toEqual({
      Title: 'Digital Manager',
    });
  });

  it('sends every value that is set for a new contact', () => {
    const values = personValuesFromTwenty({
      id: 't',
      name: { firstName: 'Rana', lastName: 'Khalil' },
      emails: {
        primaryEmail: 'rana@pharmaco.example',
        additionalEmails: [],
      },
      company: { id: 'c', zohoAccountId: 'a9' },
    });

    expect(zohoContactChanges(values, null)).toEqual({
      First_Name: 'Rana',
      Last_Name: 'Khalil',
      Email: 'rana@pharmaco.example',
      Account_Name: { id: 'a9' },
    });
  });
});

describe('mergePersonValues', () => {
  it('keeps Twenty values and fills the gaps from Zoho', () => {
    const twenty = personValuesFromTwenty({
      id: 't',
      name: { firstName: 'Karim', lastName: 'Ahmed' },
      emails: { primaryEmail: '', additionalEmails: [] },
      jobTitle: 'CHRO',
    });
    const zoho = personValuesFromZoho(
      {
        id: 'z',
        First_Name: 'Karim',
        Last_Name: 'Ahmed Ali',
        Email: 'karim@x.example',
        Title: 'HR Director',
      },
      null,
    );

    expect(mergePersonValues(twenty, zoho)).toMatchObject({
      firstName: 'Karim',
      lastName: 'Ahmed',
      primaryEmail: 'karim@x.example',
      jobTitle: 'CHRO',
    });
  });
});

describe('company round trip', () => {
  it('gives the same fingerprint read from Zoho and read back from Twenty', () => {
    const account = {
      id: 'a1',
      Account_Name: 'Gulf Energy Oman',
      Website: 'www.gulfenergy.example',
      Billing_City: 'Muscat',
      Billing_Country: 'Oman',
    };
    const fromZoho = companyValuesFromZoho(account);
    const data = companyDataForTwenty(fromZoho, null) as any;
    // Twenty stores domains without protocol or www.
    const stored = {
      id: 'c1',
      ...data,
      domainName: {
        ...data.domainName,
        primaryLinkUrl: websiteHost(data.domainName.primaryLinkUrl),
      },
    };

    expect(companyFingerprint(companyValuesFromTwenty(stored))).toBe(
      companyFingerprint(fromZoho),
    );
  });
});
