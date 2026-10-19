import {
  cleanEmail,
  cleanText,
  fingerprint,
  parsePhone,
  phoneFromTwenty,
  phoneToE164,
  phoneToZoho,
  type PhoneValue,
  websiteHost,
} from 'src/sync/normalize';

// ---------------------------------------------------------------------------
// Record shapes, as read from each side
// ---------------------------------------------------------------------------

export type ZohoLookup = {
  id: string;
  name?: string | null;
  email?: string | null;
};

export type ZohoContact = {
  id: string;
  First_Name?: string | null;
  Last_Name?: string | null;
  Email?: string | null;
  Secondary_Email?: string | null;
  Phone?: string | null;
  Mobile?: string | null;
  Title?: string | null;
  Mailing_Country?: string | null;
  Account_Name?: ZohoLookup | null;
  Modified_Time?: string | null;
  // The mirrored fields, read by name.
  [field: string]: unknown;
};

export type ZohoAccount = {
  id: string;
  Account_Name?: string | null;
  Website?: string | null;
  Billing_Street?: string | null;
  Billing_City?: string | null;
  Billing_State?: string | null;
  Billing_Code?: string | null;
  Billing_Country?: string | null;
  Industry?: string | null;
  Owner?: ZohoLookup | null;
  Modified_Time?: string | null;
  [field: string]: unknown;
};

export type ZohoDeal = {
  id: string;
  Account_Name?: ZohoLookup | null;
  Contact_Name?: ZohoLookup | null;
  Owner?: ZohoLookup | null;
  Currency?: string | null;
  Modified_Time?: string | null;
  [field: string]: unknown;
};

export const ZOHO_CONTACT_FIELDS = [
  'First_Name',
  'Last_Name',
  'Email',
  'Secondary_Email',
  'Phone',
  'Mobile',
  'Title',
  'Mailing_Country',
  'Account_Name',
  'Modified_Time',
];

// Deal_Name, Amount, Closing_Date and Stage come through the field map.
export const ZOHO_DEAL_FIELDS = [
  'Account_Name',
  'Contact_Name',
  'Owner',
  'Currency',
  'Modified_Time',
];

export const ZOHO_ACCOUNT_FIELDS = [
  'Account_Name',
  'Website',
  'Billing_Street',
  'Billing_City',
  'Billing_State',
  'Billing_Code',
  'Billing_Country',
  'Industry',
  'Owner',
  'Modified_Time',
];

type TwentyAdditionalPhone = {
  number?: string | null;
  callingCode?: string | null;
  countryCode?: string | null;
};

export type TwentyPerson = {
  id: string;
  name?: { firstName?: string | null; lastName?: string | null } | null;
  emails?: {
    primaryEmail?: string | null;
    additionalEmails?: string[] | null;
  } | null;
  phones?: {
    primaryPhoneNumber?: string | null;
    primaryPhoneCallingCode?: string | null;
    primaryPhoneCountryCode?: string | null;
    additionalPhones?: TwentyAdditionalPhone[] | null;
  } | null;
  jobTitle?: string | null;
  companyId?: string | null;
  company?: { id: string; zohoAccountId?: string | null } | null;
  zohoContactId?: string | null;
  zohoSyncHash?: string | null;
  zohoFieldState?: string | null;
  zohoSyncedAt?: string | null;
  createdBy?: { source?: string | null } | null;
  updatedAt?: string | null;
  deletedAt?: string | null;
};

export type TwentyCompany = {
  id: string;
  name?: string | null;
  domainName?: {
    primaryLinkUrl?: string | null;
    primaryLinkLabel?: string | null;
    secondaryLinks?: unknown;
  } | null;
  address?: {
    addressStreet1?: string | null;
    addressStreet2?: string | null;
    addressCity?: string | null;
    addressState?: string | null;
    addressPostcode?: string | null;
    addressCountry?: string | null;
  } | null;
  accountOwnerId?: string | null;
  industry?: string | null;
  zohoAccountId?: string | null;
  zohoSyncHash?: string | null;
  zohoFieldState?: string | null;
  zohoSyncedAt?: string | null;
  createdBy?: { source?: string | null } | null;
  updatedAt?: string | null;
  deletedAt?: string | null;
};

