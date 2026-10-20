export const EMAIL_SEQUENCE_TRACKS = [
  'C_SUITE',
  'HR',
  'L_AND_D',
  'DIGITAL',
] as const;

export type EmailSequenceTrack = (typeof EMAIL_SEQUENCE_TRACKS)[number];
