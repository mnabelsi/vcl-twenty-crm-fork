export const EMAIL_SEQUENCE_INDUSTRIES = [
  'TELECOM',
  'BANKING',
  'HEALTHCARE',
  'INDUSTRIAL',
  'GOVERNMENT',
  'GENERAL',
] as const;

export type EmailSequenceIndustry = (typeof EMAIL_SEQUENCE_INDUSTRIES)[number];
