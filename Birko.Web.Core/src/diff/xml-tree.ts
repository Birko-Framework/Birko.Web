/**
 * An XML body as a JSON-like tree, so `diffJson` can compare XML responses — and the same body as pretty-printed
 * lines that know which tree path they show, so a viewer can mark the original XML with the diff's result.
 *
 * The tree is the ROOT element's content (a JSON body has no root name): an element is a field, a text-only element a
 * string (values stay text), an empty element `''`, `xsi:nil="true"` null, an attribute `@name`. Namespace
 * declarations and `xsi:*` attributes are dropped.
 *
 * A list is an element whose children all share one name and are complex or simple array items:
 * `<Contacts><Contact>…</Contact></Contacts>` is `Contacts: [ … ]` with one item too, so a list of one and a list of
 * two compare item by item. A single leaf child stays a field (`<TurnoverCategory><Year>` is an object). A name
 * repeated among other fields keeps every occurrence, as an array.
 *
 * **Every value is a string.** The tree of an XML body therefore does not compare equal to the JSON body of the same
 * data (`"3"` vs `3`, `"false"` vs `false`); compare XML with XML.
 */
import type { JsonPathSegment } from './json-diff.js';

const XSI = 'http://www.w3.org/2001/XMLSchema-instance';
const XMLNS = 'http://www.w3.org/2000/xmlns/';

/** The item names XmlSerializer writes for arrays of simple values (`string[]` → `<string>`). */
export const DEFAULT_XML_SIMPLE_ITEM_NAMES: readonly string[] = ['string', 'int', 'long', 'decimal', 'double', 'boolean', 'dateTime'];

export interface XmlTreeOptions {
  /** Child names that make a single-child element a list. Default: XmlSerializer's ({@link DEFAULT_XML_SIMPLE_ITEM_NAMES}). */
  simpleItemNames?: readonly string[];
  /** `xsi:nil="true"` reads as `null` (default `true`); `false` reads it as an empty element. */
  nilAsNull?: boolean;
  /** Prefix of an attribute's key. Default `'@'`. */
  attributePrefix?: string;
  /**
   * Key of an element's text where it also has attributes or child elements (`<Price currency="EUR">10</Price>` →
   * `{ "@currency": "EUR", "#text": "10" }`). Default `'#text'`. Text is never dropped.
   */
  textKey?: string;
}

/** One line of {@link xmlToLines}. `paths` are the tree paths the line shows: an element, and its attributes. */
export interface XmlLine {
  text: string;
  paths: JsonPathSegment[][];
}

interface Resolved {
  simple: Set<string>;
  nilAsNull: boolean;
  attr: string;
  text: string;
}

const resolve = (o: XmlTreeOptions = {}): Resolved => ({
  simple: new Set(o.simpleItemNames ?? DEFAULT_XML_SIMPLE_ITEM_NAMES),
  nilAsNull: o.nilAsNull ?? true,
  attr: o.attributePrefix ?? '@',
  text: o.textKey ?? '#text',
});

function parse(text: string): Element | null {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0 || !doc.documentElement) return null;
  return doc.documentElement;
}

const dataAttributes = (el: Element) =>
  [...el.attributes].filter((a) => a.namespaceURI !== XSI && a.namespaceURI !== XMLNS && a.prefix !== 'xmlns' && a.name !== 'xmlns');

const isNil = (el: Element, o: Resolved) => o.nilAsNull && el.getAttributeNS(XSI, 'nil') === 'true';

/** Text directly inside `el` (not in its child elements), trimmed. */
const ownText = (el: Element) =>
  [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE || n.nodeType === Node.CDATA_SECTION_NODE)
    .map((n) => n.nodeValue ?? '').join('').trim();

function isList(children: Element[], o: Resolved): boolean {
  if (children.length === 0) return false;
  const name = children[0].localName;
  if (!children.every((c) => c.localName === name)) return false;
  return children.length > 1 || children[0].children.length > 0 || o.simple.has(name);
}

type Shape =
  | { kind: 'nil' }
  | { kind: 'text' }
  | { kind: 'list'; children: Element[] }
  | { kind: 'object'; attrs: Attr[]; text: string; fields: Map<string, Element[]> };

function shapeOf(el: Element, o: Resolved): Shape {
  if (isNil(el, o)) return { kind: 'nil' };
  const children = [...el.children];
  const attrs = dataAttributes(el);
  if (children.length === 0 && attrs.length === 0) return { kind: 'text' };
  const text = ownText(el);
  if (attrs.length === 0 && text === '' && isList(children, o)) return { kind: 'list', children };
  const fields = new Map<string, Element[]>();
  for (const c of children) {
    const list = fields.get(c.localName);
    if (list) list.push(c); else fields.set(c.localName, [c]);
  }
  return { kind: 'object', attrs, text, fields };
}

