import gql from 'graphql-tag';

import { EMAIL_SEQUENCE_ENROLLMENT_FRAGMENT } from '@/email-sequence/graphql/fragments/emailSequenceEnrollmentFragment';

export const STOP_EMAIL_SEQUENCE = gql`
  ${EMAIL_SEQUENCE_ENROLLMENT_FRAGMENT}
  mutation StopEmailSequence($input: StopEmailSequenceInput!) {
    stopEmailSequence(input: $input) {
      ...EmailSequenceEnrollmentFragment
    }
  }
`;
