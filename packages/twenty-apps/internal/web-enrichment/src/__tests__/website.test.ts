import { describe, expect, it } from 'vitest';

import { hostMatchesCompany, registrableDomain } from 'src/enrich/normalize';
import { pickWebsite, websiteFromEmails } from 'src/enrich/website';

const result = (url: string, title = '') => ({ url, title, content: '' });

describe('registrableDomain', () => {
  it('keeps the name a company registered', () => {
    expect(registrableDomain('careers.desertfalcon.ae')).toBe(
      'desertfalcon.ae',
    );
    expect(registrableDomain('mail.desertfalcon.com.sa')).toBe(
      'desertfalcon.com.sa',
    );
    expect(registrableDomain('audit.gov.ae')).toBe('audit.gov.ae');
  });
});

describe('hostMatchesCompany', () => {
  it('recognises a name, a part of it, or its initials in an address', () => {
    expect(
      hostMatchesCompany('Desert Falcon Logistics LLC', 'desertfalcon.ae'),
    ).toBe(true);
    expect(
      hostMatchesCompany('Al Noor Fictitious Trading', 'alnoor-trading.com'),
    ).toBe(true);
    expect(hostMatchesCompany('Gulf Pearl Industries', 'gpi.com')).toBe(true);
    expect(hostMatchesCompany('Desert Falcon Logistics', 'bluewave.com')).toBe(
      false,
    );
  });
});

describe('websiteFromEmails', () => {
  it('takes the work domain most people share, ignoring personal mailboxes', () => {
    expect(
      websiteFromEmails('Desert Falcon Logistics', [
        'layla@desertfalcon.ae',
        'omar@mail.desertfalcon.ae',
        'someone@gmail.com',
        'other@emirates.net.ae',
      ]),
    ).toEqual({
      outcome: 'FROM_EMAILS',
      url: 'https://desertfalcon.ae',
      suggestion: null,
    });
  });

  it("trusts one person's address only when it looks like the company", () => {
    expect(
      websiteFromEmails('Desert Falcon Logistics', ['layla@desertfalcon.ae'])
        ?.outcome,
    ).toBe('FROM_EMAILS');
    expect(
      websiteFromEmails('Desert Falcon Logistics', [
        'layla@bluewave-advisors.com',
      ]),
    ).toEqual({
      outcome: 'REVIEW',
      url: null,
      suggestion: 'https://bluewave-advisors.com',
    });
  });

  it('says nothing without a work email', () => {
    expect(
      websiteFromEmails('Desert Falcon', ['a@gmail.com', 'b@hotmail.co.uk']),
    ).toBeNull();
  });
});

describe('pickWebsite', () => {
  it("skips directories and takes the company's own site", () => {
    expect(
      pickWebsite('Desert Falcon Logistics LLC', [
        result(
          'https://www.linkedin.com/company/desert-falcon',
          'Desert Falcon Logistics | LinkedIn',
        ),
        result(
          'https://www.zoominfo.com/c/desert-falcon/1',
          'Desert Falcon Logistics',
        ),
        result(
          'https://www.desertfalcon.ae/about',
          'About us - Desert Falcon Logistics',
        ),
      ]),
    ).toEqual({
      outcome: 'FOUND',
      url: 'https://desertfalcon.ae',
      suggestion: null,
    });
  });

  it('suggests a site that only names the company in its title', () => {
    expect(
      pickWebsite('Desert Falcon Logistics', [
        result('https://www.dflgroup.com', 'Desert Falcon Logistics - Home'),
      ]),
    ).toEqual({
      outcome: 'REVIEW',
      url: null,
      suggestion: 'https://dflgroup.com',
    });
  });

  it('finds nothing when no result belongs to the company', () => {
    expect(
      pickWebsite('Desert Falcon Logistics', [
        result('https://en.wikipedia.org/wiki/Falcon', 'Falcon - Wikipedia'),
        result('https://www.bluewave.com', 'Bluewave shipping'),
      ]).outcome,
    ).toBe('NOT_FOUND');
  });
});
