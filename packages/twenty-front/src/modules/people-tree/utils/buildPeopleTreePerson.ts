import { isNonEmptyString, isString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

import { PEOPLE_TREE_COMPANY_FIELD_KEY_PREFIX } from '@/people-tree/constants/PeopleTreeCompanyFieldKeyPrefix';
import { PEOPLE_TREE_DIMENSION_KEYS } from '@/people-tree/constants/PeopleTreeDimensionKeys';
import { PEOPLE_TREE_PERSON_FIELD_KEY_PREFIX } from '@/people-tree/constants/PeopleTreePersonFieldKeyPrefix';
import { PEOPLE_TREE_CITY_ALIASES } from '@/people-tree/constants/PeopleTreeCityAliases';
import { PEOPLE_TREE_COUNTRY_ALIASES } from '@/people-tree/constants/PeopleTreeCountryAliases';
import { type PeopleTreePerson } from '@/people-tree/types/PeopleTreePerson';
import { classifyJobTitle } from '@/people-tree/utils/classifyJobTitle';
import { normalizePlaceName } from '@/people-tree/utils/normalizePlaceName';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';

type BuildPeopleTreePersonArgs = {
  record: ObjectRecord;
  personOptionFieldNames: string[];
  companyOptionFieldNames: string[];
};

const toOptionValues = (fieldValue: unknown): string[] => {
  if (Array.isArray(fieldValue)) {
    return fieldValue.filter(isNonEmptyString);
  }

  return isNonEmptyString(fieldValue) ? [fieldValue] : [];
};

const toSingleValue = (value: string | null) =>
  isDefined(value) ? [value] : [];

export const buildPeopleTreePerson = ({
  record,
  personOptionFieldNames,
  companyOptionFieldNames,
}: BuildPeopleTreePersonArgs): PeopleTreePerson => {
  const company: ObjectRecord | null = record.company ?? null;
  const companyId: string | null = company?.id ?? record.companyId ?? null;
  const companyName = isNonEmptyString(company?.name)
    ? company.name.trim()
    : null;

  const firstName = isString(record.name?.firstName)
    ? record.name.firstName
    : '';
  const lastName = isString(record.name?.lastName) ? record.name.lastName : '';
  const name = `${firstName} ${lastName}`.trim();
  const jobTitle = isString(record.jobTitle) ? record.jobTitle.trim() : '';

  const city = normalizePlaceName(
    company?.address?.addressCity,
    PEOPLE_TREE_CITY_ALIASES,
  );
  const country = normalizePlaceName(
    company?.address?.addressCountry,
    PEOPLE_TREE_COUNTRY_ALIASES,
  );
  const positionClass = classifyJobTitle(jobTitle);

  const valuesByDimensionKey: Record<string, string[]> = {
    [PEOPLE_TREE_DIMENSION_KEYS.city]: toSingleValue(city),
    [PEOPLE_TREE_DIMENSION_KEYS.country]: toSingleValue(country),
    [PEOPLE_TREE_DIMENSION_KEYS.company]: toSingleValue(companyId),
    [PEOPLE_TREE_DIMENSION_KEYS.positionClass]: [positionClass],
    [PEOPLE_TREE_DIMENSION_KEYS.jobTitle]: isNonEmptyString(jobTitle)
      ? [jobTitle]
      : [],
  };

  for (const fieldName of personOptionFieldNames) {
    valuesByDimensionKey[`${PEOPLE_TREE_PERSON_FIELD_KEY_PREFIX}${fieldName}`] =
      toOptionValues(record[fieldName]);
  }

  for (const fieldName of companyOptionFieldNames) {
    valuesByDimensionKey[
      `${PEOPLE_TREE_COMPANY_FIELD_KEY_PREFIX}${fieldName}`
    ] = toOptionValues(company?.[fieldName]);
  }

  return {
    id: record.id,
    name,
    jobTitle,
    companyId,
    companyName,
    positionClass,
    valuesByDimensionKey,
    searchText: [name, jobTitle, companyName, city, country]
      .filter(isNonEmptyString)
      .join(' ')
      .toLowerCase(),
  };
};
