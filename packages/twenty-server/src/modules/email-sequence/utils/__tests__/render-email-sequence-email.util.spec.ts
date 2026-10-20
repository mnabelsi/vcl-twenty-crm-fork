import { renderEmailSequenceEmail } from 'src/modules/email-sequence/utils/render-email-sequence-email.util';

describe('renderEmailSequenceEmail', () => {
  const variables = {
    firstName: 'Sara',
    company: 'Acme & Co',
    industryLine: 'In telecom, things move fast.',
  };

  it('fills variables, escapes HTML and appends the signature', () => {
    const { html, plainText } = renderEmailSequenceEmail({
      body: 'Hi {{firstName}},\n\nAbout {{ company }}.\n\n{{industryLine}}',
      signature: 'Best regards,\nMahmoud',
      variables,
    });

    expect(plainText).toBe(
      'Hi Sara,\n\nAbout Acme & Co.\n\nIn telecom, things move fast.\n\nBest regards,\nMahmoud',
    );
    expect(html).toContain('About Acme &amp; Co.');
    expect(html).toContain('Best regards,<br>Mahmoud');
    expect(html).not.toContain('<img');
  });

  it('drops the paragraph of an empty variable', () => {
    const { plainText } = renderEmailSequenceEmail({
      body: 'Hi {{firstName}},\n\n{{industryLine}}\n\nThanks.',
      signature: 'Mahmoud',
      variables: { ...variables, industryLine: '' },
    });

    expect(plainText).toBe('Hi Sara,\n\nThanks.\n\nMahmoud');
  });

  it('adds the open tracking pixel when a URL is given', () => {
    const { html } = renderEmailSequenceEmail({
      body: 'Hi',
      signature: 'Mahmoud',
      variables,
      openTrackingPixelUrl: 'https://crm.example.com/emailing/sequence/o/abc',
    });

    expect(html).toContain(
      '<img src="https://crm.example.com/emailing/sequence/o/abc" width="1" height="1"',
    );
  });
});
