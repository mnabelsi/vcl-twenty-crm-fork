import {
  defineView,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
  ViewFilterOperand,
  ViewType,
} from 'twenty-sdk/define';

import {
  COMPANIES_TO_CHECK_VIEW_UNIVERSAL_IDENTIFIER,
  PERSON_COMPANY_CHECK_FIELD_UNIVERSAL_IDENTIFIER,
  PERSON_SUGGESTED_COMPANY_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

const personFields = STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.fields;

export default defineView({
  universalIdentifier: COMPANIES_TO_CHECK_VIEW_UNIVERSAL_IDENTIFIER,
  name: 'Companies to check',
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: ViewType.TABLE,
  icon: 'IconBuildingCommunity',
  fields: [
    {
      universalIdentifier: '30ecec38-540c-4b4c-8d8b-54c36b860112',
      fieldMetadataUniversalIdentifier: personFields.name.universalIdentifier,
      position: 0,
      isVisible: true,
      size: 200,
    },
    {
      universalIdentifier: '56e9e589-f3b6-4e28-8585-767e868ba80f',
      fieldMetadataUniversalIdentifier: personFields.emails.universalIdentifier,
      position: 1,
      isVisible: true,
      size: 230,
    },
    {
      universalIdentifier: 'e617ecc5-5e01-495b-9252-a4510cd48424',
      fieldMetadataUniversalIdentifier:
        personFields.company.universalIdentifier,
      position: 2,
      isVisible: true,
      size: 200,
    },
    {
      universalIdentifier: '7a4f29bf-8e58-4625-8b6c-0211190ad58c',
      fieldMetadataUniversalIdentifier:
        PERSON_SUGGESTED_COMPANY_FIELD_UNIVERSAL_IDENTIFIER,
      position: 3,
      isVisible: true,
      size: 200,
    },
    {
      universalIdentifier: '1d392d9f-1417-4610-8d5d-26f46e50721a',
      fieldMetadataUniversalIdentifier:
        PERSON_COMPANY_CHECK_FIELD_UNIVERSAL_IDENTIFIER,
      position: 4,
      isVisible: true,
      size: 190,
    },
    {
      universalIdentifier: '462c373f-0838-4628-9df9-071cd067b79a',
      fieldMetadataUniversalIdentifier:
        personFields.jobTitle.universalIdentifier,
      position: 5,
      isVisible: true,
      size: 180,
    },
  ],
  filters: [
    {
      universalIdentifier: '4e50e4fc-3370-4e7f-b234-c0cf4465d70d',
      fieldMetadataUniversalIdentifier:
        PERSON_COMPANY_CHECK_FIELD_UNIVERSAL_IDENTIFIER,
      operand: ViewFilterOperand.IS,
      value: ['CHOOSE', 'NO_COMPANY_FOR_DOMAIN', 'OTHER_COMPANY'],
    },
  ],
});
