import gql from 'graphql-tag';

import { EMAIL_SEQUENCE_ENROLLMENT_FRAGMENT } from '@/email-sequence/graphql/fragments/emailSequenceEnrollmentFragment';

export const START_EMAIL_SEQUENCE = gql`
  ${EMAIL_SEQUENCE_ENROLLMENT_FRAGMENT}
  mutation StartEmailSequence($input: StartEmailSequenceInput!) {
    startEmailSequence(input: $input) {
      ...EmailSequenceEnrollmentFragment
    }
  }
`;
