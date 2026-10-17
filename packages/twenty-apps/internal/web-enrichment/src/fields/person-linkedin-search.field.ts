import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { PERSON_LINKEDIN_SEARCH_FIELD_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: PERSON_LINKEDIN_SEARCH_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.SELECT,
  name: 'linkedinSearch',
  label: 'LinkedIn search',
  description:
    'How the Web Enrichment app looked for the LinkedIn profile. Set it back to empty to search again.',
  icon: 'IconBrandLinkedin',
  isNullable: true,
  options: [
    {
      id: '1d3875ca-3536-4228-abee-19c224a3e3a7',
      value: 'FOUND',
      label: 'Found',
      position: 0,
      color: 'green',
    },
    {
      id: 'ef3af267-abde-45c1-b136-cc72432adf82',
      value: 'REVIEW',
      label: 'To review',
      position: 1,
      color: 'orange',
    },
    {
      id: '66113dd3-8168-4dfa-84ac-0abb5ce642cb',
      value: 'NOT_FOUND',
      label: 'Not found',
      position: 2,
      color: 'gray',
    },
    {
      id: '5e901a3a-9781-431f-a4f7-54ae726b0231',
      value: 'NOT_ENOUGH_INFO',
      label: 'Not enough to search',
      position: 3,
      color: 'gray',
    },
  ],
});
