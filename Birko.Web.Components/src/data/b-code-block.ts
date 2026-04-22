import { BaseComponent, define } from 'birko-web-core';
import {
  dataViewerCardSheet,
  dataViewerHeaderSheet,
  toolbarBtnSheet,
} from '../shared-styles';

type Lang = 'json' | 'js' | 'ts' | 'html' | 'xml' | 'css' | 'sql' | 'csharp' | 'bash' | 'plain';

const KEYWORDS: Record<string, string[]> = {
  js: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'new', 'class', 'extends', 'import', 'export', 'from', 'default', 'async', 'await', 'try', 'catch', 'finally', 'throw', 'typeof', 'instanceof', 'in', 'of', 'null', 'undefined', 'true', 'false', 'this', 'super'],
  ts: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'new', 'class', 'extends', 'implements', 'interface', 'type', 'enum', 'import', 'export', 'from', 'default', 'async', 'await', 'try', 'catch', 'finally', 'throw', 'typeof', 'instanceof', 'in', 'of', 'null', 'undefined', 'true', 'false', 'this', 'super', 'public', 'private', 'protected', 'readonly', 'static', 'abstract', 'as', 'void', 'never', 'any', 'unknown', 'string', 'number', 'boolean'],
  csharp: ['public', 'private', 'protected', 'internal', 'class', 'interface', 'struct', 'enum', 'namespace', 'using', 'return', 'if', 'else', 'for', 'foreach', 'while', 'do', 'switch', 'case', 'break', 'continue', 'new', 'var', 'null', 'true', 'false', 'this', 'base', 'abstract', 'virtual', 'override', 'sealed', 'static', 'readonly', 'const', 'async', 'await', 'try', 'catch', 'finally', 'throw', 'typeof', 'is', 'as', 'void', 'string', 'int', 'long', 'bool', 'decimal', 'double', 'float', 'object'],
  sql: ['SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'ON', 'GROUP', 'BY', 'ORDER', 'HAVING', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE', 'DROP', 'ALTER', 'INDEX', 'VIEW', 'AS', 'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'IS', 'NULL', 'DISTINCT', 'UNION', 'ALL', 'LIMIT', 'OFFSET', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END'],
  bash: ['if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'do', 'done', 'case', 'esac', 'function', 'return', 'export', 'local', 'echo', 'read', 'cd', 'ls', 'cat', 'grep', 'awk', 'sed'],
  css: [],
};

export class BCodeBlock extends BaseComponent {
  static get observedAttributes() {
    return ['language', 'code', 'wrap', 'show-line-numbers', 'no-copy', 'max-height', 'size', 'sticky-header'];
  }

  static get sharedStyles() {
    return [dataViewerCardSheet, dataViewerHeaderSheet, toolbarBtnSheet];
  }

  static get styles() {
    return `
      :host { display: block; position: relative; }
      .wrapper {
        position: relative;
        color: var(--b-text);
        font-family: var(--b-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
        font-size: var(--b-text-sm, 0.8125rem);
      }
      .data-viewer-header .title { font-weight: var(--b-font-weight-medium, 500); }
      pre {
        margin: 0;
        padding: var(--b-space-md, 0.75rem);
        overflow: auto;
        line-height: 1.5;
        tab-size: 2;
        white-space: pre;
      }
      :host([wrap]) pre { white-space: pre-wrap; word-break: break-word; }
      code { font: inherit; color: inherit; background: none; padding: 0; }
      .line { display: table-row; }
      .ln { display: table-cell; padding-right: var(--b-space-md, 0.75rem); text-align: right; color: var(--b-text-muted); user-select: none; }
      .code-col { display: table-cell; }
      :host([show-line-numbers]) pre > code { display: table; width: 100%; }
      :host([size="sm"]) .wrapper { font-size: var(--b-text-xs, 0.6875rem); }
      :host([size="lg"]) .wrapper { font-size: var(--b-text-base, 0.875rem); }
      .tok-str { color: var(--b-color-success, #10b981); }
      .tok-num { color: var(--b-color-warning, #f59e0b); }
      .tok-kw  { color: var(--b-color-primary, #3b82f6); font-weight: var(--b-font-weight-medium, 500); }
      .tok-com { color: var(--b-text-muted); font-style: italic; }
      .tok-tag { color: var(--b-color-primary, #3b82f6); }
      .tok-attr { color: var(--b-color-info, #06b6d4); }
      .tok-bool { color: var(--b-color-warning, #f59e0b); }
      .tok-null { color: var(--b-text-muted); }
      .tok-punct { color: var(--b-text-secondary); }
    `;
  }

