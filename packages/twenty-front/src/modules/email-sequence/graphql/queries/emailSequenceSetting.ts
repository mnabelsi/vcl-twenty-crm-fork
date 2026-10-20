import gql from 'graphql-tag';

import { EMAIL_SEQUENCE_SETTING_FRAGMENT } from '@/email-sequence/graphql/fragments/emailSequenceSettingFragment';

export const EMAIL_SEQUENCE_SETTING = gql`
  ${EMAIL_SEQUENCE_SETTING_FRAGMENT}
  query EmailSequenceSetting {
    emailSequenceSetting {
      ...EmailSequenceSettingFragment
    }
  }
`;
