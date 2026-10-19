# Changelog

## 0.2.0

- Every Zoho field is synced. The app reads the field list of Contacts, Accounts and Deals (custom fields included) every six hours and creates a Twenty field for each one, named `zoho…` with the Zoho label. Fields added in Zoho later are created too.
- Editable fields sync both ways, field by field: an edit to one field in Zoho and another in Twenty are both kept. Read-only Zoho fields (formulas, lookups, owners, system times) come into Twenty only. File, image and subform fields are not synced and are listed on the page.
- Zoho Annual Revenue goes into Twenty's own Annual Revenue field; a revenue Twenty already has is kept and sent to Zoho.
- Zoho URL fields are kept as text, so values like "n/a" never block a record.
- Deals sync with Twenty Opportunities, both ways: name, amount, closing date, stage (Zoho's stages are added to the Stage field), company, point of contact, owner (Zoho to Twenty) and every other Deal field.
- When the field list gets new fields, all Zoho records are read again to fill them on records already in Twenty.
- Needs a new connection with the Deals and field settings scopes. Until then Contacts and Accounts keep syncing their main fields, and the page asks to reconnect.
- The app role can now change the data model (to add the fields) and read and update opportunities.

## 0.1.3

- A Zoho contact without an account no longer removes the company a person was given in Twenty (by hand or by email domain).

## 0.1.2

- A Zoho account without a website no longer clears a website filled in Twenty (by hand or by the Web Enrichment app).

## 0.1.1

- When Twenty's limit on requests from apps is reached, the run stops and continues a minute later, picking up the unfinished page instead of skipping it.
- A refused batch of records is retried record by record without creating the records it already saved a second time.
- An existing company whose link to Zoho could not be saved is matched again instead of being duplicated.

## 0.1.0

- Two-way sync of Zoho CRM Contacts and Accounts with Twenty People and Companies, every five minutes.
- First import matches existing Twenty records by email, website and name instead of duplicating them.
- Zoho CRM Sync page: status, connect with a grant code, sync now, import again, send unlinked records to Zoho, recent problems.
- Health check on the app's settings page when Zoho refuses the credentials.
