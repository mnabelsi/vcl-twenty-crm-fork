import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { COMPANY_ZOHO_SYNC_HASH_FIELD_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: COMPANY_ZOHO_SYNC_HASH_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company.universalIdentifier,
  name: 'zohoSyncHash',
  type: FieldType.TEXT,
  label: 'Zoho sync fingerprint',
  description:
    'Fingerprint of the synced values at the last sync; used to detect changes. Do not edit',
  icon: 'IconFingerprint',
  isUIEditable: false,
  isAuditLogged: false,
});
