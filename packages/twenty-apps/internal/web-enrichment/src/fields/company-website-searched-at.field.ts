import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { COMPANY_WEBSITE_SEARCHED_AT_FIELD_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: COMPANY_WEBSITE_SEARCHED_AT_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company.universalIdentifier,
  type: FieldType.DATE_TIME,
  name: 'websiteSearchedAt',
  label: 'Website searched at',
  description: 'When the Web Enrichment app looked for the website',
  icon: 'IconClock',
  isNullable: true,
  isUIEditable: false,
  isAuditLogged: false,
});
