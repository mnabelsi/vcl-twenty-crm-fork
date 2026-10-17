import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { PERSON_LINKEDIN_SUGGESTION_FIELD_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: PERSON_LINKEDIN_SUGGESTION_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.LINKS,
  name: 'linkedinSuggestion',
  label: 'LinkedIn suggestion',
  description:
    'Likely LinkedIn profile the app was not sure enough to fill in: copy it into Linkedin if it is right',
  icon: 'IconBrandLinkedin',
  isNullable: true,
});
