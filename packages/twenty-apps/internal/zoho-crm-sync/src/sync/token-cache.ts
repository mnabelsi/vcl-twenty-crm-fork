import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

import { type KeyValueStore, TOKEN_KEY } from 'src/sync/state';
import type { AccessTokenCache, CachedAccessToken } from 'src/zoho/client';

type SealedToken = { iv: string; tag: string; data: string };

// Zoho allows only a handful of new access tokens per refresh token every few
// minutes, so the hour-long token is reused across runs. The key-value store
// is not encrypted, so the token is sealed with a key derived from the
// secret credentials: without them the stored value is useless, and changing
// the credentials invalidates it.
const keyFor = (clientSecret: string, refreshToken: string): Buffer =>
  createHash('sha256')
    .update(`zoho-access-token:${clientSecret}:${refreshToken}`)
    .digest();

export const sealedTokenCache = (
  store: KeyValueStore,
  clientSecret: string,
  refreshToken: string,
): AccessTokenCache => {
  const key = keyFor(clientSecret, refreshToken);

  return {
    read: async () => {
      const sealed = await store.get<SealedToken>(TOKEN_KEY);

      if (!sealed?.iv || !sealed.tag || !sealed.data) {
        return null;
      }

      try {
        const decipher = createDecipheriv(
          'aes-256-gcm',
          key,
          Buffer.from(sealed.iv, 'base64'),
        );

        decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));

        const plain = Buffer.concat([
          decipher.update(Buffer.from(sealed.data, 'base64')),
          decipher.final(),
        ]).toString('utf8');

        return JSON.parse(plain) as CachedAccessToken;
      } catch {
        return null;
      }
    },
    write: async (token) => {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const data = Buffer.concat([
        cipher.update(JSON.stringify(token), 'utf8'),
        cipher.final(),
      ]);

      await store.set(TOKEN_KEY, {
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
        data: data.toString('base64'),
      } satisfies SealedToken);
    },
    clear: async () => {
      await store.delete(TOKEN_KEY);
    },
  };
};
