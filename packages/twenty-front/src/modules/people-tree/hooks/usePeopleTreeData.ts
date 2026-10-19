import { useLingui } from '@lingui/react/macro';
import { useMemo } from 'react';

import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { PEOPLE_TREE_COMPANY_FIELD_KEY_PREFIX } from '@/people-tree/constants/PeopleTreeCompanyFieldKeyPrefix';
import { PEOPLE_TREE_DIMENSION_KEYS } from '@/people-tree/constants/PeopleTreeDimensionKeys';
import { PEOPLE_TREE_PERSON_FIELD_KEY_PREFIX } from '@/people-tree/constants/PeopleTreePersonFieldKeyPrefix';
import { PEOPLE_TREE_POSITION_CLASSES } from '@/people-tree/constants/PeopleTreePositionClasses';
import { usePeopleTreeFieldDefinitions } from '@/people-tree/hooks/usePeopleTreeFieldDefinitions';
import { usePeopleTreeRecords } from '@/people-tree/hooks/usePeopleTreeRecords';
import { type PeopleTreeDimension } from '@/people-tree/types/PeopleTreeDimension';
import { type PeopleTreeDimensionOption } from '@/people-tree/types/PeopleTreeDimensionOption';
import { type PeopleTreePerson } from '@/people-tree/types/PeopleTreePerson';
import { buildPeopleTreePerson } from '@/people-tree/utils/buildPeopleTreePerson';

const collectDistinctOptions = (
  people: PeopleTreePerson[],
  dimensionKey: string,
  getLabel: (value: string, person: PeopleTreePerson) => string,
) => {
  const optionsByValue = new Map<string, PeopleTreeDimensionOption>();

  for (const person of people) {
    for (const value of person.valuesByDimensionKey[dimensionKey] ?? []) {
      if (!optionsByValue.has(value)) {
        optionsByValue.set(value, { value, label: getLabel(value, person) });
      }
    }
  }

  return [...optionsByValue.values()].sort((optionA, optionB) =>
    optionA.label.localeCompare(optionB.label),
  );
};

const toFieldOptions = (field: FieldMetadataItem) =>
  [...(field.options ?? [])]
    .sort((optionA, optionB) => optionA.position - optionB.position)
    .map((option) => ({
      value: option.value,
      label: option.label,
      color: option.color,
    }));

export const usePeopleTreeData = () => {
  const { t } = useLingui();
  const { personOptionFields, companyOptionFields } =
    usePeopleTreeFieldDefinitions();
  const { peopleTreeRecords, loadPeopleTreeRecords } = usePeopleTreeRecords();

  const people = useMemo(() => {
    const personOptionFieldNames = personOptionFields.map(
      (field) => field.name,
    );
    const companyOptionFieldNames = companyOptionFields.map(
      (field) => field.name,
    );

    return peopleTreeRecords.records.map((record) =>
      buildPeopleTreePerson({
        record,
        personOptionFieldNames,
        companyOptionFieldNames,
      }),
    );
  }, [peopleTreeRecords.records, personOptionFields, companyOptionFields]);

  const dimensions = useMemo<PeopleTreeDimension[]>(
    () => [
      {
        key: PEOPLE_TREE_DIMENSION_KEYS.city,
        label: t`City`,
        kind: 'option',
        isGroupable: true,
        emptyLabel: t`City not set`,
        hasFixedOptionOrder: false,
        options: collectDistinctOptions(
          people,
          PEOPLE_TREE_DIMENSION_KEYS.city,
          (value) => value,
        ),
      },
      {
        key: PEOPLE_TREE_DIMENSION_KEYS.country,
        label: t`Country`,
        kind: 'option',
        isGroupable: true,
        emptyLabel: t`Country not set`,
        hasFixedOptionOrder: false,
        options: collectDistinctOptions(
          people,
          PEOPLE_TREE_DIMENSION_KEYS.country,
          (value) => value,
        ),
      },
      {
        key: PEOPLE_TREE_DIMENSION_KEYS.company,
        label: t`Company`,
        kind: 'option',
        isGroupable: true,
        emptyLabel: t`No company`,
        hasFixedOptionOrder: false,
        options: collectDistinctOptions(
          people,
          PEOPLE_TREE_DIMENSION_KEYS.company,
          (_value, person) => person.companyName ?? t`Unnamed company`,
        ),
      },
      {
        key: PEOPLE_TREE_DIMENSION_KEYS.positionClass,
        label: t`Position class`,
        kind: 'option',
        isGroupable: true,
        emptyLabel: t`No title`,
        hasFixedOptionOrder: true,
        options: PEOPLE_TREE_POSITION_CLASSES,
      },
      {
        key: PEOPLE_TREE_DIMENSION_KEYS.jobTitle,
        label: t`Job title`,
        kind: 'text',
        isGroupable: false,
        emptyLabel: t`No job title`,
        hasFixedOptionOrder: false,
        options: [],
      },
      ...personOptionFields.map((field) => {
        const fieldLabel = field.label;

        return {
          key: `${PEOPLE_TREE_PERSON_FIELD_KEY_PREFIX}${field.name}`,
          label: fieldLabel,
          kind: 'option' as const,
          isGroupable: true,
          emptyLabel: t`No ${fieldLabel}`,
          hasFixedOptionOrder: true,
          options: toFieldOptions(field),
        };
      }),
      ...companyOptionFields.map((field) => {
        const fieldLabel = field.label;

        return {
          key: `${PEOPLE_TREE_COMPANY_FIELD_KEY_PREFIX}${field.name}`,
          label: t`Company ${fieldLabel}`,
          kind: 'option' as const,
          isGroupable: true,
          emptyLabel: t`No company ${fieldLabel}`,
          hasFixedOptionOrder: true,
          options: toFieldOptions(field),
        };
      }),
    ],
    [people, personOptionFields, companyOptionFields, t],
  );

  const dimensionsByKey = useMemo(
    () => new Map(dimensions.map((dimension) => [dimension.key, dimension])),
    [dimensions],
  );

  return {
    people,
    dimensions,
    dimensionsByKey,
    peopleTreeRecords,
    loadPeopleTreeRecords,
  };
};
