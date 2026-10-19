import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { OPPORTUNITY_ZOHO_DEAL_ID_FIELD_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: OPPORTUNITY_ZOHO_DEAL_ID_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.opportunity.universalIdentifier,
  name: 'zohoDealId',
  type: FieldType.TEXT,
  label: 'Zoho deal ID',
  description:
    'Id of the matching Deal in Zoho CRM, set by the Zoho CRM Sync app',
  icon: 'IconLink',
  isUIEditable: false,
});
