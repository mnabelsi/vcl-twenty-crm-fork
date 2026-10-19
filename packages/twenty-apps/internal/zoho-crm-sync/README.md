# Zoho CRM Sync for Twenty

A Twenty app that keeps **Zoho CRM Contacts, Accounts and Deals** in step with **Twenty People, Companies and Opportunities**, both ways, every five minutes, with every Zoho field. Built for the self-hosted Twenty at `https://mycrm.vcl.solutions` with the Twenty apps SDK (`twenty-sdk` 2.48).

- Zoho to Twenty: new and changed Zoho records are brought into Twenty.
- Twenty to Zoho: people, companies and opportunities created or edited in Twenty are sent to Zoho.
- Every Zoho field has a Twenty field, created by the app.
- Nothing is ever deleted on either side.
- A **Zoho CRM Sync** page in the Twenty sidebar shows the status, the fields and the buttons.

## What is synced

### Main fields

| Zoho Contacts | Twenty People |
| --- | --- |
| First_Name, Last_Name | Name |
| Email | Primary email |
| Secondary_Email | First additional email |
| Phone | Primary phone |
| Mobile | First additional phone |
| Title | Job title |
| Account_Name | Company |

| Zoho Accounts | Twenty Companies |
| --- | --- |
| Account_Name | Name |
| Website | Domain |
| Billing_Street, Billing_City, Billing_State, Billing_Code, Billing_Country | Address |
| Annual_Revenue | Annual Revenue |
| Owner (Zoho to Twenty, matched by email to a workspace member) | Account owner, when empty |
| Industry (Zoho to Twenty, when it matches an option of the Industry field) | Industry, on new companies |

