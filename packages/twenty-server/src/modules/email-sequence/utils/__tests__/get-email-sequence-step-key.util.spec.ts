import { getEmailSequenceStepKey } from 'src/modules/email-sequence/utils/get-email-sequence-step-key.util';

describe('getEmailSequenceStepKey', () => {
  it('branches the second email on whether the first was opened', () => {
    expect(
      getEmailSequenceStepKey({ stage: 2, hasOpenedFirstEmail: true }),
    ).toBe('STEP_2_OPENED');
    expect(
      getEmailSequenceStepKey({ stage: 2, hasOpenedFirstEmail: false }),
    ).toBe('STEP_2_NOT_OPENED');
  });

  it('maps the other stages to fixed steps', () => {
    expect(
      getEmailSequenceStepKey({ stage: 1, hasOpenedFirstEmail: false }),
    ).toBe('STEP_1');
    expect(
      getEmailSequenceStepKey({ stage: 3, hasOpenedFirstEmail: true }),
    ).toBe('STEP_3');
    expect(
      getEmailSequenceStepKey({ stage: 4, hasOpenedFirstEmail: false }),
    ).toBe('STEP_4');
  });

  it('rejects an unknown stage', () => {
    expect(() =>
      getEmailSequenceStepKey({ stage: 5, hasOpenedFirstEmail: false }),
    ).toThrow();
  });
});
