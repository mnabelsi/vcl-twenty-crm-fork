# Changelog

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