function value(el: Element, o: Resolved): unknown {
  const s = shapeOf(el, o);
  if (s.kind === 'nil') return null;
  if (s.kind === 'text') return el.textContent ?? '';
  if (s.kind === 'list') return s.children.map((c) => value(c, o));
  const obj: Record<string, unknown> = {};
  for (const a of s.attrs) obj[`${o.attr}${a.localName}`] = a.value;
  if (s.text !== '') obj[o.text] = s.text;
  for (const [name, els] of s.fields) obj[name] = els.length === 1 ? value(els[0], o) : els.map((c) => value(c, o));
  return obj;
}

/** Converts an XML body to a JSON-like tree (see the module doc). Returns `null` when the text is not XML. */
export function xmlToTree(text: string, options?: XmlTreeOptions): unknown {
  const root = parse(text);
  return root ? value(root, resolve(options)) : null;
}

const escText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s: string) => escText(s).replace(/"/g, '&quot;');

/**
 * Pretty-prints an XML body, two spaces per level, one line per element (a text-only element stays on one line), and
 * tags each line with the {@link xmlToTree} paths it shows, so a viewer can mark lines by a diff of the trees. Returns
 * `null` when the text is not XML. Comments and processing instructions are kept and belong to no path.
 */
export function xmlToLines(text: string, options?: XmlTreeOptions): XmlLine[] | null {
  const root = parse(text);
  if (!root) return null;
  const o = resolve(options);
  const lines: XmlLine[] = [];
  const decl = /^\s*(<\?xml[^?]*\?>)/.exec(text);
  if (decl) lines.push({ text: decl[1], paths: [] });

  const openTag = (el: Element, close: string) => {
    const attrs = [...el.attributes].map((a) => ` ${a.name}="${escAttr(a.value)}"`).join('');
    return `<${el.tagName}${attrs}${close}`;
  };
  const attrPaths = (el: Element, path: JsonPathSegment[]) =>
    isNil(el, o) ? [] : dataAttributes(el).map((a) => [...path, `${o.attr}${a.localName}`]);

  const walk = (el: Element, path: JsonPathSegment[], indent: string) => {
    const s = shapeOf(el, o);
    const own = [path, ...attrPaths(el, path)];
    const nodes = [...el.childNodes].filter((n) =>
      n.nodeType === Node.ELEMENT_NODE || n.nodeType === Node.COMMENT_NODE || n.nodeType === Node.PROCESSING_INSTRUCTION_NODE
      || ((n.nodeType === Node.TEXT_NODE || n.nodeType === Node.CDATA_SECTION_NODE) && (n.nodeValue ?? '').trim() !== ''));
    if (nodes.length === 0) { lines.push({ text: `${indent}${openTag(el, '/>')}`, paths: own }); return; }
    if (el.children.length === 0 && nodes.every((n) => n.nodeType === Node.TEXT_NODE || n.nodeType === Node.CDATA_SECTION_NODE)) {
      const inner = nodes.map((n) => n.nodeType === Node.CDATA_SECTION_NODE ? `<![CDATA[${n.nodeValue ?? ''}]]>` : escText((n.nodeValue ?? '').trim())).join('');
      const textPath = s.kind === 'object' ? [[...path, o.text]] : [];
      lines.push({ text: `${indent}${openTag(el, '>')}${inner}</${el.tagName}>`, paths: [...own, ...textPath] });
      return;
    }
    lines.push({ text: `${indent}${openTag(el, '>')}`, paths: own });
    const inner = `${indent}  `;
    const seen = new Map<string, number>();
    let index = 0;
    for (const n of nodes) {
      if (n.nodeType === Node.ELEMENT_NODE) {
        const c = n as Element;
        let childPath: JsonPathSegment[];
        if (s.kind === 'list') childPath = [...path, index++];
        else if (s.kind === 'object') {
          const k = seen.get(c.localName) ?? 0;
          seen.set(c.localName, k + 1);
          childPath = (s.fields.get(c.localName)?.length ?? 0) > 1 ? [...path, c.localName, k] : [...path, c.localName];
        } else childPath = path; // nil: the children are not in the tree; mark them with the element
        walk(c, childPath, inner);
      } else if (n.nodeType === Node.COMMENT_NODE) {
        lines.push({ text: `${inner}<!--${n.nodeValue ?? ''}-->`, paths: [] });
      } else if (n.nodeType === Node.PROCESSING_INSTRUCTION_NODE) {
        const pi = n as ProcessingInstruction;
        lines.push({ text: `${inner}<?${pi.target} ${pi.data}?>`, paths: [] });
      } else {
        const t = n.nodeType === Node.CDATA_SECTION_NODE ? `<![CDATA[${n.nodeValue ?? ''}]]>` : escText((n.nodeValue ?? '').trim());
        lines.push({ text: `${inner}${t}`, paths: s.kind === 'object' ? [[...path, o.text]] : [path] });
      }
    }
    lines.push({ text: `${indent}</${el.tagName}>`, paths: [path] });
  };
  walk(root, [], '');
  return lines;
}
