import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { COMPANY_ZOHO_FIELD_STATE_FIELD_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: COMPANY_ZOHO_FIELD_STATE_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company.universalIdentifier,
  name: 'zohoFieldState',
  type: FieldType.TEXT,
  label: 'Zoho field state',
  description:
    'State of each Zoho field at the last sync, used to tell which side changed. Do not edit',
  icon: 'IconFingerprint',
  isUIEditable: false,
  isAuditLogged: false,
});
