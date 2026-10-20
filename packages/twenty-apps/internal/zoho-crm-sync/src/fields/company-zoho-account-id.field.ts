import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { COMPANY_ZOHO_ACCOUNT_ID_FIELD_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: COMPANY_ZOHO_ACCOUNT_ID_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company.universalIdentifier,
  name: 'zohoAccountId',
  type: FieldType.TEXT,
  label: 'Zoho account ID',
  description:
    'Id of the matching Account in Zoho CRM, set by the Zoho CRM Sync app',
  icon: 'IconLink',
  isUIEditable: false,
});
