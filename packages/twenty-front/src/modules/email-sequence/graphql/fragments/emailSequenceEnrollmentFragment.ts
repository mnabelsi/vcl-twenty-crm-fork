import gql from 'graphql-tag';

export const EMAIL_SEQUENCE_ENROLLMENT_FRAGMENT = gql`
  fragment EmailSequenceEnrollmentFragment on EmailSequenceEnrollment {
    id
    personId
    personName
    email
    companyName
    jobTitle
    track
    industry
    status
    nextStage
    nextSendAt
    lastStepKey
    lastSentAt
    endedAt
    lastError
    createdAt
    messages {
      id
      stepKey
      subject
      sentAt
      openCount
      firstOpenedAt
      messageThreadId
    }
  }
`;
