// Zoho runs separate data centers; the accounts (OAuth) server and the API
// domain both depend on the one the organization signed up in.
type ZohoDataCenter = {
  label: string;
  value: string;
  accountsUrl: string;
  apiUrl: string;
};

export const ZOHO_DATA_CENTERS: ZohoDataCenter[] = [
  {
    label: 'United States (zoho.com)',
    value: 'com',
    accountsUrl: 'https://accounts.zoho.com',
    apiUrl: 'https://www.zohoapis.com',
  },
  {
    label: 'Europe (zoho.eu)',
    value: 'eu',
    accountsUrl: 'https://accounts.zoho.eu',
    apiUrl: 'https://www.zohoapis.eu',
  },
  {
    label: 'Saudi Arabia (zoho.sa)',
    value: 'sa',
    accountsUrl: 'https://accounts.zoho.sa',
    apiUrl: 'https://www.zohoapis.sa',
  },
  {
    label: 'India (zoho.in)',
    value: 'in',
    accountsUrl: 'https://accounts.zoho.in',
    apiUrl: 'https://www.zohoapis.in',
  },
  {
    label: 'United Kingdom (zoho.uk)',
    value: 'uk',
    accountsUrl: 'https://accounts.zoho.uk',
    apiUrl: 'https://www.zohoapis.uk',
  },
  {
    label: 'Australia (zoho.com.au)',
    value: 'com.au',
    accountsUrl: 'https://accounts.zoho.com.au',
    apiUrl: 'https://www.zohoapis.com.au',
  },
  {
    label: 'Japan (zoho.jp)',
    value: 'jp',
    accountsUrl: 'https://accounts.zoho.jp',
    apiUrl: 'https://www.zohoapis.jp',
  },
  {
    label: 'Canada (zohocloud.ca)',
    value: 'ca',
    accountsUrl: 'https://accounts.zohocloud.ca',
    apiUrl: 'https://www.zohoapis.ca',
  },
  {
    label: 'China (zoho.com.cn)',
    value: 'com.cn',
    accountsUrl: 'https://accounts.zoho.com.cn',
    apiUrl: 'https://www.zohoapis.com.cn',
  },
];

export const ZOHO_DATA_CENTER_OPTIONS = ZOHO_DATA_CENTERS.map(
  ({ label, value }) => ({
    label,
    value,
  }),
);

export const findZohoDataCenter = (value: string | undefined): ZohoDataCenter =>
  ZOHO_DATA_CENTERS.find((dataCenter) => dataCenter.value === value?.trim()) ??
  ZOHO_DATA_CENTERS[0];
