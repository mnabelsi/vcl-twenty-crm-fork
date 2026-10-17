import { RestApiClient, RestApiClientError } from 'twenty-client-sdk/rest';
import { enqueueJobs, kv } from 'twenty-sdk/logic-function';

import { SYNC_LOGIC_FUNCTION_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import type { KeyValueStore } from 'src/sync/state';
import {
  graphqlErrorFromBody,
  type GraphqlRequest,
  TwentyGateway,
} from 'src/twenty/gateway';

// Wiring for code running inside Twenty: the application key-value store, and
// the GraphQL API with the application's own access (the sync works the same
// whoever pressed the button).

export const appKeyValueStore: KeyValueStore = {
  get: <T>(key: string) => kv.get<T>(key),
  set: async (key, value) => {
    await kv.set(key, value);
  },
  delete: (key) => kv.delete(key),
};

export const applicationGraphql = (): GraphqlRequest => {
  const client = new RestApiClient({ runAs: 'application' });

  return async (query, variables) => {
    let body: any;

    try {
      body = await client.post('/graphql', { query, variables });
    } catch (error) {
      if (
        error instanceof RestApiClientError &&
        graphqlErrorFromBody(error.body)
      ) {
        throw graphqlErrorFromBody(error.body);
      }

      throw error;
    }

    const graphqlError = graphqlErrorFromBody(body);

    if (graphqlError) {
      throw graphqlError;
    }

    return body.data;
  };
};

export const applicationTwentyGateway = (): TwentyGateway =>
  new TwentyGateway(applicationGraphql());

export const enqueueSyncRun = async (
  payload: Record<string, unknown>,
  delayMs = 0,
): Promise<void> => {
  await enqueueJobs({
    logicFunctionUniversalIdentifier: SYNC_LOGIC_FUNCTION_UNIVERSAL_IDENTIFIER,
    jobs: [{ payload }],
    delayMs,
  });
};
