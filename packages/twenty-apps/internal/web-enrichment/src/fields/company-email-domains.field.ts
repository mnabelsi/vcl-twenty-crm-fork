import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { COMPANY_EMAIL_DOMAINS_FIELD_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: COMPANY_EMAIL_DOMAINS_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company.universalIdentifier,
  type: FieldType.ARRAY,
  name: 'emailDomains',
  label: 'Email domains',
  description:
    'Domains this company writes from, learned from its website and the work emails of its people. Several companies can share one (a group and its branches). Add any the app missed.',
  icon: 'IconAt',
  isNullable: true,
});
