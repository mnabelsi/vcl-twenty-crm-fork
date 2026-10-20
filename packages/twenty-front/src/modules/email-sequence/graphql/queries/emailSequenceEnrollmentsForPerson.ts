import gql from 'graphql-tag';

import { EMAIL_SEQUENCE_ENROLLMENT_FRAGMENT } from '@/email-sequence/graphql/fragments/emailSequenceEnrollmentFragment';

export const EMAIL_SEQUENCE_ENROLLMENTS_FOR_PERSON = gql`
  ${EMAIL_SEQUENCE_ENROLLMENT_FRAGMENT}
  query EmailSequenceEnrollmentsForPerson($personId: UUID!) {
    emailSequenceEnrollmentsForPerson(personId: $personId) {
      ...EmailSequenceEnrollmentFragment
    }
  }
`;
