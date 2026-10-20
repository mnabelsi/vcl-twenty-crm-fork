import gql from 'graphql-tag';

export const EMAIL_SEQUENCE_TEMPLATES = gql`
  query EmailSequenceTemplates {
    emailSequenceTemplates {
      id
      track
      stepKey
      subject
      body
      updatedAt
    }
  }
`;
