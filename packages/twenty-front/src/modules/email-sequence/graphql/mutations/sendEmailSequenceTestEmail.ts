import gql from 'graphql-tag';

export const SEND_EMAIL_SEQUENCE_TEST_EMAIL = gql`
  mutation SendEmailSequenceTestEmail(
    $input: SendEmailSequenceTestEmailInput!
  ) {
    sendEmailSequenceTestEmail(input: $input)
  }
`;
