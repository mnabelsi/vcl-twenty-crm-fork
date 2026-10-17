import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { COMPANY_WEBSITE_SUGGESTION_FIELD_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: COMPANY_WEBSITE_SUGGESTION_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company.universalIdentifier,
  type: FieldType.LINKS,
  name: 'websiteSuggestion',
  label: 'Website suggestion',
  description:
    'Likely website the app was not sure enough to fill in: copy it into Domain if it is right',
  icon: 'IconWorldQuestion',
  isNullable: true,
});
