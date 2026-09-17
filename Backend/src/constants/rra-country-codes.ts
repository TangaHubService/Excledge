/**
 * RRA VSDC Supported Country Codes (ISO 3166-1 alpha-2)
 * 
 * This list mirrors the RRA VSDC specification's country code table.
 * Rwanda is listed first as the default for locally sourced goods.
 * 
 * Source: RRA VSDC API Documentation v1.0.5
 * Used for: product origin (orgnNatCd), itemCd generation
 */
export const RRA_COUNTRY_CODES: Record<string, string> = {
  RW: 'Rwanda',
  UG: 'Uganda',
  KE: 'Kenya',
  TZ: 'Tanzania',
  BI: 'Burundi',
  CD: 'DR Congo',
  SS: 'South Sudan',
  ET: 'Ethiopia',
  EG: 'Egypt',
  ZA: 'South Africa',
  NG: 'Nigeria',
  GH: 'Ghana',
  MA: 'Morocco',
  TN: 'Tunisia',
  DZ: 'Algeria',
  SN: 'Senegal',
  CI: "Côte d'Ivoire",
  CM: 'Cameroon',
  ZM: 'Zambia',
  ZW: 'Zimbabwe',
  MW: 'Malawi',
  MZ: 'Mozambique',
  AO: 'Angola',
  NA: 'Namibia',
  BW: 'Botswana',
  AE: 'United Arab Emirates',
  SA: 'Saudi Arabia',
  TR: 'Turkey',
  IN: 'India',
  CN: 'China',
  JP: 'Japan',
  KR: 'South Korea',
  SG: 'Singapore',
  MY: 'Malaysia',
  ID: 'Indonesia',
  TH: 'Thailand',
  VN: 'Vietnam',
  PK: 'Pakistan',
  BD: 'Bangladesh',
  GB: 'United Kingdom',
  IE: 'Ireland',
  FR: 'France',
  DE: 'Germany',
  NL: 'Netherlands',
  BE: 'Belgium',
  IT: 'Italy',
  ES: 'Spain',
  PT: 'Portugal',
  CH: 'Switzerland',
  SE: 'Sweden',
  NO: 'Norway',
  DK: 'Denmark',
  FI: 'Finland',
  PL: 'Poland',
  RU: 'Russia',
  UA: 'Ukraine',
  US: 'United States',
  CA: 'Canada',
  MX: 'Mexico',
  BR: 'Brazil',
  AR: 'Argentina',
  AU: 'Australia',
  NZ: 'New Zealand',
};

/** Array of valid RRA country code keys for validation */
export const VALID_RRA_COUNTRY_CODES: string[] = Object.keys(RRA_COUNTRY_CODES);

/** Default country code (Rwanda) */
export const DEFAULT_RRA_COUNTRY_CODE = 'RW';

/**
 * Check if a country code is valid per RRA VSDC specification
 */
export function isValidRraCountryCode(code: string): boolean {
  return code in RRA_COUNTRY_CODES;
}

/**
 * Get the country name for a valid RRA country code
 */
export function getRraCountryName(code: string): string | undefined {
  return RRA_COUNTRY_CODES[code];
}

/**
 * Get all RRA country codes as options for dropdowns
 */
export function getRraCountryCodeOptions(): Array<{ value: string; label: string }> {
  return Object.entries(RRA_COUNTRY_CODES).map(([value, label]) => ({
    value,
    label: `${label} (${value})`,
  }));
}