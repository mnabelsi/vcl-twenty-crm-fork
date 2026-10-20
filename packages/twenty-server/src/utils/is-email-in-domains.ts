import { isNonEmptyString } from '@sniptt/guards';

import { getDomainFromEmail } from 'src/utils/get-domain-from-email';

// Subdomains count as the parent domain (mail.vcl.solutions belongs to vcl.solutions)
export const isEmailInDomains = (
  email: string | null | undefined,
  domains: string[],
): boolean => {
  if (!isNonEmptyString(email) || domains.length === 0) {
    return false;
  }

  const emailDomain = getDomainFromEmail(email.trim().toLowerCase());

  if (!isNonEmptyString(emailDomain)) {
    return false;
  }

  return domains.some((domain) => {
    const normalizedDomain = domain.trim().toLowerCase().replace(/^@/, '');

    return (
      isNonEmptyString(normalizedDomain) &&
      (emailDomain === normalizedDomain ||
        emailDomain.endsWith(`.${normalizedDomain}`))
    );
  });
};
