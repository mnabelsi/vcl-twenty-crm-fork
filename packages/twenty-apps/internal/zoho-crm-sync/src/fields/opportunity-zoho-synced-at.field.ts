import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { OPPORTUNITY_ZOHO_SYNCED_AT_FIELD_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: OPPORTUNITY_ZOHO_SYNCED_AT_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.opportunity.universalIdentifier,
  name: 'zohoSyncedAt',
  type: FieldType.DATE_TIME,
  label: 'Zoho synced at',
  description:
    'When this opportunity was last brought in step with Zoho CRM',
  icon: 'IconRefresh',
  isUIEditable: false,
  isAuditLogged: false,
});
