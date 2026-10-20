import { type MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { type EmailSequenceTrack } from 'twenty-shared/types';

export const EMAIL_SEQUENCE_TRACK_LABELS: Record<
  EmailSequenceTrack,
  MessageDescriptor
> = {
  C_SUITE: msg`C-Suite`,
  HR: msg`HR`,
  L_AND_D: msg`L&D`,
  DIGITAL: msg`Digital`,
};
