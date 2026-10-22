/**
 * Structural diff of two JSON values — the engine behind `b-json-diff`, and usable on its own (no DOM).
 *
 * The result carries the same comparison three ways: a flat `changes` list keyed by path (for reports and
 * bulk comparison), a `tree` mirroring the union of both values (for rendering), and `summary` counts.
 *
 * Paths read like property access: `Items[2].Ref`, with a key that is not an identifier quoted as
 * `["a.b"]`, and the root as `''`. Patterns used by `ignore`, `normalize` and `arrays` use the same syntax
 * plus wildcards: `*` is any one segment (key or index), `[*]` any one index, `**` any number of segments
 * (including none). A pattern matches the WHOLE path, so `*.Url` is a `Url` one level down and `**.Url` is
 * a `Url` at any depth.
 */

export type JsonPathSegment = string | number;

export type JsonChangeKind = 'added' | 'removed' | 'changed';

/** One difference. `oldValue` is side A's value, `newValue` side B's, both as received (before normalizing). */
export interface JsonChange {
  kind: JsonChangeKind;
  path: string;
  segments: JsonPathSegment[];
  /** Side A's path, present only where it differs from `path` — an item paired by `key` or `unordered`. */
  oldPath?: string;
  oldValue?: unknown;
  newValue?: unknown;
}

export type JsonDiffStatus = 'equal' | 'added' | 'removed' | 'changed' | 'modified' | 'ignored';

export interface JsonDiffSummary {
  added: number;
  removed: number;
  changed: number;
  /** `added + removed + changed`. */
  total: number;
}

/**
 * A node of the merged tree. `modified` is a container whose own type matches on both sides but which holds a
 * difference somewhere below; `changed` is a value (or a container whose type differs) replaced outright. The
 * children of an `added` / `removed` container repeat its status so a renderer can show its content; they are
 * not counted again in `summary`.
 */
export interface JsonDiffNode {
  key?: JsonPathSegment;
  path: string;
  segments: JsonPathSegment[];
  /**
   * Where the node sits in side A, present only where it differs from `segments`: below an array paired by
   * `key` or `unordered`, a pair (and everything in it) is placed at its side-B index and a removed item at
   * the end, under its side-A index.
   */
  oldSegments?: JsonPathSegment[];
  status: JsonDiffStatus;
  /** The node's shape — side B's when it exists, otherwise side A's. */
  type: 'object' | 'array' | 'value';
  hasOld: boolean;
  hasNew: boolean;
  oldValue?: unknown;
  newValue?: unknown;
  children?: JsonDiffNode[];
  /** Counts for this node and everything below it. */
  summary: JsonDiffSummary;
}

export interface JsonNormalizer {
  /** Path pattern the normalizer applies to. */
  path: string;
  /** Returns the value to compare instead. Applied to both sides; several matching normalizers chain in order. */
  normalize: (value: unknown, path: string) => unknown;
}

export interface JsonArrayRule {
  /** Path pattern of the array this rule governs. */
  path: string;
  /**
   * `index` (the default for every array) compares item n with item n. `unordered` pairs each item of B with
   * an equal, not yet paired item of A, and reports the rest as added / removed.
   */
  match?: 'index' | 'unordered';
  /**
   * Pairs items by this property (or by what the function returns) instead, so a reordered list of records
   * diffs record by record. Takes precedence over `match`. Items without a key fall back to `unordered`.
   */
  key?: string | ((item: unknown) => unknown);
}

export interface JsonDiffOptions {
  /** Path patterns left out of the comparison. They appear in the tree as `ignored` and are never counted. */
  ignore?: string[];
  normalize?: JsonNormalizer[];
  arrays?: JsonArrayRule[];
}

export interface JsonDiffResult {
  equal: boolean;
  changes: JsonChange[];
  tree: JsonDiffNode;
  summary: JsonDiffSummary;
}