export type TwentyOpportunity = {
  id: string;
  name?: string | null;
  amount?: { amountMicros?: number | string | null; currencyCode?: string | null } | null;
  closeDate?: string | null;
  stage?: string | null;
  companyId?: string | null;
  company?: { id: string; zohoAccountId?: string | null } | null;
  pointOfContactId?: string | null;
  pointOfContact?: { id: string; zohoContactId?: string | null } | null;
  ownerId?: string | null;
  zohoDealId?: string | null;
  zohoFieldState?: string | null;
  zohoSyncedAt?: string | null;
  createdBy?: { source?: string | null } | null;
  updatedAt?: string | null;
  deletedAt?: string | null;
};

// Twenty creates people and companies on its own for every email and
// meeting participant. Those stay out of Zoho until someone links them.
export const isAutoCreated = (record: {
  createdBy?: { source?: string | null } | null;
}): boolean =>
  record.createdBy?.source === 'EMAIL' ||
  record.createdBy?.source === 'CALENDAR';

// ---------------------------------------------------------------------------
// The synced values: the part of a record both sides hold. A record is in step
// when the fingerprint of these values matches the one stored after the last
// sync, whichever side they were read from.
// ---------------------------------------------------------------------------

export type PersonValues = {
  firstName: string;
  lastName: string;
  primaryEmail: string;
  secondaryEmail: string;
  phone: PhoneValue | null;
  mobile: PhoneValue | null;
  jobTitle: string;
  zohoAccountId: string;
};

export type CompanyValues = {
  name: string;
  website: string;
  street: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
};

// Zoho keeps a one-word name in Last_Name and Twenty may hold it in
// firstName, so names are compared whole.
const fullName = (values: PersonValues): string =>
  cleanText(`${values.firstName} ${values.lastName}`);

const samePhone = (a: PhoneValue | null, b: PhoneValue | null) =>
  phoneToE164(a) === phoneToE164(b);

export const personFingerprint = (values: PersonValues): string =>
  fingerprint({
    fullName: fullName(values),
    primaryEmail: values.primaryEmail,
    secondaryEmail: values.secondaryEmail,
    phone: phoneToE164(values.phone),
    mobile: phoneToE164(values.mobile),
    jobTitle: values.jobTitle,
    zohoAccountId: values.zohoAccountId,
  });

export const companyFingerprint = (values: CompanyValues): string =>
  fingerprint({
    name: values.name,
    website: websiteHost(values.website),
    street: values.street,
    city: values.city,
    state: values.state,
    postcode: values.postcode,
    country: values.country,
  });

const countryForPhones = (
  contact: ZohoContact,
  fallbackCountry: string | null,
): string | null =>
  COUNTRY_NAME_TO_CODE[cleanText(contact.Mailing_Country).toLowerCase()] ??
  fallbackCountry;

export const personValuesFromZoho = (
  contact: ZohoContact,
  fallbackCountry: string | null,
): PersonValues => {
  const phoneCountry = countryForPhones(contact, fallbackCountry);
  const primaryEmail = cleanEmail(contact.Email);
  const secondaryEmail = cleanEmail(contact.Secondary_Email);

  return {
    firstName: cleanText(contact.First_Name),
    lastName: cleanText(contact.Last_Name),
    primaryEmail,
    secondaryEmail: secondaryEmail === primaryEmail ? '' : secondaryEmail,
    phone: parsePhone(contact.Phone, phoneCountry),
    mobile: parsePhone(contact.Mobile, phoneCountry),
    jobTitle: cleanText(contact.Title),
    zohoAccountId: cleanText(contact.Account_Name?.id),
  };
};

