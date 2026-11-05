import { getI18n, t } from 'birko-web-core';

/**
 * Countries for `b-country-select` and for read-only places that print a stored code (TASK-817).
 *
 * The value is always an ISO 3166-1 alpha-2 code, upper case. Names are not stored here: they come from
 * `Intl.DisplayNames` in the current i18n locale, so there is no name table to translate or keep current.
 */

/** Every officially assigned ISO 3166-1 alpha-2 code (249). */
export const COUNTRY_CODES: readonly string[] = (
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ '
  + 'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR '
  + 'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT '
  + 'JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY '
  + 'MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM '
  + 'PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW '
  + 'SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ '
  + 'UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'
).split(' ');

/** A named set of countries a multiple picker offers as one shortcut ("EU" adds all 27 member states). */
export interface CountryGroup {
  id: string;
  /** Shown on the shortcut. Resolved when shown, so it follows the locale. */
  label: () => string;
  codes: readonly string[];
}

const groups = new Map<string, CountryGroup>();

/**
 * Adds or replaces a group, offered by `<b-country-select multiple groups="…">` under its id. An app registers its own
 * (a shipping zone, "Benelux") once at startup.
 */
export function registerCountryGroup(group: CountryGroup): void {
  groups.set(group.id, { ...group, codes: group.codes.map(c => c.toUpperCase()) });
}

export function getCountryGroup(id: string): CountryGroup | undefined {
  return groups.get(id);
}

/** The 27 member states of the European Union (2026). Greece is GR, its ISO code, not the EU's own EL. */
registerCountryGroup({
  id: 'eu',
  label: () => t('bwc.country.groupEu', undefined, 'EU'),
  codes: 'AT BE BG CY CZ DE DK EE ES FI FR GR HR HU IE IT LT LU LV MT NL PL PT RO SE SI SK'.split(' '),
});

/** Whether `value` is a two-letter code (any case). Says nothing about whether the code is assigned. */
export function isCountryCodeShape(value: string): boolean {
  return /^[A-Za-z]{2}$/.test(value);
}

/**
 * A stored value as the pickers hold it: trimmed, and a two-letter code upper-cased. Anything else (an old row holding
 * "Slovakia") is kept as given — upper-casing it would change the stored text, dropping it would lose it.
 */
export function normalizeCountryValue(value: string): string {
  const v = value.trim();
  return isCountryCodeShape(v) ? v.toUpperCase() : v;
}

const displayNames = new Map<string, Intl.DisplayNames | null>();

function namesFor(locale: string): Intl.DisplayNames | null {
  if (!displayNames.has(locale)) {
    let dn: Intl.DisplayNames | null = null;
    try { dn = new Intl.DisplayNames([locale, 'en'], { type: 'region', fallback: 'none' }); } catch { dn = null; }
    displayNames.set(locale, dn);
  }
  return displayNames.get(locale) ?? null;
}

function currentLocale(): string {
  try { return getI18n().locale || 'en'; } catch { return 'en'; }
}

/**
 * The country's name in `locale` (default: the current i18n locale): `countryName('SK')` → "Slovensko" in sk. A value
 * that is not a code, or a code the runtime cannot name, comes back as given, so a read-only cell never shows blank.
 */
export function countryName(code: string | null | undefined, locale?: string): string {
  if (!code) return '';
  const value = normalizeCountryValue(code);
  if (!isCountryCodeShape(value)) return value;
  return namesFor(locale ?? currentLocale())?.of(value) ?? value;
}

/** The flag emoji of a two-letter code (two regional indicator symbols), or '' for anything else. */
export function countryFlag(code: string | null | undefined): string {
  const value = normalizeCountryValue(code ?? '');
  if (!isCountryCodeShape(value)) return '';
  return String.fromCodePoint(...[...value].map(c => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** "🇸🇰 Slovensko (SK)": what the picker shows. `flag: false` drops the emoji; a non-code value is shown as itself. */
export function countryLabel(code: string, options: { locale?: string; flag?: boolean } = {}): string {
  const value = normalizeCountryValue(code);
  if (!isCountryCodeShape(value)) return value;
  const name = countryName(value, options.locale);
  const text = name === value ? value : `${name} (${value})`;
  return options.flag === false ? text : `${countryFlag(value)} ${text}`;
}