  private _code = '';

  render() {
    const lang = this._normalizeLang(this.attr('language', 'plain'));
    const showLang = lang !== 'plain';
    const showCopy = !this.boolAttr('no-copy');
    const maxHeight = this.attr('max-height');
    const sticky = this.attr('sticky-header');
    const preStyle = maxHeight && sticky !== 'page' ? ` style="max-height:${this._escapeAttr(maxHeight)}"` : '';
    const code = this._getCode();
    this._code = code;
    const highlighted = this._highlight(code, lang);
    const numbered = this.boolAttr('show-line-numbers')
      ? this._withLineNumbers(highlighted)
      : highlighted;
    const cardClass = sticky === 'page'
      ? 'wrapper data-viewer-card sticky-page'
      : 'wrapper data-viewer-card';
    return `
      <div class="${cardClass}">
        ${(showLang || showCopy) ? `
          <header class="data-viewer-header">
            <span class="title">${showLang ? this._escapeHtml(lang) : ''}</span>
            <div class="actions">
              ${showCopy ? `<button class="toolbar-btn copy-btn" type="button" aria-label="Copy">${this._escapeHtml(this.attr('label-copy', 'Copy'))}</button>` : ''}
            </div>
          </header>
        ` : ''}
        <pre${preStyle}><code>${numbered}</code></pre>
      </div>
    `;
  }

  protected onUpdated() {
    const copyBtn = this.$<HTMLButtonElement>('.copy-btn');
    if (!copyBtn) return;
    this.listen(copyBtn, 'click', async () => {
      try {
        await navigator.clipboard.writeText(this._code);
        const original = copyBtn.textContent;
        copyBtn.textContent = this.attr('label-copied', 'Copied!');
        copyBtn.classList.add('copied');
        this.emit('copy', { code: this._code });
        setTimeout(() => {
          copyBtn.textContent = original;
          copyBtn.classList.remove('copied');
        }, 1500);
      } catch {
        this.emit('copy-error', {});
      }
    });
  }

  setCode(code: string, language?: string) {
    this.setAttribute('code', code);
    if (language) this.setAttribute('language', language);
  }

  private _getCode(): string {
    const attrCode = this.getAttribute('code');
    if (attrCode !== null) return attrCode;
    return this.textContent ?? '';
  }

  private _normalizeLang(lang: string): Lang {
    const l = lang.toLowerCase();
    if (l === 'javascript') return 'js';
    if (l === 'typescript') return 'ts';
    if (l === 'cs' || l === 'c#') return 'csharp';
    if (l === 'shell' || l === 'sh') return 'bash';
    if (['json', 'js', 'ts', 'html', 'xml', 'css', 'sql', 'csharp', 'bash', 'plain'].includes(l)) return l as Lang;
    return 'plain';
  }

  private _withLineNumbers(html: string): string {
    const lines = html.split('\n');
    return lines.map((line, i) => `<span class="line"><span class="ln">${i + 1}</span><span class="code-col">${line || ' '}</span></span>`).join('\n');
  }

  private _highlight(code: string, lang: Lang): string {
    if (lang === 'plain') return this._escapeHtml(code);
    if (lang === 'json') return this._highlightJson(code);
    if (lang === 'html' || lang === 'xml') return this._highlightMarkup(code);
    if (lang === 'css') return this._highlightCss(code);
    return this._highlightGeneric(code, lang);
  }

  private _highlightJson(src: string): string {
    // HTML-escape first so `<`, `>`, `&` in raw JSON render safely. The string
    // alternative below matches the POST-escape form (`&quot;…&quot;`) so that
    // digits inside string values (e.g. hex-like API keys) are not mistaken for
    // numeric literals. `&(?!quot;)` lets other entities (`&amp;`, `&lt;`) sit
    // inside a string without prematurely closing it.
    const escaped = this._escapeHtml(src);
    return escaped.replace(
      /(&quot;(?:\\.|&(?!quot;)|[^&\\])*&quot;)(\s*:)?|\b(true|false)\b|\bnull\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
      (_m, str, colon, bool, num) => {
        if (str) return colon ? `<span class="tok-attr">${str}</span>${colon}` : `<span class="tok-str">${str}</span>`;
        if (bool) return `<span class="tok-bool">${bool}</span>`;
        if (num) return `<span class="tok-num">${num}</span>`;
        return `<span class="tok-null">null</span>`;
      }
    );
  }

