import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { COMPANY_WEBSITE_SEARCH_FIELD_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: COMPANY_WEBSITE_SEARCH_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company.universalIdentifier,
  type: FieldType.SELECT,
  name: 'websiteSearch',
  label: 'Website search',
  description:
    'How the Web Enrichment app looked for the website. Set it back to empty to search again.',
  icon: 'IconWorldSearch',
  isNullable: true,
  options: [
    {
      id: '2b999d64-336c-4b10-a0aa-bc2a234d57e9',
      value: 'FROM_EMAILS',
      label: 'From work emails',
      position: 0,
      color: 'green',
    },
    {
      id: '3562423d-2aad-457c-9f5b-efef3d05485d',
      value: 'FOUND',
      label: 'Found on the web',
      position: 1,
      color: 'green',
    },
    {
      id: '5c93374e-8dbf-47c1-a273-cc49b5702206',
      value: 'REVIEW',
      label: 'To review',
      position: 2,
      color: 'orange',
    },
    {
      id: 'fe1974a9-1273-4ceb-b88c-88869866715b',
      value: 'NOT_FOUND',
      label: 'Not found',
      position: 3,
      color: 'gray',
    },
    {
      id: '665e7276-9b18-47b4-9ca0-a447878ccd84',
      value: 'SHARED',
      label: 'Website of another company',
      position: 4,
      color: 'blue',
    },
  ],
});
