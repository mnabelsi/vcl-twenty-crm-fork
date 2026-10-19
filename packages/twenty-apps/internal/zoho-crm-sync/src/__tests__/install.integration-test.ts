import { MetadataApiClient } from 'twenty-client-sdk/metadata';
import { describe, expect, it } from 'vitest';

import { APPLICATION_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';

const request = async (path: string, init?: RequestInit) => {
  const response = await fetch(`${process.env.TWENTY_API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.TWENTY_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  return response.json();
};

describe('Zoho CRM Sync installation', () => {
  it('is installed in the workspace', async () => {
    const { findManyApplications } = await new MetadataApiClient().query({
      findManyApplications: { universalIdentifier: true },
    });

    expect(
      findManyApplications.map(
        (application: { universalIdentifier: string }) =>
          application.universalIdentifier,
      ),
    ).toContain(APPLICATION_UNIVERSAL_IDENTIFIER);
  });

  it('adds the Zoho link fields to people, companies and opportunities', async () => {
    const body = await request('/graphql', {
      method: 'POST',
      body: JSON.stringify({
        query: `{
          people(first: 1) { edges { node { id zohoContactId zohoSyncHash zohoFieldState zohoSyncedAt } } }
          companies(first: 1) { edges { node { id zohoAccountId zohoSyncHash zohoFieldState zohoSyncedAt } } }
          opportunities(first: 1) { edges { node { id zohoDealId zohoFieldState zohoSyncedAt } } }
        }`,
      }),
    });

    expect(body.errors).toBeUndefined();
  });

  it('reports the missing Zoho credentials on its status route', async () => {
    const status = await request('/s/zoho-sync/status');

    expect(status.configured).toBe(false);
    expect(status.missing).toEqual(
      expect.arrayContaining([
        'ZOHO_CLIENT_ID',
        'ZOHO_CLIENT_SECRET',
        'ZOHO_REFRESH_TOKEN',
      ]),
    );
  });
});
