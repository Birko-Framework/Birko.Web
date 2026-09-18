import type { ApiClient } from 'birko-web-core/http';
import { apiErrorMessage } from 'birko-web-core/http';
import type { BForm } from '../inputs/b-form.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface SelectOption {
  value: string;
  label: string;
}

export interface LoadOptionsConfig {
  /** Response key holding the options array (e.g. 'items'). Omit for raw array. */
  dataKey?: string;
  /** Property to use as the option value (default: 'id'). */
  valueKey?: string;
  /** Property to use as the option label (default: 'name'). */
  labelKey?: string;
  /** Extra query params appended to the request. */
  params?: Record<string, string>;
}

export interface WireSearchConfig {
  /** Debounce delay in ms before sending the search request (default: 300). */
  debounce?: number;
  /** Query param name for the search term (default: 'search'). */
  searchParam?: string;
  /** Property to use as the option value (default: 'id'). */
  valueKey?: string;
  /** Property to use as the option label (default: 'name'). */
  labelKey?: string;
  /** Extra static params merged with every request. */
  params?: Record<string, string>;
}

// ── showFormError ──────────────────────────────────────────────────────────

/**
 * Map an API error response onto a `<b-form>` element.
 *
 * Behaviour:
 *  1. If the response body contains an `errors` map (ASP.NET ModelState format:
 *     `{ errors: { fieldName: ['message', ...] } }`), each entry is set as a
 *     field-level error via `form.setFieldError()`.
 *  2. Otherwise the top-level error message (via `apiErrorMessage`) is set on
 *     the field named by `fallbackField` (default `'_form'`).  Consumers can
 *     add a hidden field called `_form` to their schema to surface this, or
 *     pass any other field name to receive the message.
 *
 * @example
 * const resp = await api.post('api/users', payload);
 * if (!resp.ok) { showFormError(form, resp.data); return; }
 *
 * @example — custom fallback field
 * if (!resp.ok) { showFormError(form, resp.data, 'email'); return; }
 */
export function showFormError(
  form: BForm,
  data: unknown,
  fallbackField = '_form',
): void {
  if (!data || typeof data !== 'object') {
    form.setFieldError(fallbackField, apiErrorMessage(data));
    return;
  }

  const obj = data as Record<string, unknown>;

  // ASP.NET ModelState: { errors: { field: ['msg'] } }
  if (obj['errors'] && typeof obj['errors'] === 'object' && !Array.isArray(obj['errors'])) {
    const errors = obj['errors'] as Record<string, unknown>;
    let hadField = false;
    for (const [field, messages] of Object.entries(errors)) {
      const msg = Array.isArray(messages)
        ? String(messages[0] ?? '')
        : String(messages ?? '');
      if (msg) {
        // ASP.NET capitalises the first letter; normalise to camelCase field name
        const camelField = field.charAt(0).toLowerCase() + field.slice(1);
        form.setFieldError(camelField, msg);
        hadField = true;
      }
    }
    if (hadField) return;
  }

  // Generic error message on the fallback field
  form.setFieldError(fallbackField, apiErrorMessage(data));
}

// ── loadOptions ────────────────────────────────────────────────────────────

/**
 * Fetch a list of items from `endpoint` and convert them to `SelectOption[]`.
 *
 * Works with both raw arrays and PagedResult envelopes.  Returns `[]` on error
 * so callers don't need to null-check.
 *
 * @example
 * const options = await loadOptions(api, 'api/categories');
 * form.setFieldOptions('categoryId', options);
 *
 * @example — custom keys
 * const options = await loadOptions(api, 'api/units', {
 *   valueKey: 'code',
 *   labelKey: 'description',
 * });
 */
export async function loadOptions(
  api: ApiClient,
  endpoint: string,
  config: LoadOptionsConfig = {},
): Promise<SelectOption[]> {
  const {
    dataKey,
    valueKey = 'id',
    labelKey = 'name',
    params,
  } = config;

  const resp = await api.get<unknown>(endpoint, params);
  if (!resp.ok || !resp.data) return [];

  let items: unknown[] = [];
  if (Array.isArray(resp.data)) {
    items = resp.data;
  } else if (typeof resp.data === 'object') {
    const obj = resp.data as Record<string, unknown>;
    if (dataKey && Array.isArray(obj[dataKey])) {
      items = obj[dataKey] as unknown[];
    } else if (Array.isArray(obj['items'])) {
      items = obj['items'] as unknown[];
    }
  }

  return items.map((item) => {
    const obj = (item ?? {}) as Record<string, unknown>;
    return {
      value: String(obj[valueKey] ?? ''),
      label: String(obj[labelKey] ?? ''),
    };
  });
}

// ── wireSearchableSelect ───────────────────────────────────────────────────

/**
 * Attach a debounced search handler to a select field inside `<b-form>`.
 *
 * When the user types in the search box the handler fires `api.get(endpoint)`
 * with the search term as a query param and updates the field's options via
 * `form.setFieldOptions()`.
 *
 * Returns an **unsubscribe function** — call it in `onUnmount` to prevent
 * memory leaks.
 *
 * @example
 * protected onMount() {
 *   const form = this.$<BForm>('b-form')!;
 *   const unsub = wireSearchableSelect(form, 'customerId', api, 'api/customers');
 *   this._cleanups.push(unsub);
 * }
 *
 * @example — custom keys + extra params
 * wireSearchableSelect(form, 'productId', api, 'api/products', {
 *   valueKey: 'sku',
 *   labelKey: 'description',
 *   params: { active: 'true' },
 * });
 */
export function wireSearchableSelect(
  form: BForm,
  fieldName: string,
  api: ApiClient,
  endpoint: string,
  config: WireSearchConfig = {},
): () => void {
  const {
    debounce = 300,
    searchParam = 'search',
    valueKey = 'id',
    labelKey = 'name',
    params: staticParams = {},
  } = config;

  let timer: ReturnType<typeof setTimeout> | null = null;

  const handler = (value: unknown) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      timer = null;
      const search = value != null ? String(value) : '';
      const queryParams: Record<string, string> = { ...staticParams, [searchParam]: search };
      const options = await loadOptions(api, endpoint, { valueKey, labelKey, params: queryParams });
      form.setFieldOptions(fieldName, options);
    }, debounce);
  };

  // onFieldChange returns an unsubscribe function
  const unsub = form.onFieldChange(fieldName, handler);

  return () => {
    if (timer) clearTimeout(timer);
    unsub();
  };
}
