import { type MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { type EmailSequenceEnrollmentStatus } from 'twenty-shared/types';
import { type ThemeColor } from 'twenty-ui/theme';

export const EMAIL_SEQUENCE_STATUS_DISPLAY: Record<
  EmailSequenceEnrollmentStatus,
  { label: MessageDescriptor; color: ThemeColor }
> = {
  ACTIVE: { label: msg`Active`, color: 'blue' },
  COMPLETED: { label: msg`Completed`, color: 'gray' },
  REPLIED: { label: msg`Replied`, color: 'green' },
  BOUNCED: { label: msg`Bounced`, color: 'red' },
  STOPPED: { label: msg`Stopped`, color: 'orange' },
  FAILED: { label: msg`Failed`, color: 'red' },
};