export const personValuesFromTwenty = (person: TwentyPerson): PersonValues => {
  const additionalPhone = person.phones?.additionalPhones?.[0];
  const primaryEmail = cleanEmail(person.emails?.primaryEmail);
  const secondaryEmail = cleanEmail(person.emails?.additionalEmails?.[0]);

  return {
    firstName: cleanText(person.name?.firstName),
    lastName: cleanText(person.name?.lastName),
    primaryEmail,
    secondaryEmail: secondaryEmail === primaryEmail ? '' : secondaryEmail,
    phone: phoneFromTwenty(
      person.phones?.primaryPhoneNumber,
      person.phones?.primaryPhoneCallingCode,
      person.phones?.primaryPhoneCountryCode,
    ),
    mobile: additionalPhone
      ? phoneFromTwenty(
          additionalPhone.number,
          additionalPhone.callingCode,
          additionalPhone.countryCode,
        )
      : null,
    jobTitle: cleanText(person.jobTitle),
    zohoAccountId: cleanText(person.company?.zohoAccountId),
  };
};

export const companyValuesFromZoho = (account: ZohoAccount): CompanyValues => ({
  name: cleanText(account.Account_Name),
  website: cleanText(account.Website),
  street: cleanText(account.Billing_Street),
  city: cleanText(account.Billing_City),
  state: cleanText(account.Billing_State),
  postcode: cleanText(account.Billing_Code),
  country: cleanText(account.Billing_Country),
});

export const companyValuesFromTwenty = (
  company: TwentyCompany,
): CompanyValues => ({
  name: cleanText(company.name),
  website: cleanText(company.domainName?.primaryLinkUrl),
  street: cleanText(company.address?.addressStreet1),
  city: cleanText(company.address?.addressCity),
  state: cleanText(company.address?.addressState),
  postcode: cleanText(company.address?.addressPostcode),
  country: cleanText(company.address?.addressCountry),
});

// The first time a Zoho record meets an existing Twenty record, nothing is
// thrown away: Twenty keeps every value it has and only fills its gaps from
// Zoho. Twenty's values then go back to Zoho on the next push, and Zoho
// emails and phones that lost their place are kept on Twenty as extras.
export const mergePersonValues = (
  twenty: PersonValues,
  zoho: PersonValues,
): PersonValues => {
  const primaryEmail = twenty.primaryEmail || zoho.primaryEmail;
  const secondaryEmail =
    [twenty.secondaryEmail, zoho.secondaryEmail, zoho.primaryEmail].find(
      (email) => email !== '' && email !== primaryEmail,
    ) ?? '';

  return {
    firstName:
      twenty.firstName || twenty.lastName ? twenty.firstName : zoho.firstName,
    lastName:
      twenty.firstName || twenty.lastName ? twenty.lastName : zoho.lastName,
    primaryEmail,
    secondaryEmail,
    phone: twenty.phone ?? zoho.phone,
    mobile: twenty.mobile ?? zoho.mobile,
    jobTitle: twenty.jobTitle || zoho.jobTitle,
    zohoAccountId: twenty.zohoAccountId || zoho.zohoAccountId,
  };
};

export const leftoverZohoEmails = (
  merged: PersonValues,
  zoho: PersonValues,
): string[] =>
  [zoho.primaryEmail, zoho.secondaryEmail].filter(
    (email) =>
      email !== '' &&
      email !== merged.primaryEmail &&
      email !== merged.secondaryEmail,
  );

export const leftoverZohoPhones = (
  merged: PersonValues,
  zoho: PersonValues,
): PhoneValue[] =>
  [zoho.phone, zoho.mobile].filter(
    (phone): phone is PhoneValue =>
      phone !== null &&
      !samePhone(phone, merged.phone) &&
      !samePhone(phone, merged.mobile),
  );

