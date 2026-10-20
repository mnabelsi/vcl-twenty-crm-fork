export const EMAIL_SEQUENCE_ENROLLMENT_STATUSES = [
  'ACTIVE',
  'COMPLETED',
  'REPLIED',
  'BOUNCED',
  'STOPPED',
  'FAILED',
] as const;

export type EmailSequenceEnrollmentStatus =
  (typeof EMAIL_SEQUENCE_ENROLLMENT_STATUSES)[number];