  private _highlightMarkup(src: string): string {
    // Escape first so the markup is safe to inject. All regexes below operate on
    // the escaped form: tag brackets are `&lt;` / `&gt;`, double-quoted attribute
    // values are `&quot;…&quot;`. Single quotes and `<`/`>` inside attribute
    // values (rare, but allowed post-escape of `<`) can't appear — `_escapeHtml`
    // only produces `&amp; &lt; &gt; &quot;`, so `'` stays literal and any raw
    // angle bracket is already an entity. The attrs slot accepts a whole
    // `&quot;…&quot;` string atomically so its inner entities don't abort the
    // outer tag match (the bug with the previous `[^&]*?` slot).
    const escaped = this._escapeHtml(src);
    // Comments
    let out = escaped.replace(/&lt;!--[\s\S]*?--&gt;/g, m => `<span class="tok-com">${m}</span>`);
    // Tags + attrs
    out = out.replace(
      /(&lt;\/?)([a-zA-Z][\w-]*)((?:\s+(?:&quot;(?:&(?!quot;)|[^&])*&quot;|&(?!gt;)|[^&])*)?)(\/?&gt;)/g,
      (_m, open, tag, attrs, close) => {
        const attrHtml = attrs.replace(
          /([a-zA-Z_:][\w:.-]*)(=)(&quot;(?:&(?!quot;)|[^&])*&quot;|'[^']*')?/g,
          (_a: string, name: string, eq: string, val: string) => {
            const valHtml = val ? `<span class="tok-str">${val}</span>` : '';
            return `<span class="tok-attr">${name}</span>${eq ? eq : ''}${valHtml}`;
          });
        return `<span class="tok-punct">${open}</span><span class="tok-tag">${tag}</span>${attrHtml}<span class="tok-punct">${close}</span>`;
      });
    return out;
  }

  private _highlightCss(src: string): string {
    const escaped = this._escapeHtml(src);
    let out = escaped.replace(/\/\*[\s\S]*?\*\//g, m => `<span class="tok-com">${m}</span>`);
    out = out.replace(/([a-zA-Z-]+)(\s*:)([^;{}\n]+)(;?)/g,
      (_m, prop, colon, val, semi) => `<span class="tok-attr">${prop}</span>${colon}<span class="tok-str">${val}</span>${semi}`);
    return out;
  }

  private _highlightGeneric(src: string, lang: Lang): string {
    const kws = KEYWORDS[lang] ?? [];
    // Mask strings/comments so keyword regex doesn't touch them
    const tokens: string[] = [];
    const mask = (s: string) => {
      tokens.push(s);
      return ` T${tokens.length - 1} `;
    };
    let work = src;
    // Line comments //
    work = work.replace(/\/\/[^\n]*/g, m => mask(`<span class="tok-com">${this._escapeHtml(m)}</span>`));
    // Block comments /* */
    work = work.replace(/\/\*[\s\S]*?\*\//g, m => mask(`<span class="tok-com">${this._escapeHtml(m)}</span>`));
    // Hash comments (bash/sql)
    if (lang === 'bash' || lang === 'sql') {
      work = work.replace(/(^|[\s;])(#|--)[^\n]*/g, (_m, pre, op) => pre + mask(`<span class="tok-com">${this._escapeHtml(op + _m.slice(pre.length + op.length))}</span>`));
    }
    // Strings
    work = work.replace(/"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`/g,
      m => mask(`<span class="tok-str">${this._escapeHtml(m)}</span>`));
    // Escape remaining HTML
    work = this._escapeHtml(work);
    // Numbers
    work = work.replace(/\b\d+(?:\.\d+)?\b/g, m => `<span class="tok-num">${m}</span>`);
    // Keywords
    if (kws.length) {
      const pattern = new RegExp(`\\b(${kws.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, lang === 'sql' ? 'gi' : 'g');
      work = work.replace(pattern, '<span class="tok-kw">$1</span>');
    }
    // Restore masked tokens
    work = work.replace(/ T(\d+) /g, (_m, i) => tokens[Number(i)]);
    return work;
  }

  private _escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  private _escapeAttr(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }
}

define('b-code-block', BCodeBlock);