export const mergeCompanyValues = (
  twenty: CompanyValues,
  zoho: CompanyValues,
): CompanyValues => {
  // An address is taken whole from one side, never mixed line by line.
  const twentyHasAddress = [
    twenty.street,
    twenty.city,
    twenty.state,
    twenty.postcode,
    twenty.country,
  ].some((part) => part !== '');
  const address = twentyHasAddress ? twenty : zoho;

  return {
    name: twenty.name || zoho.name,
    website: twenty.website || zoho.website,
    street: address.street,
    city: address.city,
    state: address.state,
    postcode: address.postcode,
    country: address.country,
  };
};

// ---------------------------------------------------------------------------
// Writing to Twenty. Only the synced values change; everything else on the
// record (further emails and phones, tags, custom fields) is kept.
// ---------------------------------------------------------------------------

export const personDataForTwenty = (
  values: PersonValues,
  existing: TwentyPerson | null,
  extras: { emails?: string[]; phones?: PhoneValue[] } = {},
): Record<string, unknown> => {
  const previous = existing ? personValuesFromTwenty(existing) : null;

  const existingAdditionalEmails = (existing?.emails?.additionalEmails ?? [])
    .map(cleanEmail)
    .filter((email) => email !== '');
  const otherEmails = [
    ...(previous?.secondaryEmail
      ? existingAdditionalEmails.slice(1)
      : existingAdditionalEmails),
    ...(extras.emails ?? []),
  ].filter(
    (email, index, all) =>
      email !== values.primaryEmail &&
      email !== values.secondaryEmail &&
      all.indexOf(email) === index,
  );

  const existingAdditionalPhones = (existing?.phones?.additionalPhones ?? [])
    .map((phone) =>
      phoneFromTwenty(phone.number, phone.callingCode, phone.countryCode),
    )
    .filter((phone): phone is PhoneValue => phone !== null);
  const otherPhones = [
    ...(previous?.mobile
      ? existingAdditionalPhones.slice(1)
      : existingAdditionalPhones),
    ...(extras.phones ?? []),
  ].filter(
    (phone, index, all) =>
      !samePhone(phone, values.phone) &&
      !samePhone(phone, values.mobile) &&
      all.findIndex((other) => samePhone(other, phone)) === index,
  );

  return {
    name: { firstName: values.firstName, lastName: values.lastName },
    emails: {
      primaryEmail: values.primaryEmail,
      additionalEmails: [
        ...(values.secondaryEmail ? [values.secondaryEmail] : []),
        ...otherEmails,
      ],
    },
    phones: {
      primaryPhoneNumber: values.phone?.number ?? '',
      primaryPhoneCallingCode: values.phone?.callingCode ?? '',
      primaryPhoneCountryCode: values.phone?.countryCode ?? '',
      additionalPhones: [
        ...(values.mobile ? [values.mobile] : []),
        ...otherPhones,
      ].map((phone) => ({
        number: phone.number,
        callingCode: phone.callingCode,
        countryCode: phone.countryCode,
      })),
    },
    jobTitle: values.jobTitle,
  };
};

export const companyDataForTwenty = (
  values: CompanyValues,
  existing: TwentyCompany | null,
): Record<string, unknown> => {
  const currentUrl = cleanText(existing?.domainName?.primaryLinkUrl);
  // A Zoho account without a website leaves a website found in Twenty alone.
  const keepUrl =
    currentUrl !== '' &&
    (values.website === '' ||
      websiteHost(currentUrl) === websiteHost(values.website));

  return {
    name: values.name,
    domainName: {
      primaryLinkUrl: keepUrl ? currentUrl : websiteUrl(values.website),
      primaryLinkLabel: existing?.domainName?.primaryLinkLabel ?? '',
    },
    address: {
      addressStreet1: values.street,
      addressStreet2: existing?.address?.addressStreet2 ?? '',
      addressCity: values.city,
      addressState: values.state,
      addressPostcode: values.postcode,
      addressCountry: values.country,
    },
  };
};