| Zoho Deals | Twenty Opportunities |
| --- | --- |
| Deal_Name | Name |
| Amount (in the deal's currency, or the Zoho organization's) | Amount |
| Closing_Date | Close date |
| Stage (Zoho's stages are added as options) | Stage |
| Account_Name | Company |
| Contact_Name | Point of Contact |
| Owner (Zoho to Twenty, matched by email to a workspace member) | Owner, when empty |

### Every other Zoho field

The app reads the field list of each Zoho module (custom fields included) every six hours, and creates a Twenty field for each Zoho field that has none yet. The Twenty field is named `zoho` plus the Zoho API name (`Lead_Source` becomes `zohoLeadSource`) and carries the Zoho label; when that label is already taken in Twenty it gets " (Zoho)" (Industry (Zoho), Account Owner (Zoho)).

| Zoho type | Twenty type | Direction |
| --- | --- | --- |
| Single line, multi line, email, phone | Text | Both ways |
| URL | Links | Both ways |
| Pick list | Select (options added as Zoho values appear) | Both ways |
| Multi-select pick list | Multi-select | Both ways |
| Integer, decimal, percent, long integer | Number | Both ways |
| Currency | Currency | Both ways |
| Date | Date | Both ways |
| Date/time | Date and time | Both ways |
| Checkbox | Boolean | Both ways |
| Lookup, user, owner | Text (the name) | Zoho to Twenty |
| Formula, rollup summary, auto-number | By result type | Zoho to Twenty |
| Any field read-only in Zoho (created time, modified by, ...) | By type | Zoho to Twenty |
| File upload, image, subform, multi-select lookup | Not synced (listed on the page) | |

The Twenty fields belong to the workspace, not to the app: uninstalling or upgrading the app keeps them and their data. A Zoho field added later gets its Twenty field at the next refresh, and every Zoho record is read again to fill it. A `zoho…` field deleted in Twenty is created again and refilled from Zoho; Zoho keeps its values.

Other Twenty fields (tags, list source, contact type, further emails and phones, your own custom fields) are never touched. The app also adds read-only fields: **Zoho contact/account/deal ID** (the link), **Zoho synced at**, **Zoho sync fingerprint** and **Zoho field state** (used to detect changes; do not edit).

Phone numbers in Zoho are free text. Numbers without a `+country` prefix are read with the contact's Mailing_Country, or the **Default phone country** setting (AE). A Zoho phone the app cannot read is left as it is in Zoho. Phones beyond Phone and Mobile are kept as text fields.

## How the sync decides

- **First import.** Each Zoho account is matched to an existing Twenty company by website, then by name (ignoring case, punctuation and LLC, Ltd, PJSC and similar). Each Zoho contact is matched to an existing Twenty person by email, then by name within the same company. Matched records are linked, not duplicated. Unmatched ones are created in Twenty. Deals are always created as new opportunities.
- **On a match, Twenty leads for the main fields.** Twenty keeps the values it has, empty Twenty fields are filled from Zoho, and Twenty's values are then written to Zoho. A Zoho email or phone that lost its place is kept in Twenty as an additional email or phone. For the other fields, Zoho's value fills the new Twenty field.
- **After that, changes flow field by field.** Each record remembers the state of every field at the last sync, so a change on one side goes to the other on the next run, and an edit to one field in Zoho and another field in Twenty are both kept. Only the fields that changed are sent to Zoho.
- **Same field edited on both sides between two runs:** the later edit wins, Twenty on a tie.
- **Existing Twenty records are not pushed on their own.** A Twenty record reaches Zoho when it is created or edited after the app is installed, or when you press **Send unlinked Twenty records to Zoho**. People and companies that Twenty created by itself from emails and calendar events are never sent to Zoho unless they are already linked. An opportunity sent to Zoho takes its company and point of contact with it.
- **Deletes are not synced.** A record deleted in Twenty is not brought back from Zoho, and nothing is deleted in Zoho.

The direction can be changed in the app's settings: Two-way, Zoho to Twenty only, Twenty to Zoho only, or Paused.

## Install on mycrm.vcl.solutions

### 1. Create the Zoho Self Client

1. Open the Zoho API console of your data center (`https://api-console.zoho.com`, `.eu`, `.sa`, ...).
2. **Add Client** → **Self Client** → Create. Keep the **Client ID** and **Client Secret**.

### 2. Deploy the app

From a computer with Node 24 (Corepack enabled) and this repository:

```bash
cd packages/twenty-apps/internal/zoho-crm-sync
yarn install
yarn twenty remote:add --url https://mycrm.vcl.solutions --as vcl   # opens the browser to sign in
yarn twenty app:publish --private --remote vcl                     # uploads the app to your Twenty
yarn twenty app:install --remote vcl                               # installs it in the VCL workspace
```

These use the Twenty tools pinned in `yarn.lock` (2.48.0), so deploying never pulls a newer version from the Twenty project.

The app then appears under **Settings → Developers → Apps → My apps** with VCL as its owner, and **Zoho CRM Sync** appears in the sidebar. To ship a change later, raise `version` in `package.json` and run the last two commands again: Twenty only accepts a higher version.

### 3. Connect Zoho

1. Twenty: **Settings → Apps → Zoho CRM Sync → Variables**. Fill in **Zoho data center**, **Zoho client ID** and **Zoho client secret**.
2. Zoho API console → your Self Client → **Generate Code**, with these scopes, 10 minutes:
   `ZohoCRM.modules.contacts.ALL,ZohoCRM.modules.accounts.ALL,ZohoCRM.modules.deals.ALL,ZohoCRM.settings.fields.READ,ZohoCRM.org.READ`
3. Twenty sidebar → **Zoho CRM Sync** → paste the code → **Connect**. The refresh token is saved in the app's variables and the first import starts. It continues by itself, a few minutes at most for a few thousand records; the page updates as it goes.

### Upgrading from 0.1

1. Publish and install the new version (the last two commands of step 2). Twenty asks to approve the new permissions: opportunities and the data model.
2. On the **Zoho CRM Sync** page, **Reconnect Zoho** with a grant code made with the scopes above (they now include Deals and field settings).
3. The next run creates the Twenty fields; the runs after read every Zoho record again to fill them and bring the Deals in. With about 12,000 contacts this takes a few runs, and the page shows the progress.

Until you reconnect, Contacts and Accounts keep syncing their main fields as before.

## Using it

The **Zoho CRM Sync** page shows the last run, the totals, and the records that could not be synced with the reason (click a name to open it). Buttons:

- **Sync now**: run now instead of waiting for the next five-minute run.
- **Import everything again from Zoho**: read the Zoho field lists and every Zoho record again, and match them. Nothing is deleted; use it after changing matching data in bulk or adding fields in Zoho.
- **Send unlinked Twenty records to Zoho**: create in Zoho every Twenty person and company that has no Zoho link yet (Zoho links them to an existing record with the same email or account name instead of duplicating).
- **Reconnect Zoho**: connect again with a new grant code.

If Zoho refuses the credentials, the app's settings page shows a red banner and the page shows the reason.

## Development

The code is plain TypeScript on the Twenty apps SDK; see [AGENTS.md](AGENTS.md) for the SDK rules and [SETUP.md](SETUP.md) to run it against a local Twenty.

```
src/application-config.ts     app identity and variables (credentials, direction, phone country)
src/roles/default-role.ts     what the app may read and write: people, companies, opportunities, members, the data model; never deletes
src/fields/                   Zoho link, synced-at, fingerprint and field state fields on Person, Company and Opportunity
src/logic-functions/          zoho-sync (every 5 min), status/run/connect routes for the page, health check
src/front-components/         the Zoho CRM Sync page
src/sync/mapping.ts           main field mapping, fingerprints, first-match merge, Zoho change sets
src/sync/fields/              every other field: Zoho field list to Twenty fields (schema-plan, schema), values, field-by-field reconcile
src/sync/engine.ts            pull, push, matching, conflicts, backfill, deals
src/sync/run.ts               a run: lock, requested action, status for the page
src/zoho/client.ts            Zoho CRM API v8 client (token cache, retries)
src/twenty/gateway.ts         Twenty GraphQL queries and batched writes
src/twenty/metadata.ts        Twenty metadata API: list, create and extend fields
dev/mock-zoho-server.mjs      a fake Zoho for end-to-end tests on a local Twenty
```

```bash
yarn lint && yarn typecheck && yarn test:unit
yarn test          # installs the app on a running Twenty (TWENTY_API_URL, TWENTY_API_KEY) and checks it
```
