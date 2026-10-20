import gql from 'graphql-tag';

export const EMAIL_SEQUENCE_SETTING_FRAGMENT = gql`
  fragment EmailSequenceSettingFragment on EmailSequenceSetting {
    signature
    timeZone
    sendDays
    sendWindowStartHour
    sendWindowEndHour
    dailySendLimit
    stepDelaysInDays
    isOpenTrackingEnabled
    sendingMailbox
    industryLines {
      industry
      line
    }
  }
`;
