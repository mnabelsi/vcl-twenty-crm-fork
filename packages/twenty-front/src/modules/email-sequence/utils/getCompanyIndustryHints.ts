import { isNonEmptyString, isString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

import { type ObjectRecord } from '@/object-record/types/ObjectRecord';

const INDUSTRY_FIELD_NAME_PATTERN = /industry|sector|segment|vertical/i;

// Industry-like fields come first, then the company name ("Saudi Telecom" hints at telecom)
export const getCompanyIndustryHints = (
  company: (ObjectRecord & { name?: string | null }) | null | undefined,
): string[] => {
  if (!isDefined(company)) {
    return [];
  }

  const industryFieldValues = Object.entries(company)
    .filter(([fieldName]) => INDUSTRY_FIELD_NAME_PATTERN.test(fieldName))
    .flatMap(([, value]) =>
      Array.isArray(value) ? value.filter(isString) : [value],
    )
    .filter(isNonEmptyString);

  return [...industryFieldValues, company.name].filter(isNonEmptyString);
};
