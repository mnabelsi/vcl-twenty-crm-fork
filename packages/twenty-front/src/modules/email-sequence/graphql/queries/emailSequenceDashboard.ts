import gql from 'graphql-tag';

import { EMAIL_SEQUENCE_ENROLLMENT_FRAGMENT } from '@/email-sequence/graphql/fragments/emailSequenceEnrollmentFragment';

export const EMAIL_SEQUENCE_DASHBOARD = gql`
  ${EMAIL_SEQUENCE_ENROLLMENT_FRAGMENT}
  query EmailSequenceDashboard {
    emailSequenceDashboard {
      stats {
        active
        completed
        replied
        bounced
        stopped
        failed
        emailsSent
        emailsOpened
        emailsSentToday
      }
      enrollments {
        ...EmailSequenceEnrollmentFragment
      }
    }
  }
`;
