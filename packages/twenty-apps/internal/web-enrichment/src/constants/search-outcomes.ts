export type WebsiteOutcome =
  'FROM_EMAILS' | 'FOUND' | 'REVIEW' | 'SHARED' | 'NOT_FOUND';

export type LinkedinOutcome =
  'FOUND' | 'REVIEW' | 'NOT_FOUND' | 'NOT_ENOUGH_INFO';

export type CompanyCheck =
  'LINKED' | 'CHOOSE' | 'NO_COMPANY_FOR_DOMAIN' | 'OTHER_COMPANY' | 'CHECKED';
