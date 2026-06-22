/**
 * Build a single-entity URL from a (possibly filtered) list endpoint.
 *
 * The base pages reuse the list `endpoint` for get-by-id / update / delete by
 * appending `/{id}`. When `endpoint` carries a query string (e.g. a filtered
 * list like `api/communication/logs?buildingId=...`), a naive `${endpoint}/${id}`
 * would splice the id *into the query value* (`...?buildingId=<bid>/<id>`) and the
 * server fails to bind the param. This inserts the id into the path, before the
 * query, and preserves the query (harmless — get-by-id ignores unbound params):
 *   `api/communication/logs/<id>?buildingId=<bid>`
 *
 * Endpoints without a query string behave exactly as before (`${endpoint}/${id}`).
 */
export function entityUrl(endpoint: string, id: string): string {
  const q = endpoint.indexOf('?');
  return q === -1
    ? `${endpoint}/${id}`
    : `${endpoint.slice(0, q)}/${id}${endpoint.slice(q)}`;
}
