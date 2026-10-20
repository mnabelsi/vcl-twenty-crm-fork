import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { COMPANY_ZOHO_SYNCED_AT_FIELD_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: COMPANY_ZOHO_SYNCED_AT_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company.universalIdentifier,
  name: 'zohoSyncedAt',
  type: FieldType.DATE_TIME,
  label: 'Zoho synced at',
  description: 'When this company was last brought in step with Zoho CRM',
  icon: 'IconRefresh',
  isUIEditable: false,
  isAuditLogged: false,
});