type Token = { kind: 'key'; key: string } | { kind: 'index'; index: number } | { kind: 'any' } | { kind: 'anyIndex' } | { kind: 'deep' };

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** Formats segments as a path string: `['Items', 2, 'Ref']` → `Items[2].Ref`. */
export function formatJsonPath(segments: readonly JsonPathSegment[]): string {
  let out = '';
  for (const s of segments) {
    if (typeof s === 'number') out += `[${s}]`;
    else if (IDENT.test(s)) out += out === '' ? s : `.${s}`;
    else out += `[${JSON.stringify(s)}]`;
  }
  return out;
}

const patternCache = new Map<string, Token[]>();

function parsePattern(pattern: string): Token[] {
  const cached = patternCache.get(pattern);
  if (cached) return cached;
  const tokens: Token[] = [];
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === '.') { i++; continue; }
    if (c === '[') {
      const close = pattern[i + 1] === '"' ? findQuoteEnd(pattern, i + 1) + 1 : pattern.indexOf(']', i);
      if (close < 0 || pattern[close] !== ']') throw new Error(`Invalid JSON path pattern: ${pattern}`);
      const inner = pattern.slice(i + 1, close);
      if (inner === '*') tokens.push({ kind: 'anyIndex' });
      else if (/^\d+$/.test(inner)) tokens.push({ kind: 'index', index: Number(inner) });
      else if (inner.startsWith('"')) tokens.push({ kind: 'key', key: JSON.parse(inner) as string });
      else throw new Error(`Invalid JSON path pattern: ${pattern}`);
      i = close + 1;
      continue;
    }
    let end = i;
    while (end < pattern.length && pattern[end] !== '.' && pattern[end] !== '[') end++;
    const name = pattern.slice(i, end);
    tokens.push(name === '**' ? { kind: 'deep' } : name === '*' ? { kind: 'any' } : { kind: 'key', key: name });
    i = end;
  }
  patternCache.set(pattern, tokens);
  return tokens;
}

function findQuoteEnd(s: string, open: number): number {
  for (let i = open + 1; i < s.length; i++) {
    if (s[i] === '\\') { i++; continue; }
    if (s[i] === '"') return i;
  }
  return -1;
}

function matchTokens(tokens: Token[], ti: number, segs: readonly JsonPathSegment[], si: number): boolean {
  if (ti === tokens.length) return si === segs.length;
  const t = tokens[ti];
  if (t.kind === 'deep') {
    for (let k = si; k <= segs.length; k++) if (matchTokens(tokens, ti + 1, segs, k)) return true;
    return false;
  }
  if (si === segs.length) return false;
  const s = segs[si];
  const ok = t.kind === 'any'
    || (t.kind === 'anyIndex' && typeof s === 'number')
    || (t.kind === 'index' && s === t.index)
    || (t.kind === 'key' && s === t.key);
  return ok && matchTokens(tokens, ti + 1, segs, si + 1);
}

/** Whether a path (as segments) matches a pattern. Throws on a malformed pattern. */
export function matchJsonPath(pattern: string, segments: readonly JsonPathSegment[]): boolean {
  return matchTokens(parsePattern(pattern), 0, segments, 0);
}

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const shapeOf = (v: unknown): JsonDiffNode['type'] => Array.isArray(v) ? 'array' : isObject(v) ? 'object' : 'value';
const emptySummary = (): JsonDiffSummary => ({ added: 0, removed: 0, changed: 0, total: 0 });

const sameSegs = (x: readonly JsonPathSegment[], y: readonly JsonPathSegment[]) => x.length === y.length && x.every((s, i) => s === y[i]);
const oldSegs = (segs: JsonPathSegment[], segsA: JsonPathSegment[]) => sameSegs(segs, segsA) ? {} : { oldSegments: segsA };

function addInto(into: JsonDiffSummary, from: JsonDiffSummary) {
  into.added += from.added;
  into.removed += from.removed;
  into.changed += from.changed;
  into.total += from.total;
}

