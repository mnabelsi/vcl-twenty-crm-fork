import { isNonEmptyString } from '@sniptt/guards';
import { type EmailSequenceIndustry } from 'twenty-shared/types';

const INDUSTRY_RULES: { industry: EmailSequenceIndustry; pattern: RegExp }[] = [
  {
    industry: 'TELECOM',
    pattern: /telecom|telco|communications?|mobile operator|\bisp\b|اتصالات/i,
  },
  {
    industry: 'BANKING',
    pattern:
      /bank|financ|insurance|takaful|invest|capital|fintech|asset management|مصرف|بنك|تمويل/i,
  },
  {
    industry: 'HEALTHCARE',
    pattern:
      /pharma|health|hospital|medical|clinic|biotech|life science|صح|دواء/i,
  },
  {
    industry: 'INDUSTRIAL',
    pattern:
      /industr|manufactur|energy|oil|gas|petro|chemical|mining|utilit|construction|logistic|صناع|طاقة|نفط/i,
  },
  {
    industry: 'GOVERNMENT',
    pattern:
      /government|ministry|authority|public sector|semi-gov|municipal|commission|حكوم|وزارة|هيئة/i,
  },
];

// Reads any free-text industry value the company may carry (e.g. a field synced from Zoho)
export const getDefaultEmailSequenceIndustry = (
  ...industryHints: (string | null | undefined)[]
): EmailSequenceIndustry => {
  const hintText = industryHints.filter(isNonEmptyString).join(' ');

  return (
    INDUSTRY_RULES.find(({ pattern }) => pattern.test(hintText))?.industry ??
    'GENERAL'
  );
};
