# Changelog

## 0.2.0

- Learns the email domains of each company from its website and the work emails of its people (new Email domains field; a group and its branches can share one).
- Links people without a company to the one company their work email belongs to.
- Lists in Companies to check the people whose domain fits several companies, no company yet, or another company than theirs, with a suggested company. Existing links are never changed.

## 0.1.2

- Government email addresses without their country ("moe.gov" for "moe.gov.ae") no longer count as a company website.

## 0.1.1

- A company whose website already belongs to another company is marked "Website of another company" instead of going to the review list.

## 0.1.0

- Fills in missing company websites from the work emails of their people, then from a SearXNG web search.
- Finds people's LinkedIn profiles with a SearXNG web search; only confident matches are written.
- Websites and LinkedIn profiles to review, with suggestions, in two sidebar lists.
- Searches spread over the day under a daily limit; stops when search engines block SearXNG.
