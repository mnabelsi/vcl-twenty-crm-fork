import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { PERSON_ZOHO_SYNCED_AT_FIELD_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: PERSON_ZOHO_SYNCED_AT_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  name: 'zohoSyncedAt',
  type: FieldType.DATE_TIME,
  label: 'Zoho synced at',
  description: 'When this person was last brought in step with Zoho CRM',
  icon: 'IconRefresh',
  isUIEditable: false,
  isAuditLogged: false,
});
