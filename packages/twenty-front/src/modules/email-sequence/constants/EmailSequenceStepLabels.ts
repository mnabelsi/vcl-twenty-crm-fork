import { type MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { type EmailSequenceStepKey } from 'twenty-shared/types';

export const EMAIL_SEQUENCE_STEP_LABELS: Record<
  EmailSequenceStepKey,
  MessageDescriptor
> = {
  STEP_1: msg`Email 1 · Introduction`,
  STEP_2_OPENED: msg`Email 2A · Opened, no reply`,
  STEP_2_NOT_OPENED: msg`Email 2B · Not opened`,
  STEP_3: msg`Email 3 · Offer`,
  STEP_4: msg`Email 4 · Close-out`,
};
