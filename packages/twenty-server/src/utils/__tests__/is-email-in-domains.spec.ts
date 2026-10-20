import { isEmailInDomains } from 'src/utils/is-email-in-domains';

describe('isEmailInDomains', () => {
  const domains = ['vcl.solutions', '@ttmassociates.com'];

  it('matches the domain, its subdomains and ignores case', () => {
    expect(isEmailInDomains('Mahmoud@VCL.solutions', domains)).toBe(true);
    expect(isEmailInDomains('team@ttmassociates.com', domains)).toBe(true);
    expect(isEmailInDomains('noreply@mail.vcl.solutions', domains)).toBe(true);
  });

  it('does not match other or look-alike domains', () => {
    expect(isEmailInDomains('sara@acme.com', domains)).toBe(false);
    expect(isEmailInDomains('fake@notvcl.solutions', domains)).toBe(false);
    expect(isEmailInDomains(null, domains)).toBe(false);
    expect(isEmailInDomains('sara@acme.com', [])).toBe(false);
  });
});
