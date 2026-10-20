// STEP_2 branches on whether the contact opened STEP_1.
export const EMAIL_SEQUENCE_STEP_KEYS = [
  'STEP_1',
  'STEP_2_OPENED',
  'STEP_2_NOT_OPENED',
  'STEP_3',
  'STEP_4',
] as const;

export type EmailSequenceStepKey = (typeof EMAIL_SEQUENCE_STEP_KEYS)[number];
