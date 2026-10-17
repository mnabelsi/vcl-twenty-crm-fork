import { describe, expect, it } from 'vitest';

import {
  linkedinQuery,
  pickLinkedinProfile,
  type PersonToFind,
} from 'src/enrich/linkedin';

const person = (overrides: Partial<PersonToFind> = {}): PersonToFind => ({
  firstName: 'Layla',
  lastName: 'Haddad',
  companyName: 'Desert Falcon Logistics LLC',
  emails: [],
  ...overrides,
});

const result = (url: string, title: string, content = '') => ({
  url,
  title,
  content,
});

describe('linkedinQuery', () => {
  it('searches LinkedIn profiles by name and company', () => {
    expect(linkedinQuery(person())).toBe(
      'site:linkedin.com/in Layla Haddad desert falcon logistics',
    );
  });

  it('uses the work email domain when the company is missing', () => {
    expect(
      linkedinQuery(
        person({ companyName: '', emails: ['layla@desertfalcon.ae'] }),
      ),
    ).toBe('site:linkedin.com/in Layla Haddad desertfalcon');
  });

  it('does not search a name alone', () => {
    expect(
      linkedinQuery(person({ companyName: '', emails: ['layla@gmail.com'] })),
    ).toBeNull();
    expect(linkedinQuery(person({ lastName: '' }))).toBeNull();
  });
});

describe('pickLinkedinProfile', () => {
  it('fills in the one profile with the name and the company', () => {
    expect(
      pickLinkedinProfile(person(), [
        result(
          'https://ae.linkedin.com/in/layla-haddad-12345',
          'Layla Haddad - Operations Manager - Desert Falcon Logistics | LinkedIn',
        ),
        result(
          'https://www.linkedin.com/posts/layla-haddad_update',
          'Layla Haddad on LinkedIn: Desert Falcon Logistics',
        ),
      ]),
    ).toEqual({
      outcome: 'FOUND',
      url: 'https://www.linkedin.com/in/layla-haddad-12345',
      suggestion: null,
    });
  });

  it('reads Arabic names however they are spelled', () => {
    expect(
      pickLinkedinProfile(
        person({ firstName: 'Mohamed', lastName: 'Al-Rashidi' }),
        [
          result(
            'https://www.linkedin.com/in/m-alrashidi',
            'Mohammed Al Rashidi – Desert Falcon Logistics | LinkedIn',
          ),
        ],
      ).outcome,
    ).toBe('FOUND');
  });

  it('asks for a review when the company does not confirm the profile', () => {
    expect(
      pickLinkedinProfile(person(), [
        result(
          'https://www.linkedin.com/in/layla-haddad-9',
          'Layla Haddad - Teacher | LinkedIn',
        ),
      ]),
    ).toEqual({
      outcome: 'REVIEW',
      url: null,
      suggestion: 'https://www.linkedin.com/in/layla-haddad-9',
    });
  });

  it('asks for a review when two profiles fit', () => {
    expect(
      pickLinkedinProfile(person(), [
        result(
          'https://www.linkedin.com/in/layla-haddad-1',
          'Layla Haddad - Desert Falcon Logistics | LinkedIn',
        ),
        result(
          'https://www.linkedin.com/in/layla-haddad-2',
          'Layla Haddad - Driver - Desert Falcon Logistics | LinkedIn',
        ),
      ]).outcome,
    ).toBe('REVIEW');
  });

  it('finds nothing among other people and several namesakes', () => {
    expect(
      pickLinkedinProfile(person(), [
        result(
          'https://www.linkedin.com/in/omar-farouk',
          'Omar Farouk - Desert Falcon Logistics | LinkedIn',
        ),
        result(
          'https://www.linkedin.com/company/desert-falcon',
          'Desert Falcon Logistics | LinkedIn',
        ),
      ]).outcome,
    ).toBe('NOT_FOUND');
    expect(
      pickLinkedinProfile(person(), [
        result(
          'https://www.linkedin.com/in/layla-haddad-a',
          'Layla Haddad - Teacher | LinkedIn',
        ),
        result(
          'https://www.linkedin.com/in/layla-haddad-b',
          'Layla Haddad - Nurse | LinkedIn',
        ),
      ]).outcome,
    ).toBe('NOT_FOUND');
  });
});
