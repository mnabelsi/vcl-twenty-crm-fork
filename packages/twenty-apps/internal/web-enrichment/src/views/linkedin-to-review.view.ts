import {
  defineView,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
  ViewFilterOperand,
  ViewType,
} from 'twenty-sdk/define';

import {
  LINKEDIN_TO_REVIEW_VIEW_UNIVERSAL_IDENTIFIER,
  PERSON_LINKEDIN_SEARCH_FIELD_UNIVERSAL_IDENTIFIER,
  PERSON_LINKEDIN_SUGGESTION_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

const personFields = STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.fields;

export default defineView({
  universalIdentifier: LINKEDIN_TO_REVIEW_VIEW_UNIVERSAL_IDENTIFIER,
  name: 'LinkedIn to review',
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: ViewType.TABLE,
  icon: 'IconBrandLinkedin',
  fields: [
    {
      universalIdentifier: 'b6357f29-30b1-4914-878b-a984fc1de729',
      fieldMetadataUniversalIdentifier: personFields.name.universalIdentifier,
      position: 0,
      isVisible: true,
      size: 210,
    },
    {
      universalIdentifier: '0995be5f-421c-47e4-beb2-dc1e5f442045',
      fieldMetadataUniversalIdentifier:
        personFields.company.universalIdentifier,
      position: 1,
      isVisible: true,
      size: 200,
    },
    {
      universalIdentifier: '994b8506-a980-4845-a09a-00e063f381b6',
      fieldMetadataUniversalIdentifier:
        personFields.jobTitle.universalIdentifier,
      position: 2,
      isVisible: true,
      size: 180,
    },
    {
      universalIdentifier: '23db40b6-0fe8-4227-8265-d03c73671f1e',
      fieldMetadataUniversalIdentifier:
        PERSON_LINKEDIN_SUGGESTION_FIELD_UNIVERSAL_IDENTIFIER,
      position: 3,
      isVisible: true,
      size: 240,
    },
    {
      universalIdentifier: '57774db3-81ca-41bb-8d6e-821d99e4a352',
      fieldMetadataUniversalIdentifier:
        personFields.linkedinLink.universalIdentifier,
      position: 4,
      isVisible: true,
      size: 200,
    },
    {
      universalIdentifier: 'e0859cbb-10c2-41ac-9955-15db8961f5e2',
      fieldMetadataUniversalIdentifier: personFields.emails.universalIdentifier,
      position: 5,
      isVisible: true,
      size: 220,
    },
  ],
  filters: [
    {
      universalIdentifier: '231d06e7-922b-4bc1-b52f-653ffb1f7662',
      fieldMetadataUniversalIdentifier:
        PERSON_LINKEDIN_SEARCH_FIELD_UNIVERSAL_IDENTIFIER,
      operand: ViewFilterOperand.IS,
      value: ['REVIEW'],
    },
  ],
});
