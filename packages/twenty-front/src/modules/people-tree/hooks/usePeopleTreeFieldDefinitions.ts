import { useMemo } from 'react';
import {
  CoreObjectNameSingular,
  FieldMetadataType,
  type RecordGqlFields,
} from 'twenty-shared/types';

import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';

const isPeopleTreeOptionField = (field: FieldMetadataItem) =>
  field.isActive === true &&
  field.isSystem !== true &&
  (field.type === FieldMetadataType.SELECT ||
    field.type === FieldMetadataType.MULTI_SELECT);

const byLabel = (fieldA: FieldMetadataItem, fieldB: FieldMetadataItem) =>
  fieldA.label.localeCompare(fieldB.label);

export const usePeopleTreeFieldDefinitions = () => {
  const { objectMetadataItem: personObjectMetadataItem } =
    useObjectMetadataItem({
      objectNameSingular: CoreObjectNameSingular.Person,
    });
  const { objectMetadataItem: companyObjectMetadataItem } =
    useObjectMetadataItem({
      objectNameSingular: CoreObjectNameSingular.Company,
    });

  return useMemo(() => {
    const personOptionFields = personObjectMetadataItem.fields
      .filter(isPeopleTreeOptionField)
      .sort(byLabel);
    const companyOptionFields = companyObjectMetadataItem.fields
      .filter(isPeopleTreeOptionField)
      .sort(byLabel);

    const recordGqlFields: RecordGqlFields = {
      id: true,
      name: true,
      jobTitle: true,
      companyId: true,
      company: {
        id: true,
        name: true,
        address: true,
        ...Object.fromEntries(
          companyOptionFields.map((field) => [field.name, true]),
        ),
      },
      ...Object.fromEntries(
        personOptionFields.map((field) => [field.name, true]),
      ),
    };

    return {
      personObjectNamePlural: personObjectMetadataItem.namePlural,
      personOptionFields,
      companyOptionFields,
      recordGqlFields,
    };
  }, [personObjectMetadataItem, companyObjectMetadataItem]);
};
