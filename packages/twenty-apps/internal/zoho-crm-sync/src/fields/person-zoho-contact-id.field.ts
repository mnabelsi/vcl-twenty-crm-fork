import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { PERSON_ZOHO_CONTACT_ID_FIELD_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: PERSON_ZOHO_CONTACT_ID_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  name: 'zohoContactId',
  type: FieldType.TEXT,
  label: 'Zoho contact ID',
  description:
    'Id of the matching Contact in Zoho CRM, set by the Zoho CRM Sync app',
  icon: 'IconLink',
  isUIEditable: false,
});
