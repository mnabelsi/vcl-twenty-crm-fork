# Development setup

Runs the app against a local Twenty in Docker, with a fake Zoho, so a change can be tested end to end before it reaches mycrm.vcl.solutions.

## Prerequisites

- Node.js 24 (`.nvmrc`) with Corepack enabled, so `yarn` is Yarn 4
- Docker

## Local Twenty

```bash
yarn install
yarn twenty docker:start                  # Twenty on http://localhost:2020, login tim@apple.dev / tim@apple.dev
npx twenty auth login --url http://localhost:2020
npx twenty app apply --create             # build, register and install the app
```

`npx twenty app apply` again after each change (it type-checks first). Do not change any `universalIdentifier` in `src/constants/universal-identifiers.ts`: Twenty would delete the field or function and its data, then create a new one.

## Fake Zoho

`dev/mock-zoho-server.mjs` answers the Zoho accounts server and the CRM v8 endpoints the app uses, with a few fictitious accounts and contacts. The Twenty container reaches the host at `172.17.0.1` on Linux (`host.docker.internal` on macOS and Windows):

```bash
BASE=http://172.17.0.1:4555 node dev/mock-zoho-server.mjs
```

Then, in **Settings → Apps → Zoho CRM Sync → Variables**: client ID `mock-client`, client secret `mock-secret`, both advanced URLs `http://172.17.0.1:4555`. On the Zoho CRM Sync page, connect with the grant code `GOOD-CODE`.

The fake Zoho also has `GET /_state` (all records), `GET /_log` (requests it received), `POST /_edit` (`{"module","id","changes"}`) and `POST /_add` (`{"module","record"}`) to change records as a Zoho user would.

## Checks

```bash
yarn lint
yarn typecheck
yarn test:unit     # mapping and the sync rules against in-memory Zoho and Twenty
yarn test          # installs the app on the local Twenty and checks the fields and status route
```
