import { type MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';

// Index 0 is Sunday, matching the server's sendDays
export const EMAIL_SEQUENCE_WEEKDAY_LABELS: MessageDescriptor[] = [
  msg`Sun`,
  msg`Mon`,
  msg`Tue`,
  msg`Wed`,
  msg`Thu`,
  msg`Fri`,
  msg`Sat`,
];
