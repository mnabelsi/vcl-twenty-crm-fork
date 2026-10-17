import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { PERSON_LINKEDIN_SEARCHED_AT_FIELD_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: PERSON_LINKEDIN_SEARCHED_AT_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.DATE_TIME,
  name: 'linkedinSearchedAt',
  label: 'LinkedIn searched at',
  description: 'When the Web Enrichment app looked for the LinkedIn profile',
  icon: 'IconClock',
  isNullable: true,
  isUIEditable: false,
  isAuditLogged: false,
});
