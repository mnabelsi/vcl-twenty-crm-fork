import { defineApplication, FieldType } from 'twenty-sdk/define';

import {
  APP_DESCRIPTION,
  APP_DISPLAY_NAME,
  APPLICATION_UNIVERSAL_IDENTIFIER,
  VARIABLE_DAILY_SEARCH_LIMIT_UNIVERSAL_IDENTIFIER,
  VARIABLE_LINK_BY_EMAIL_DOMAIN_UNIVERSAL_IDENTIFIER,
  VARIABLE_MODE_UNIVERSAL_IDENTIFIER,
  VARIABLE_SEARXNG_AUTHORIZATION_UNIVERSAL_IDENTIFIER,
  VARIABLE_SEARXNG_URL_UNIVERSAL_IDENTIFIER,
  VARIABLE_SECONDS_BETWEEN_SEARCHES_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineApplication({
  universalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
  displayName: APP_DISPLAY_NAME,
  description: APP_DESCRIPTION,
  author: 'VCL Solutions',
  logo: 'public/logo.svg',
  applicationVariables: {
    SEARXNG_URL: {
      universalIdentifier: VARIABLE_SEARXNG_URL_UNIVERSAL_IDENTIFIER,
      label: 'SearXNG URL',
      description:
        'Address of your SearXNG server as the Twenty server reaches it, for example http://searxng:8080. Its JSON output must be enabled. Websites found from work emails need no search.',
      isRequired: true,
    },
    SEARXNG_AUTHORIZATION: {
      universalIdentifier: VARIABLE_SEARXNG_AUTHORIZATION_UNIVERSAL_IDENTIFIER,
      label: 'SearXNG Authorization header',
      description:
        'Leave empty unless SearXNG sits behind a password, for example "Basic dXNlcjpwYXNz".',
      isSecret: true,
    },
    ENRICHMENT_MODE: {
      universalIdentifier: VARIABLE_MODE_UNIVERSAL_IDENTIFIER,
      label: 'What to look for',
      description: 'Pick what the app searches for, or pause it.',
      type: FieldType.SELECT,
      options: [
        { label: 'Websites and LinkedIn profiles', value: 'ALL' },
        { label: 'Company websites only', value: 'WEBSITES' },
        { label: 'LinkedIn profiles only', value: 'LINKEDIN' },
        { label: 'Paused', value: 'PAUSED' },
      ],
      value: 'ALL',
    },
    LINK_BY_EMAIL_DOMAIN: {
      universalIdentifier: VARIABLE_LINK_BY_EMAIL_DOMAIN_UNIVERSAL_IDENTIFIER,
      label: 'Link people to companies by email domain',
      description:
        'People without a company are linked to the one company their work email belongs to; other cases are listed in Companies to check. Existing links are never changed.',
      type: FieldType.SELECT,
      options: [
        { label: 'On', value: 'ON' },
        { label: 'Off', value: 'OFF' },
      ],
      value: 'ON',
    },
    DAILY_SEARCH_LIMIT: {
      universalIdentifier: VARIABLE_DAILY_SEARCH_LIMIT_UNIVERSAL_IDENTIFIER,
      label: 'Searches per day',
      description:
        'Maximum web searches per day (UTC). Search engines block servers that search too much; lower it if SearXNG reports blocked engines.',
      value: '1500',
    },
    SECONDS_BETWEEN_SEARCHES: {
      universalIdentifier:
        VARIABLE_SECONDS_BETWEEN_SEARCHES_UNIVERSAL_IDENTIFIER,
      label: 'Seconds between searches',
      description: 'Pause between two searches, to stay under the radar.',
      value: '5',
    },
  },
});
