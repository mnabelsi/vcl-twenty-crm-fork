# Web Enrichment for Twenty

Fills in the **website of companies** that have none and the **LinkedIn profile of people**, for free, with a [SearXNG](https://github.com/searxng/searxng) search engine you run yourself. Built for the self-hosted Twenty at `https://mycrm.vcl.solutions` with the Twenty apps SDK (`twenty-sdk` 2.48).

## What it does

**Company websites**, for companies with an empty Domain:

1. **From work emails, no search needed.** When most people of the company write from the same work domain (`name@desertfalcon.ae`), that domain is the website. Personal mailboxes (Gmail, Hotmail, Outlook, Emirates.net.ae, ...) are ignored. One person's address alone is trusted only when it looks like the company's name.
2. **From the web.** Otherwise the app searches `<company> <country> official website` and takes the first result whose address looks like the company's name (`tabreed.ae` for "Tabreed Oman SAOC", initials such as `gpi.com` for "Gulf Pearl Industries"). Directories and social networks (LinkedIn, ZoomInfo, Wikipedia, Bayt, ...) are skipped.

**LinkedIn profiles**, for people with an empty Linkedin field: the app searches `site:linkedin.com/in <first> <last> <company>` and keeps profiles whose title carries the person's name. Arabic names are compared however they are spelled (Mohamed, Mohammed, Muhammad; Al-Jarba, Al Jarba). People with only one name, or no company and no work email, are marked **Not enough to search**.

## What it writes

Only confident matches are filled in:

| Result | Company: Website search | Person: LinkedIn search |
| --- | --- | --- |
| Filled in | **From work emails** or **Found on the web**: Domain is set | **Found**: Linkedin is set (one profile with the name and the company) |
| Not sure | **To review**: the likely site goes to *Website suggestion* | **To review**: the likely profile goes to *LinkedIn suggestion* (the company is not confirmed, or two profiles fit) |
| Nothing | **Not found** | **Not found** / **Not enough to search** |

Two lists appear in the sidebar: **Websites to review** and **LinkedIn to review**. Copy a suggestion into Domain or Linkedin when it is right, then set the search field to Found (or Not found).

Twenty allows one company per website. A company whose website already belongs to another one (a branch such as "DHL Express - Bahrain" next to "DHL", or a duplicate) gets **Website of another company**, with the website as a suggestion; these stay out of the review list. Filter on that status to find branches or duplicates to merge.

To search a record again, empty its *Website search* or *LinkedIn search* field.

## People linked to companies by email domain

Every 30 minutes the app learns the **Email domains** of each company: its website, plus the work domains of its people used by two of them (or by one, when the domain looks like the company's name). Unlike the website, a domain can belong to several companies, so a group and its branches share it. You can add domains the app missed; it never removes one.

Then, for every person:

| Situation | What the app does | Company check |
| --- | --- | --- |
| No company, and one company has the person's domain | Links the person to it | **Linked by email domain** |
| No company, several companies have the domain (a group and its branches) | Suggests the group's company, does not link | **Several companies fit** |
| No company, no company has the domain, and two or more people use it | Nothing to link to yet | **No company for this domain** |
| Linked to a company, but the domain belongs only to other companies (a duplicate, a job change, a wrong email) | Suggests the other company, **does not move the person** | **Email of another company** |

These people are listed in **Companies to check** with the *Suggested company*. Fix the company (or merge duplicate companies), or set *Company check* to **Checked** to keep things as they are; the app then leaves that person alone. A person's existing company is never changed by the app. Turn this off with the *Link people to companies by email domain* setting.

## How fast

Every 10 minutes the app runs a few searches, spread over the day up to **Searches per day** (default 1,500), with a pause between two searches (default 5 seconds). New records are handled first, then the backfill continues with older ones. Websites from emails cost no search and are filled in at once.

Search engines block servers that search too much. When the engines behind SearXNG stop answering five times in a row, the app stops for that run, leaves the records untouched and shows a warning on its settings page; nothing is marked "Not found" because of a blocked engine. Lower *Searches per day* if this happens often.

## Install on mycrm.vcl.solutions

### 1. Run SearXNG next to Twenty

On the server that runs Twenty with Docker Compose:

1. Copy `searxng/settings.yml` from this folder to a `searxng/` folder next to Twenty's `docker-compose.yml`.
2. Add the `searxng` service from `searxng/docker-compose.yml` to Twenty's `docker-compose.yml` (and its `searxng-data` volume).
3. Add `SEARXNG_SECRET=<output of openssl rand -hex 32>` to Twenty's `.env`.
4. `docker compose up -d searxng`

SearXNG then answers at `http://searxng:8080` inside the Docker network only. It has no password and no published port; keep it that way, or put it behind a password and fill in the *SearXNG Authorization header* setting.

### 2. Deploy the app

```bash
cd packages/twenty-apps/internal/web-enrichment
yarn install
yarn twenty remote:add --url https://mycrm.vcl.solutions --as vcl
yarn twenty app:publish --private --remote vcl
yarn twenty app:install --remote vcl
```

### 3. Settings

Twenty: **Settings → Apps → Web Enrichment → Variables**:

- **SearXNG URL**: `http://searxng:8080`
- **What to look for**: websites and LinkedIn profiles (default), one of them, or paused
- **Searches per day**, **Seconds between searches**: leave the defaults to start

The settings page shows a red banner when SearXNG cannot be reached or refuses JSON results, and a warning when search engines block it.

## Development

```
src/application-config.ts        app identity and settings
src/fields/                      search result, suggestion and date on Company and Person
src/views/, navigation-menu-items/  the two review lists in the sidebar
src/enrich/website.ts            websites from emails and from search results
src/enrich/linkedin.ts           LinkedIn profile matching
src/enrich/engine.ts             a run: pages of records, search budget, writes
src/search/searxng.ts            SearXNG JSON client
src/logic-functions/             the 10-minute run and the health check
searxng/                         SearXNG settings and Compose service
```

```bash
yarn lint && yarn typecheck && yarn test
```
