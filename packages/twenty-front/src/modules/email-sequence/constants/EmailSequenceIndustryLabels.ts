import { type MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { type EmailSequenceIndustry } from 'twenty-shared/types';

export const EMAIL_SEQUENCE_INDUSTRY_LABELS: Record<
  EmailSequenceIndustry,
  MessageDescriptor
> = {
  TELECOM: msg`Telecom`,
  BANKING: msg`Banking & Financial Services`,
  HEALTHCARE: msg`Pharma & Healthcare`,
  INDUSTRIAL: msg`Industrial & Energy`,
  GOVERNMENT: msg`Government & Semi-Government`,
  GENERAL: msg`Other / General`,
};
