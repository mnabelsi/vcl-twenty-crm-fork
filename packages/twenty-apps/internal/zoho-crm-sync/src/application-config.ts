import { defineApplication, FieldType } from 'twenty-sdk/define';

import {
  APP_DESCRIPTION,
  APP_DISPLAY_NAME,
  APPLICATION_UNIVERSAL_IDENTIFIER,
  VARIABLE_ACCOUNTS_URL_UNIVERSAL_IDENTIFIER,
  VARIABLE_API_URL_UNIVERSAL_IDENTIFIER,
  VARIABLE_CLIENT_ID_UNIVERSAL_IDENTIFIER,
  VARIABLE_CLIENT_SECRET_UNIVERSAL_IDENTIFIER,
  VARIABLE_DATA_CENTER_UNIVERSAL_IDENTIFIER,
  VARIABLE_DEFAULT_PHONE_COUNTRY_UNIVERSAL_IDENTIFIER,
  VARIABLE_REFRESH_TOKEN_UNIVERSAL_IDENTIFIER,
  VARIABLE_SYNC_DIRECTION_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';
import { ZOHO_DATA_CENTER_OPTIONS } from 'src/zoho/data-centers';

export default defineApplication({
  universalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
  displayName: APP_DISPLAY_NAME,
  description: APP_DESCRIPTION,
  author: 'VCL Solutions',
  logo: 'public/logo.svg',
  applicationVariables: {
    ZOHO_DATA_CENTER: {
      universalIdentifier: VARIABLE_DATA_CENTER_UNIVERSAL_IDENTIFIER,
      label: 'Zoho data center',
      description:
        'Where your Zoho account lives: the domain you sign in to (zoho.com, zoho.eu, zoho.sa, ...).',
      type: FieldType.SELECT,
      options: ZOHO_DATA_CENTER_OPTIONS,
      value: 'com',
    },
    ZOHO_CLIENT_ID: {
      universalIdentifier: VARIABLE_CLIENT_ID_UNIVERSAL_IDENTIFIER,
      label: 'Zoho client ID',
      description:
        'Client ID of the Self Client created in the Zoho API console.',
      isRequired: true,
    },
    ZOHO_CLIENT_SECRET: {
      universalIdentifier: VARIABLE_CLIENT_SECRET_UNIVERSAL_IDENTIFIER,
      label: 'Zoho client secret',
      description: 'Client secret of the same Self Client.',
      isSecret: true,
      isRequired: true,
    },
    ZOHO_REFRESH_TOKEN: {
      universalIdentifier: VARIABLE_REFRESH_TOKEN_UNIVERSAL_IDENTIFIER,
      label: 'Zoho refresh token',
      description:
        'Filled in for you when you connect with a grant code on the Zoho CRM Sync page. You can also paste an existing refresh token here.',
      isSecret: true,
      isRequired: true,
    },
    SYNC_DIRECTION: {
      universalIdentifier: VARIABLE_SYNC_DIRECTION_UNIVERSAL_IDENTIFIER,
      label: 'Sync direction',
      description:
        'Two-way keeps both sides in step. Pick one direction to mirror only, or pause the sync.',
      type: FieldType.SELECT,
      options: [
        { label: 'Two-way', value: 'TWO_WAY' },
        { label: 'Zoho to Twenty only', value: 'ZOHO_TO_TWENTY' },
        { label: 'Twenty to Zoho only', value: 'TWENTY_TO_ZOHO' },
        { label: 'Paused', value: 'PAUSED' },
      ],
      value: 'TWO_WAY',
    },
    DEFAULT_PHONE_COUNTRY: {
      universalIdentifier: VARIABLE_DEFAULT_PHONE_COUNTRY_UNIVERSAL_IDENTIFIER,
      label: 'Default phone country',
      description:
        'Two-letter country code (AE, SA, EG, ...) used to read Zoho phone numbers written without a +country prefix.',
      value: 'AE',
    },
    ZOHO_ACCOUNTS_URL: {
      universalIdentifier: VARIABLE_ACCOUNTS_URL_UNIVERSAL_IDENTIFIER,
      label: 'Advanced: Zoho accounts URL',
      description:
        'Leave empty. Overrides the accounts server picked from the data center, for example https://accounts.zoho.com.',
    },
    ZOHO_API_URL: {
      universalIdentifier: VARIABLE_API_URL_UNIVERSAL_IDENTIFIER,
      label: 'Advanced: Zoho API URL',
      description:
        'Leave empty. Overrides the API domain Zoho returns with the access token, for example https://www.zohoapis.com.',
    },
  },
});
