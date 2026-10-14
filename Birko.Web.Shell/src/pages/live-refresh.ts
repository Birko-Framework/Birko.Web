/**
 * Live list refresh (TASK-583): a server announces that an entity changed, and an open `BaseListPage` showing that
 * entity type reloads through its normal, permission-checked API. The event carries ids only, never a row.
 *
 * The Shell opens no connection. The app registers where events come from, once:
 * ```ts
 * setEntityChangeSource((handler) => sse.on('entity-changed', handler));
 * ```
 * and a page opts in with `protected liveRefresh = { moduleId: 'warehouse', entityType: 'StockCard' }`.
 */

/** The `entity-changed` payload (contract decided in Symbio TASK-898). */
export interface EntityChangedEvent {
  moduleId: string;
  entityType: string;
  /** `null` when a bulk or filter-based write changed rows the producer did not enumerate. */
  entityGuid: string | null;
  kind: 'created' | 'updated' | 'deleted';
}

/** Subscribe a handler to raw `entity-changed` payloads; returns the unsubscribe. */
export type EntityChangeSource = (handler: (payload: unknown) => void) => () => void;

let source: EntityChangeSource | null = null;

/** Register (or, with `null`, clear) the app's source of `entity-changed` events. Call once at boot. */
export function setEntityChangeSource(next: EntityChangeSource | null): void {
  source = next;
}

/** The registered source, or `null`. */
export function getEntityChangeSource(): EntityChangeSource | null {
  return source;
}

const KINDS = new Set(['created', 'updated', 'deleted']);

/** Read a payload (an object, or its JSON text) as an `EntityChangedEvent`; anything malformed is `null`. */
export function parseEntityChangedEvent(payload: unknown): EntityChangedEvent | null {
  let p = payload;
  if (typeof p === 'string') {
    try { p = JSON.parse(p); } catch { return null; }
  }
  if (!p || typeof p !== 'object') return null;
  const o = p as Record<string, unknown>;
  if (typeof o.moduleId !== 'string' || !o.moduleId) return null;
  if (typeof o.entityType !== 'string' || !o.entityType) return null;
  if (o.entityGuid !== null && typeof o.entityGuid !== 'string') return null;
  if (typeof o.kind !== 'string' || !KINDS.has(o.kind)) return null;
  return { moduleId: o.moduleId, entityType: o.entityType, entityGuid: o.entityGuid, kind: o.kind as EntityChangedEvent['kind'] };
}
