/**
 * Fill `{name}` placeholders in a translation template — **in one pass**, and the one place that does it.
 *
 * One pass is the point. Replacing placeholder after placeholder rescans what earlier replacements inserted, so
 * a value that itself contains `{other}` is rewritten by the next one: `"{label}: {value}"` with the label
 * `"Barva {value}"` came out `Barva hnědá: hnědá` (FlowerFurStudio TASK-106, Birko TASK-551). Params are often
 * shop or user data, so that is a wrong text, not a cosmetic one. A single scan with a replacer function also
 * inserts every value literally: no `$&` / `$1` expansion, which `String.replace` applies to a string
 * replacement, and no regex built from a key.
 *
 * A placeholder with no matching param (or a `null` / `undefined` one) is left as it is — visible, rather than
 * silently blank or the word `undefined`. Only the params'
 * own keys count — `{constructor}` is not filled from `Object.prototype`.
 */
export function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{([\w.-]+)\}/g, (match, key: string) => {
    const v: unknown = Object.prototype.hasOwnProperty.call(params, key) ? params[key] : undefined;
    return v == null ? match : String(v);
  });
}
