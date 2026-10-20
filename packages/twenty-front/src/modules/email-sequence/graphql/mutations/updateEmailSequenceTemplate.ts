import gql from 'graphql-tag';

export const UPDATE_EMAIL_SEQUENCE_TEMPLATE = gql`
  mutation UpdateEmailSequenceTemplate(
    $input: UpdateEmailSequenceTemplateInput!
  ) {
    updateEmailSequenceTemplate(input: $input) {
      id
      track
      stepKey
      subject
      body
      updatedAt
    }
  }
`;