/** Diffs two JSON values. Side A is the "old" one (`oldValue`), side B the "new" one (`newValue`). */
export function diffJson(a: unknown, b: unknown, options: JsonDiffOptions = {}): JsonDiffResult {
  const ignore = options.ignore ?? [];
  const normalizers = options.normalize ?? [];
  const arrayRules = options.arrays ?? [];
  // Validate every pattern up front so a typo fails the call, not silently matches nothing.
  for (const p of [...ignore, ...normalizers.map((n) => n.path), ...arrayRules.map((r) => r.path)]) parsePattern(p);

  const isIgnored = (segs: JsonPathSegment[]) => ignore.some((p) => matchJsonPath(p, segs));
  const normalize = (v: unknown, segs: JsonPathSegment[], path: string) => {
    let out = v;
    for (const n of normalizers) if (matchJsonPath(n.path, segs)) out = n.normalize(out, path);
    return out;
  };
  const arrayRule = (segs: JsonPathSegment[]) => arrayRules.find((r) => matchJsonPath(r.path, segs));

  // One-sided subtree (added / removed): children repeat the status, only the root counts.
  const oneSided = (value: unknown, segs: JsonPathSegment[], segsA: JsonPathSegment[], status: 'added' | 'removed', counted: boolean): JsonDiffNode => {
    const path = formatJsonPath(segs);
    const ignored = isIgnored(status === 'removed' ? segsA : segs);
    const node: JsonDiffNode = {
      key: segs.at(-1), path, segments: segs, ...oldSegs(segs, segsA), status: ignored ? 'ignored' : status, type: shapeOf(value),
      hasOld: status === 'removed', hasNew: status === 'added', summary: emptySummary(),
    };
    if (status === 'removed') node.oldValue = value; else node.newValue = value;
    if (counted && !ignored) { node.summary[status] = 1; node.summary.total = 1; }
    if (Array.isArray(value)) node.children = value.map((v, i) => oneSided(v, [...segs, i], [...segsA, i], status, false));
    else if (isObject(value)) node.children = Object.keys(value).map((k) => oneSided(value[k], [...segs, k], [...segsA, k], status, false));
    return node;
  };

  const compare = (rawA: unknown, rawB: unknown, segs: JsonPathSegment[], segsA: JsonPathSegment[]): JsonDiffNode => {
    const path = formatJsonPath(segs);
    const base = { key: segs.at(-1), path, segments: segs, ...oldSegs(segs, segsA), hasOld: true, hasNew: true, oldValue: rawA, newValue: rawB };
    if (isIgnored(segs)) return { ...base, status: 'ignored', type: shapeOf(rawB), summary: emptySummary() };
    const na = normalize(rawA, segs, path);
    const nb = normalize(rawB, segs, path);
    const ta = shapeOf(na);
    const tb = shapeOf(nb);

    if (ta !== tb || ta === 'value') {
      const same = ta === tb && na === nb;
      const summary = emptySummary();
      if (!same) { summary.changed = 1; summary.total = 1; }
      return { ...base, status: same ? 'equal' : 'changed', type: tb, summary };
    }

    const children = ta === 'object'
      ? compareObjects(na as Record<string, unknown>, nb as Record<string, unknown>, segs, segsA)
      : compareArrays(na as unknown[], nb as unknown[], segs, segsA);
    const summary = emptySummary();
    for (const c of children) addInto(summary, c.summary);
    return { ...base, status: summary.total > 0 ? 'modified' : 'equal', type: tb, children, summary };
  };

  const compareObjects = (a: Record<string, unknown>, b: Record<string, unknown>, segs: JsonPathSegment[], segsA: JsonPathSegment[]) => {
    const out: JsonDiffNode[] = [];
    for (const k of Object.keys(b)) {
      out.push(Object.hasOwn(a, k) ? compare(a[k], b[k], [...segs, k], [...segsA, k]) : oneSided(b[k], [...segs, k], [...segsA, k], 'added', true));
    }
    for (const k of Object.keys(a)) if (!Object.hasOwn(b, k)) out.push(oneSided(a[k], [...segs, k], [...segsA, k], 'removed', true));
    return out;
  };

  const compareArrays = (a: unknown[], b: unknown[], segs: JsonPathSegment[], segsA: JsonPathSegment[]) => {
    const rule = arrayRule(segs);
    if (!rule || (rule.key === undefined && (rule.match ?? 'index') === 'index')) {
      const out: JsonDiffNode[] = [];
      const n = Math.max(a.length, b.length);
      for (let i = 0; i < n; i++) {
        if (i >= a.length) out.push(oneSided(b[i], [...segs, i], [...segsA, i], 'added', true));
        else if (i >= b.length) out.push(oneSided(a[i], [...segs, i], [...segsA, i], 'removed', true));
        else out.push(compare(a[i], b[i], [...segs, i], [...segsA, i]));
      }
      return out;
    }

    // Paired modes. A pair is reported at its side-B index, an unpaired A item at its side-A index.
    const pairOf = new Array<number>(b.length).fill(-1);
    const usedA = new Set<number>();
    const ruleKey = rule.key;
    const keyOf = ruleKey === undefined ? undefined
      : typeof ruleKey === 'function' ? ruleKey
      : (item: unknown) => isObject(item) ? item[ruleKey] : undefined;
    if (keyOf) {
      const byKey = new Map<unknown, number[]>();
      a.forEach((item, i) => {
        const k = keyOf(item);
        if (k === undefined) return;
        const list = byKey.get(k);
        if (list) list.push(i); else byKey.set(k, [i]);
      });
      b.forEach((item, j) => {
        const k = keyOf(item);
        const i = k === undefined ? undefined : byKey.get(k)?.shift();
        if (i !== undefined) { pairOf[j] = i; usedA.add(i); }
      });
    }
    // Unordered pass: everything still unpaired (all of it, or the keyless items) pairs with an equal item.
    b.forEach((item, j) => {
      if (pairOf[j] >= 0 || (keyOf && keyOf(item) !== undefined)) return;
      for (let i = 0; i < a.length; i++) {
        if (usedA.has(i) || (keyOf && keyOf(a[i]) !== undefined)) continue;
        if (compare(a[i], item, [...segs, j], [...segsA, i]).summary.total === 0) { pairOf[j] = i; usedA.add(i); break; }
      }
    });

    const out = b.map((item, j) => pairOf[j] >= 0
      ? compare(a[pairOf[j]], item, [...segs, j], [...segsA, pairOf[j]])
      : oneSided(item, [...segs, j], [...segsA, j], 'added', true));
    // A removed item is listed after the pairs under its side-A index, so its path can repeat a pair's.
    a.forEach((item, i) => { if (!usedA.has(i)) out.push(oneSided(item, [...segs, i], [...segsA, i], 'removed', true)); });
    return out;
  };

  const tree = compare(a, b, [], []);
  const changes: JsonChange[] = [];
  const collect = (node: JsonDiffNode) => {
    if (node.status === 'added' || node.status === 'removed' || node.status === 'changed') {
      if (node.summary.total === 0) return; // a one-sided child, already reported by its root
      const change: JsonChange = { kind: node.status, path: node.path, segments: node.segments };
      if (node.oldSegments) change.oldPath = formatJsonPath(node.oldSegments);
      if (node.hasOld) change.oldValue = node.oldValue;
      if (node.hasNew) change.newValue = node.newValue;
      changes.push(change);
      return;
    }
    node.children?.forEach(collect);
  };
  collect(tree);
  return { equal: tree.summary.total === 0, changes, tree, summary: { ...tree.summary } };
}
