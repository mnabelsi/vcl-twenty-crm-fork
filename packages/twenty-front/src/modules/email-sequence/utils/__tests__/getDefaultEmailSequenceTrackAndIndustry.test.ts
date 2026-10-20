import { getCompanyIndustryHints } from '@/email-sequence/utils/getCompanyIndustryHints';
import { getDefaultEmailSequenceIndustry } from '@/email-sequence/utils/getDefaultEmailSequenceIndustry';
import { getDefaultEmailSequenceTrack } from '@/email-sequence/utils/getDefaultEmailSequenceTrack';

describe('getDefaultEmailSequenceTrack', () => {
  it('maps job titles to the matching track', () => {
    expect(getDefaultEmailSequenceTrack('Chief Human Resources Officer')).toBe(
      'C_SUITE',
    );
    expect(getDefaultEmailSequenceTrack('Talent Acquisition Manager')).toBe(
      'HR',
    );
    expect(
      getDefaultEmailSequenceTrack('Head of Learning and Development'),
    ).toBe('L_AND_D');
    expect(getDefaultEmailSequenceTrack('Digital Transformation Lead')).toBe(
      'DIGITAL',
    );
  });

  it('falls back to C-Suite when the title is unknown or missing', () => {
    expect(getDefaultEmailSequenceTrack('Embryologist')).toBe('C_SUITE');
    expect(getDefaultEmailSequenceTrack(null)).toBe('C_SUITE');
  });
});

describe('getDefaultEmailSequenceIndustry', () => {
  it('reads industry-like company fields before the company name', () => {
    const hints = getCompanyIndustryHints({
      id: 'company-id',
      __typename: 'Company',
      name: 'Gulf Holdings',
      industry: 'Banking',
    });

    expect(getDefaultEmailSequenceIndustry(...hints)).toBe('BANKING');
  });

  it('uses the company name when no industry field exists', () => {
    expect(getDefaultEmailSequenceIndustry('Saudi Telecom Company')).toBe(
      'TELECOM',
    );
  });

  it('falls back to general', () => {
    expect(getDefaultEmailSequenceIndustry('Acme')).toBe('GENERAL');
  });
});
