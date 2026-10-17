import { RestApiClient, RestApiClientError } from 'twenty-client-sdk/rest';
import { kv } from 'twenty-sdk/logic-function';

import type { KeyValueStore } from 'src/enrich/state';
import {
  graphqlErrorFromBody,
  type GraphqlRequest,
  TwentyApiError,
  twentyGateway,
  type TwentyApi,
} from 'src/twenty/gateway';

// Wiring for code running inside Twenty: the application key-value store and
// the GraphQL API with the application's own access.

export const appKeyValueStore: KeyValueStore = {
  get: <T>(key: string) => kv.get<T>(key),
  set: async (key, value) => {
    await kv.set(key, value);
  },
  delete: (key) => kv.delete(key),
};

const applicationGraphql = (): GraphqlRequest => {
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
      if (error instanceof RestApiClientError && error.status === 429) {
        throw new TwentyApiError(error.message, ['RATE_LIMITED']);
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

export const applicationTwenty = (): TwentyApi =>
  twentyGateway(applicationGraphql());
