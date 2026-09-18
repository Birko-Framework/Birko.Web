// Driver-agnostic API-response helpers — safe to import from either lane (no playwright/puppeteer deps).

/**
 * Read the id of a just-created entity from a create-endpoint response body, tolerating every shape
 * a Birko API returns:
 *   - a RAW GUID STRING body (`"38538467-…"`) — what `ToCreatedResult` emits for many endpoints
 *     (e.g. POST /api/products, /api/buildings, /api/sites, /api/floors, /api/spaces),
 *   - `{ id }` / `{ Id }`,
 *   - a `{ data: … }` envelope wrapping any of the above (`{ data: { id } }`, `{ data: "guid" }`).
 *
 * Returns undefined when no id can be found. Use this for self-seed helpers instead of `body?.id`
 * or `unwrap(body)?.id`, which silently return undefined on the raw-string shape and make the seed
 * look like it "couldn't create" the prerequisite (→ a misleading graceful skip).
 */
export function idFrom(body: unknown): string | undefined {
  if (typeof body === 'string') return body || undefined;
  if (body && typeof body === 'object') {
    const b = body as Record<string, any>;
    return b.id ?? b.Id ?? b.data?.id ?? b.data?.Id ?? (typeof b.data === 'string' ? b.data || undefined : undefined);
  }
  return undefined;
}
