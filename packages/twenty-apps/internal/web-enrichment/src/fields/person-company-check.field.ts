import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { PERSON_COMPANY_CHECK_FIELD_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: PERSON_COMPANY_CHECK_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.SELECT,
  name: 'companyCheck',
  label: 'Company check',
  description:
    'What the email domain says about the company of this person. Set it to Checked to keep the company as it is.',
  icon: 'IconBuildingCommunity',
  isNullable: true,
  options: [
    {
      id: '8aad6c48-aa0e-462e-b532-cdc52dcd3b13',
      value: 'LINKED',
      label: 'Linked by email domain',
      position: 0,
      color: 'green',
    },
    {
      id: '5ed50436-46b2-423a-a5a3-01863a0fedb7',
      value: 'CHOOSE',
      label: 'Several companies fit',
      position: 1,
      color: 'orange',
    },
    {
      id: '37d33ca1-50dc-46de-8294-bdb50d5bbe16',
      value: 'NO_COMPANY_FOR_DOMAIN',
      label: 'No company for this domain',
      position: 2,
      color: 'yellow',
    },
    {
      id: 'f0e08413-ba8e-4037-85d4-b631aa91542a',
      value: 'OTHER_COMPANY',
      label: 'Email of another company',
      position: 3,
      color: 'red',
    },
    {
      id: 'fbd33d20-54ae-4b46-bb4d-15d09f9fdd21',
      value: 'CHECKED',
      label: 'Checked',
      position: 4,
      color: 'gray',
    },
  ],
});
