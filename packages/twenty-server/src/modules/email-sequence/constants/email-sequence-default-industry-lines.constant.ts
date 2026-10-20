import { type EmailSequenceIndustry } from 'twenty-shared/types';

export const EMAIL_SEQUENCE_DEFAULT_INDUSTRY_LINES: Record<
  EmailSequenceIndustry,
  string
> = {
  TELECOM:
    'In telecom, AI tools are already in place across customer care and network operations, but daily use varies a lot between teams.',
  BANKING:
    'In banking and financial services, the challenge is using AI with confidence while meeting regulator expectations on data and model risk.',
  HEALTHCARE:
    'In pharma and healthcare, commercial, medical and support teams see clear value in AI, but data sensitivity slows most use cases down.',
  INDUSTRIAL:
    'In industrial and energy companies, the value of AI sits in planning, maintenance and procurement teams who rarely get structured support to use it.',
  GOVERNMENT:
    'In government entities, national AI targets are clear, and the next step is building the workforce capability to deliver them.',
  GENERAL:
    'Across the GCC, AI budgets are growing faster than the skills needed to use them well.',
};
