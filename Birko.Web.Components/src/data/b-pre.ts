import { BaseComponent, define } from 'birko-web-core';

export class BPre extends BaseComponent {
  static get observedAttributes() {
    return ['wrap', 'max-height', 'size'];
  }

  static get styles() {
    return `
      :host { display: block; }
      pre {
        margin: 0;
        padding: var(--b-space-md, 0.75rem);
        background: var(--b-bg-tertiary);
        color: var(--b-text);
        border: var(--b-border-width, 1px) solid var(--b-border);
        border-radius: var(--b-radius, 0.375rem);
        font-family: var(--b-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
        font-size: var(--b-text-sm, 0.8125rem);
        line-height: 1.5;
        overflow: auto;
        white-space: pre;
        tab-size: 2;
      }
      :host([wrap]) pre {
        white-space: pre-wrap;
        word-break: break-word;
      }
      :host([size="sm"]) pre { font-size: var(--b-text-xs, 0.6875rem); padding: var(--b-space-sm, 0.5rem); }
      :host([size="lg"]) pre { font-size: var(--b-text-base, 0.875rem); padding: var(--b-space-lg, 1rem); }
    `;
  }

  render() {
    const maxHeight = this.attr('max-height');
    const style = maxHeight ? ` style="max-height:${this._escapeAttr(maxHeight)}"` : '';
    return `<pre${style}><slot></slot></pre>`;
  }

  private _escapeAttr(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }
}

define('b-pre', BPre);
