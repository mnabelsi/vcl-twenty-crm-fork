import { type EmailSequenceStepKey } from 'twenty-shared/types';

export const EMAIL_SEQUENCE_LAST_STAGE = 4;

export const getEmailSequenceStepKey = ({
  stage,
  hasOpenedFirstEmail,
}: {
  stage: number;
  hasOpenedFirstEmail: boolean;
}): EmailSequenceStepKey => {
  switch (stage) {
    case 1:
      return 'STEP_1';
    case 2:
      return hasOpenedFirstEmail ? 'STEP_2_OPENED' : 'STEP_2_NOT_OPENED';
    case 3:
      return 'STEP_3';
    case EMAIL_SEQUENCE_LAST_STAGE:
      return 'STEP_4';
    default:
      throw new Error(`Unknown email sequence stage ${stage}`);
  }
};
