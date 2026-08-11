import type { ApiResponse } from './api-client.js';

/**
 * Standard paginated response envelope returned by Birko API endpoints.
 * Endpoints may return either a raw array or this wrapper — use unwrapList()
 * to handle both transparently.
 */
export interface PagedResult<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
}

/**
 * Extract the item array from an API response that returns either:
 *  - a raw array:            T[]
 *  - a paged envelope:       PagedResult<T>  ({ items, totalCount, page, pageSize })
 *  - a keyed object:         { [dataKey]: T[] }  (pass dataKey as second arg)
 *
 * Returns [] on missing / null data so callers never have to null-check.
 *
 * @example
 * const resp = await api.get<Product[]>('api/products');
 * const items = unwrapList(resp);
 *
 * @example
 * const resp = await api.get('api/products');
 * const items = unwrapList<Product>(resp, 'results');
 */
export function unwrapList<T>(
  response: ApiResponse<unknown>,
  dataKey?: string,
): T[] {
  const data = response.data;
  if (!data) return [];
  if (Array.isArray(data)) return data as T[];
  if (typeof data !== 'object') return [];

  // Named key override (e.g. { results: [...] })
  if (dataKey) {
    const keyed = (data as Record<string, unknown>)[dataKey];
    return Array.isArray(keyed) ? (keyed as T[]) : [];
  }

  // Standard PagedResult envelope
  const paged = data as Partial<PagedResult<T>>;
  if (Array.isArray(paged.items)) return paged.items;

  return [];
}

/**
 * Extract the TOTAL row count from an API response — the companion to unwrapList().
 *
 * Use this for any derived stat ("N orders", a KPI tile, an option count). Taking
 * `unwrapList(resp).length` instead silently undercounts the moment the server pages or
 * clamps `pageSize`, and the UI has no way to tell a full page from a truncated one.
 * With this helper the cheapest correct count is `?pageSize=1` plus unwrapTotal().
 *
 * Resolution order:
 *  - paged envelope   PagedResult<T>  → `totalCount` (the server's true total)
 *  - raw array        T[]             → `length` (unpaged endpoint: length IS the total)
 *  - keyed object     { [dataKey]: T[] } → that array's `length`
 *  - missing / null                   → 0
 *
 * A paged envelope missing `totalCount` falls back to `items.length` rather than 0, so a
 * partially-shaped response degrades to the old behaviour instead of reading as empty.
 *
 * @example
 * // One row over the wire, exact total on the tile.
 * const resp = await api.get('api/orders?pageSize=1');
 * this.stats.totalOrders = unwrapTotal(resp);
 */
export function unwrapTotal(
  response: ApiResponse<unknown>,
  dataKey?: string,
): number {
  const data = response.data;
  if (!data) return 0;
  if (Array.isArray(data)) return data.length;
  if (typeof data !== 'object') return 0;

  if (dataKey) {
    const keyed = (data as Record<string, unknown>)[dataKey];
    return Array.isArray(keyed) ? keyed.length : 0;
  }

  const paged = data as Partial<PagedResult<unknown>>;
  if (typeof paged.totalCount === 'number') return paged.totalCount;
  if (Array.isArray(paged.items)) return paged.items.length;

  return 0;
}

/**
 * Extract a human-readable error message from an API error response body.
 *
 * Handles the following formats (in order):
 *  1. ASP.NET ProblemDetails — `{ title, detail }`
 *  2. Custom error wrapper  — `{ error: { message } }` or `{ error: string }`
 *  3. Flat message field    — `{ message }`
 *  4. Plain string body
 *  5. Fallback              — `fallback` parameter (default: 'An unexpected error occurred')
 *
 * @example
 * const resp = await api.post('api/items', payload);
 * if (!resp.ok) toast.error(apiErrorMessage(resp.data));
 */
export function apiErrorMessage(
  data: unknown,
  fallback = 'An unexpected error occurred',
): string {
  if (!data) return fallback;
  if (typeof data === 'string' && data.trim()) return data;
  if (typeof data !== 'object') return fallback;

  const obj = data as Record<string, unknown>;

  // ASP.NET ProblemDetails: detail > title
  if (typeof obj['detail'] === 'string' && obj['detail']) return obj['detail'];
  if (typeof obj['title'] === 'string' && obj['title']) return obj['title'];

  // { error: { message } }
  if (obj['error'] && typeof obj['error'] === 'object') {
    const err = obj['error'] as Record<string, unknown>;
    if (typeof err['message'] === 'string' && err['message']) return err['message'];
  }

  // { error: string }
  if (typeof obj['error'] === 'string' && obj['error']) return obj['error'];

  // { message: string }
  if (typeof obj['message'] === 'string' && obj['message']) return obj['message'];

  return fallback;
}

/**
 * Append a query string to a URL, choosing the separator by what the URL already carries.
 *
 * Extracted because all three clients in this folder need it and only two of them got it right:
 * `ApiClient.get` appended '?' unconditionally, so an endpoint that already had a query string came out as
 * `...?scopeId=X?page=1&pageSize=20`. The server then read `scopeId` as `X?page=1` and answered with an
 * EMPTY list — no error, no failing request, just a screen that says "no data" while the API has rows.
 * `SseClient` and `WsClient` had been picking the separator correctly all along, three lines apart.
 *
 * `query` is taken already-encoded (a `URLSearchParams.toString()`, or a hand-built `k=v`), because the
 * two token callers build a single pair and the paging caller builds many. An empty `query` returns `url`
 * untouched, so a caller need not guard.
 */
export function appendQuery(url: string, query: string): string {
  if (!query) return url;
  return url + (url.includes('?') ? '&' : '?') + query;
}
