import {
  defineView,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
  ViewFilterOperand,
  ViewType,
} from 'twenty-sdk/define';

import {
  COMPANY_WEBSITE_SEARCH_FIELD_UNIVERSAL_IDENTIFIER,
  COMPANY_WEBSITE_SUGGESTION_FIELD_UNIVERSAL_IDENTIFIER,
  WEBSITES_TO_REVIEW_VIEW_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

const companyFields = STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company.fields;

export default defineView({
  universalIdentifier: WEBSITES_TO_REVIEW_VIEW_UNIVERSAL_IDENTIFIER,
  name: 'Websites to review',
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company.universalIdentifier,
  type: ViewType.TABLE,
  icon: 'IconWorldQuestion',
  fields: [
    {
      universalIdentifier: 'd90cda87-e626-4f0d-b6f8-807c42e2180b',
      fieldMetadataUniversalIdentifier: companyFields.name.universalIdentifier,
      position: 0,
      isVisible: true,
      size: 240,
    },
    {
      universalIdentifier: '6aacc6cb-7ad9-47a6-8630-883b87eff47e',
      fieldMetadataUniversalIdentifier:
        COMPANY_WEBSITE_SUGGESTION_FIELD_UNIVERSAL_IDENTIFIER,
      position: 1,
      isVisible: true,
      size: 220,
    },
    {
      universalIdentifier: '3c079d53-5013-40d0-bbf7-8ff493d0a7c1',
      fieldMetadataUniversalIdentifier:
        companyFields.domainName.universalIdentifier,
      position: 2,
      isVisible: true,
      size: 200,
    },
    {
      universalIdentifier: '53622e1a-0798-4ebf-b0cf-78e72d5df281',
      fieldMetadataUniversalIdentifier:
        companyFields.address.universalIdentifier,
      position: 3,
      isVisible: true,
      size: 200,
    },
    {
      universalIdentifier: '522dd827-7414-47a7-8609-0d4a5cdc92a1',
      fieldMetadataUniversalIdentifier:
        COMPANY_WEBSITE_SEARCH_FIELD_UNIVERSAL_IDENTIFIER,
      position: 4,
      isVisible: true,
      size: 150,
    },
  ],
  filters: [
    {
      universalIdentifier: '3b36ce35-18cc-465f-bc2c-b0c23dce98f3',
      fieldMetadataUniversalIdentifier:
        COMPANY_WEBSITE_SEARCH_FIELD_UNIVERSAL_IDENTIFIER,
      operand: ViewFilterOperand.IS,
      value: ['REVIEW'],
    },
  ],
});
