import gql from 'graphql-tag';

import { EMAIL_SEQUENCE_SETTING_FRAGMENT } from '@/email-sequence/graphql/fragments/emailSequenceSettingFragment';

export const UPDATE_EMAIL_SEQUENCE_SETTING = gql`
  ${EMAIL_SEQUENCE_SETTING_FRAGMENT}
  mutation UpdateEmailSequenceSetting(
    $input: UpdateEmailSequenceSettingInput!
  ) {
    updateEmailSequenceSetting(input: $input) {
      ...EmailSequenceSettingFragment
    }
  }
`;