const websiteUrl = (website: string): string => {
  if (website === '') {
    return '';
  }

  return /^[a-z][a-z0-9+.-]*:\/\//i.test(website)
    ? website
    : `https://${website}`;
};

// ---------------------------------------------------------------------------
// Writing to Zoho
// ---------------------------------------------------------------------------

// Only the values that differ from what Zoho holds are sent, so a value
// Zoho keeps but this app cannot read (a phone number in an unknown format)
// is never overwritten with an empty one. Without a Zoho record every value
// that is set is sent.
export const zohoContactChanges = (
  values: PersonValues,
  current: PersonValues | null,
): Record<string, unknown> => {
  const changes: Record<string, unknown> = {};

  if (!current || fullName(values) !== fullName(current)) {
    // Zoho requires a last name; a person known by one name keeps it there.
    changes.First_Name = values.lastName ? values.firstName || null : null;
    changes.Last_Name = values.lastName || values.firstName;
  }
  if (values.primaryEmail !== (current?.primaryEmail ?? '')) {
    changes.Email = values.primaryEmail || null;
  }
  if (values.secondaryEmail !== (current?.secondaryEmail ?? '')) {
    changes.Secondary_Email = values.secondaryEmail || null;
  }
  if (!samePhone(values.phone, current?.phone ?? null)) {
    changes.Phone = phoneToZoho(values.phone);
  }
  if (!samePhone(values.mobile, current?.mobile ?? null)) {
    changes.Mobile = phoneToZoho(values.mobile);
  }
  if (values.jobTitle !== (current?.jobTitle ?? '')) {
    changes.Title = values.jobTitle || null;
  }
  if (values.zohoAccountId !== (current?.zohoAccountId ?? '')) {
    changes.Account_Name = values.zohoAccountId
      ? { id: values.zohoAccountId }
      : null;
  }

  return changes;
};

export const zohoAccountChanges = (
  values: CompanyValues,
  current: CompanyValues | null,
): Record<string, unknown> => {
  const changes: Record<string, unknown> = {};
  const fields: [keyof CompanyValues, string][] = [
    ['name', 'Account_Name'],
    ['street', 'Billing_Street'],
    ['city', 'Billing_City'],
    ['state', 'Billing_State'],
    ['postcode', 'Billing_Code'],
    ['country', 'Billing_Country'],
  ];

  for (const [key, zohoField] of fields) {
    if (values[key] !== (current?.[key] ?? '')) {
      changes[zohoField] = values[key] || null;
    }
  }
  if (websiteHost(values.website) !== websiteHost(current?.website ?? '')) {
    changes.Website = values.website || null;
  }

  return changes;
};

export const personIsPushable = (values: PersonValues): boolean =>
  values.lastName !== '' || values.firstName !== '';

export const companyIsPushable = (values: CompanyValues): boolean =>
  values.name !== '';

// Zoho's Mailing_Country is free text; the common spellings are enough to read
// local phone numbers correctly.
const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  'united arab emirates': 'AE',
  uae: 'AE',
  'u.a.e': 'AE',
  'u.a.e.': 'AE',
  'saudi arabia': 'SA',
  ksa: 'SA',
  'kingdom of saudi arabia': 'SA',
  qatar: 'QA',
  kuwait: 'KW',
  bahrain: 'BH',
  oman: 'OM',
  egypt: 'EG',
  jordan: 'JO',
  lebanon: 'LB',
  iraq: 'IQ',
  morocco: 'MA',
  algeria: 'DZ',
  tunisia: 'TN',
  turkey: 'TR',
  türkiye: 'TR',
  'united kingdom': 'GB',
  uk: 'GB',
  'united states': 'US',
  usa: 'US',
  'united states of america': 'US',
  india: 'IN',
  pakistan: 'PK',
  france: 'FR',
  germany: 'DE',
};
