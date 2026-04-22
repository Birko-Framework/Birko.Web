import { BaseComponent, define } from 'birko-web-core';
import { formFieldSheet, formControlSheet } from '../shared-styles';
import { renderLabel } from './label-hint';

export type MarkdownRenderer = (markdown: string) => string;

export class BMarkdownEditor extends BaseComponent {
  static get observedAttributes() {
    return ['label', 'name', 'value', 'placeholder', 'error', 'disabled', 'required', 'hint',
            'mode', 'readonly', 'rows'];
  }

  static get sharedStyles() {
    return [formFieldSheet, formControlSheet];
  }

  static get styles() {
    return `
      :host { display: block; }
      .editor-container {
        display: flex;
        flex-direction: column;
        border: var(--b-border-width, 1px) solid var(--b-border);
        border-radius: var(--b-radius, 0.375rem);
        overflow: hidden;
        background: var(--b-bg);
      }
      .editor-container.has-error { border-color: var(--b-color-danger); }
      .editor-container.disabled { opacity: var(--b-disabled-opacity, 0.5); pointer-events: none; }

      /* Toolbar */
      .toolbar {
        display: flex;
        align-items: center;
        gap: var(--b-space-xs, 0.25rem);
        padding: var(--b-space-xs, 0.25rem) var(--b-space-sm, 0.5rem);
        border-bottom: var(--b-border-width, 1px) solid var(--b-border);
        background: var(--b-bg-secondary);
        flex-wrap: wrap;
      }
      .toolbar-group {
        display: flex;
        align-items: center;
        gap: var(--b-space-2xs, 0.125rem);
      }
      .toolbar-sep {
        width: 1px;
        height: 1.25rem;
        background: var(--b-border);
        margin: 0 var(--b-space-xs, 0.25rem);
      }
      .toolbar-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 1.75rem;
        height: 1.75rem;
        padding: 0 var(--b-space-xs, 0.25rem);
        border: none;
        border-radius: var(--b-radius-sm, 0.25rem);
        background: transparent;
        color: var(--b-text-secondary);
        font-size: var(--b-text-sm, 0.8125rem);
        font-weight: var(--b-font-weight-semibold, 600);
        cursor: pointer;
        line-height: 1;
      }
      .toolbar-btn:hover { background: var(--b-bg-tertiary); color: var(--b-text); }
      .toolbar-btn:focus-visible { box-shadow: var(--b-focus-ring); outline: none; }
      .toolbar-btn.active { background: var(--b-bg-tertiary); color: var(--b-color-primary); }

      /* Heading dropdown */
      .heading-wrap { position: relative; }
      .heading-dropdown {
        display: none;
        position: absolute;
        top: 100%;
        left: 0;
        z-index: var(--b-z-dropdown, 100);
        background: var(--b-bg);
        border: var(--b-border-width, 1px) solid var(--b-border);
        border-radius: var(--b-radius-sm, 0.25rem);
        box-shadow: var(--b-shadow-md);
        padding: var(--b-space-2xs, 0.125rem);
        margin-top: var(--b-space-2xs, 0.125rem);
        flex-direction: column;
        min-width: 4rem;
      }
      .heading-dropdown.open { display: flex; }
      .heading-opt {
        display: block;
        width: 100%;
        padding: var(--b-space-xs, 0.25rem) var(--b-space-sm, 0.5rem);
        border: none;
        background: transparent;
        color: var(--b-text);
        font-size: var(--b-text-sm, 0.8125rem);
        cursor: pointer;
        text-align: left;
        border-radius: var(--b-radius-sm, 0.25rem);
        white-space: nowrap;
      }
      .heading-opt:hover { background: var(--b-bg-tertiary); }
      .heading-opt:focus-visible { box-shadow: var(--b-focus-ring); outline: none; }

      /* Mode toggle */
      .mode-toggle { display: flex; margin-left: auto; }
      .mode-btn {
        padding: 0.125rem var(--b-space-sm, 0.5rem);
        border: var(--b-border-width, 1px) solid var(--b-border);
        background: transparent;
        color: var(--b-text-secondary);
        font-size: var(--b-text-xs, 0.6875rem);
        cursor: pointer;
        line-height: 1.5;
      }
      .mode-btn:first-child { border-radius: var(--b-radius-sm, 0.25rem) 0 0 var(--b-radius-sm, 0.25rem); }
      .mode-btn:last-child { border-radius: 0 var(--b-radius-sm, 0.25rem) var(--b-radius-sm, 0.25rem) 0; border-left: none; }
      .mode-btn:not(:first-child):not(:last-child) { border-left: none; }
      .mode-btn.active { background: var(--b-color-primary); color: var(--b-text-inverse); border-color: var(--b-color-primary); }
      .mode-btn:focus-visible { box-shadow: var(--b-focus-ring); outline: none; position: relative; z-index: 1; }

      /* Split pane */
      .editor-split {
        display: grid;
        grid-template-columns: 1fr 1fr;
        min-height: 0;
      }
      .editor-split .divider {
        width: 1px;
        background: var(--b-border);
      }
      textarea.source {
        border: none;
        border-radius: 0;
        resize: none;
        outline: none;
        font-family: var(--b-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
        font-size: var(--b-text-sm, 0.8125rem);
        line-height: 1.5;
        padding: var(--b-space-md, 0.75rem);
        tab-size: 2;
      }
      textarea.source:focus { box-shadow: none; }
      .preview {
        padding: var(--b-space-md, 0.75rem);
        overflow-y: auto;
        border-left: var(--b-border-width, 1px) solid var(--b-border);
        background: var(--b-bg);
      }

      /* Mode variations */
      :host([mode="source"]) .editor-split { grid-template-columns: 1fr; }
      :host([mode="source"]) .preview { display: none; }
      :host([mode="preview"]) .editor-split { grid-template-columns: 1fr; }
      :host([mode="preview"]) textarea.source { display: none; }
      :host([mode="preview"]) .preview { border-left: none; }

      /* Preview prose styling */
      .preview-content { font-size: var(--b-text-sm, 0.8125rem); line-height: 1.6; color: var(--b-text); }
      .preview-content h1 { font-size: 1.5rem; font-weight: var(--b-font-weight-bold, 700); margin: 0 0 var(--b-space-sm, 0.5rem); padding-bottom: var(--b-space-xs, 0.25rem); border-bottom: var(--b-border-width, 1px) solid var(--b-border); }
      .preview-content h2 { font-size: 1.25rem; font-weight: var(--b-font-weight-bold, 700); margin: var(--b-space-md, 0.75rem) 0 var(--b-space-xs, 0.25rem); padding-bottom: var(--b-space-xs, 0.25rem); border-bottom: var(--b-border-width, 1px) solid var(--b-border); }
      .preview-content h3 { font-size: 1.1rem; font-weight: var(--b-font-weight-semibold, 600); margin: var(--b-space-md, 0.75rem) 0 var(--b-space-xs, 0.25rem); }
      .preview-content h4, .preview-content h5, .preview-content h6 { font-size: var(--b-text-base, 0.875rem); font-weight: var(--b-font-weight-semibold, 600); margin: var(--b-space-sm, 0.5rem) 0 var(--b-space-xs, 0.25rem); }
      .preview-content p { margin: 0 0 var(--b-space-sm, 0.5rem); }
      .preview-content ul, .preview-content ol { margin: 0 0 var(--b-space-sm, 0.5rem); padding-left: 1.5rem; }
      .preview-content li { margin-bottom: 0.125rem; }
      .preview-content blockquote { border-left: 3px solid var(--b-color-primary); margin: 0 0 var(--b-space-sm, 0.5rem); padding: var(--b-space-xs, 0.25rem) var(--b-space-md, 0.75rem); color: var(--b-text-secondary); background: var(--b-bg-secondary); border-radius: 0 var(--b-radius-sm, 0.25rem) var(--b-radius-sm, 0.25rem) 0; }
      .preview-content code { font-family: var(--b-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace); font-size: 0.875em; background: var(--b-bg-tertiary); padding: 0.125rem 0.25rem; border-radius: var(--b-radius-sm, 0.25rem); }
      .preview-content pre { background: var(--b-bg-tertiary); border: var(--b-border-width, 1px) solid var(--b-border); border-radius: var(--b-radius-sm, 0.25rem); padding: var(--b-space-md, 0.75rem); overflow-x: auto; margin: 0 0 var(--b-space-sm, 0.5rem); }
      .preview-content pre code { background: none; padding: 0; font-size: var(--b-text-sm, 0.8125rem); }
      .preview-content a { color: var(--b-color-primary); text-decoration: underline; }
      .preview-content img { max-width: 100%; height: auto; border-radius: var(--b-radius, 0.375rem); }
      .preview-content hr { border: none; border-top: var(--b-border-width, 1px) solid var(--b-border); margin: var(--b-space-md, 0.75rem) 0; }
      .preview-content strong { font-weight: var(--b-font-weight-bold, 700); }
      .preview-content em { font-style: italic; }
      .preview-content del { text-decoration: line-through; color: var(--b-text-muted); }
      .preview-content mark { background: var(--b-color-warning-light, #fef3c7); padding: 0.0625rem 0.125rem; border-radius: var(--b-radius-sm, 0.25rem); }
      .preview-content sup { font-size: 0.75em; vertical-align: super; line-height: 0; }
      .preview-content sub { font-size: 0.75em; vertical-align: sub; line-height: 0; }
      .preview-content table { border-collapse: collapse; width: 100%; margin: 0 0 var(--b-space-sm, 0.5rem); }
      .preview-content th, .preview-content td { border: var(--b-border-width, 1px) solid var(--b-border); padding: var(--b-space-xs, 0.25rem) var(--b-space-sm, 0.5rem); text-align: left; }
      .preview-content th { background: var(--b-bg-secondary); font-weight: var(--b-font-weight-semibold, 600); }
      .preview-content .task-list-item { list-style: none; margin-left: -1.25rem; }
      .preview-content .task-list-item input[type="checkbox"] { margin-right: var(--b-space-xs, 0.25rem); vertical-align: middle; accent-color: var(--b-color-primary); }
    `;
  }

  private _source = '';
  private _renderer: MarkdownRenderer | null = null;
  private _headingDropdownOpen = false;

  render() {
    const label = this.attr('label');
    const hint = this.attr('hint');
    const error = this.attr('error');
    const disabled = this.boolAttr('disabled');
    const readonly = this.boolAttr('readonly');
    const mode = this._currentMode();
    const rows = this.numAttr('rows', 10);
    const placeholder = this.attr('placeholder');
    const rendered = this._renderMarkdown(this._source);

    const modeSplit = mode === 'split';
    const modeSource = mode === 'source';
    const modePreview = mode === 'preview';
    const lSplit = this.attr('label-split', 'Split');
    const lSource = this.attr('label-source', 'Source');
    const lPreview = this.attr('label-preview', 'Preview');

    return `
      <div class="field">
        ${renderLabel(label, hint, this.boolAttr('required'))}
        <div class="editor-container ${error ? 'has-error' : ''} ${disabled ? 'disabled' : ''}">
          <div class="toolbar" ${readonly ? 'style="display:none"' : ''}>
            <div class="toolbar-group">
              <button class="toolbar-btn" data-action="bold" title="Bold (Ctrl+B)" aria-label="Bold" type="button"><b>B</b></button>
              <button class="toolbar-btn" data-action="italic" title="Italic (Ctrl+I)" aria-label="Italic" type="button"><i>I</i></button>
              <button class="toolbar-btn" data-action="strikethrough" title="Strikethrough" aria-label="Strikethrough" type="button"><s>S</s></button>
              <button class="toolbar-btn" data-action="highlight" title="Highlight" aria-label="Highlight" type="button" style="text-decoration:overline">H</button>
              <button class="toolbar-btn" data-action="sup" title="Superscript" aria-label="Superscript" type="button" style="font-size:0.65rem;vertical-align:super">X</button>
              <button class="toolbar-btn" data-action="sub" title="Subscript" aria-label="Subscript" type="button" style="font-size:0.65rem;vertical-align:sub">X</button>
            </div>
            <span class="toolbar-sep"></span>
            <div class="toolbar-group">
              <div class="heading-wrap">
                <button class="toolbar-btn" data-action="heading-menu" title="Heading" aria-label="Heading" type="button">H</button>
                <div class="heading-dropdown ${this._headingDropdownOpen ? 'open' : ''}">
                  <button class="heading-opt" data-action="h1" type="button">H1 <span style="font-size:0.7em;color:var(--b-text-muted);font-weight:400">#</span></button>
                  <button class="heading-opt" data-action="h2" type="button">H2 <span style="font-size:0.7em;color:var(--b-text-muted);font-weight:400">##</span></button>
                  <button class="heading-opt" data-action="h3" type="button">H3 <span style="font-size:0.7em;color:var(--b-text-muted);font-weight:400">###</span></button>
                  <button class="heading-opt" data-action="h4" type="button">H4 <span style="font-size:0.7em;color:var(--b-text-muted);font-weight:400">####</span></button>
                  <button class="heading-opt" data-action="h5" type="button">H5 <span style="font-size:0.7em;color:var(--b-text-muted);font-weight:400">#####</span></button>
                  <button class="heading-opt" data-action="h6" type="button">H6 <span style="font-size:0.7em;color:var(--b-text-muted);font-weight:400">######</span></button>
                </div>
              </div>
              <button class="toolbar-btn" data-action="quote" title="Blockquote" aria-label="Blockquote" type="button">&ldquo;</button>
              <button class="toolbar-btn" data-action="code" title="Code" aria-label="Code" type="button">&lt;/&gt;</button>
            </div>
            <span class="toolbar-sep"></span>
            <div class="toolbar-group">
              <button class="toolbar-btn" data-action="ul" title="Bullet list" aria-label="Bullet list" type="button">&bull;</button>
              <button class="toolbar-btn" data-action="ol" title="Numbered list" aria-label="Numbered list" type="button">1.</button>
              <button class="toolbar-btn" data-action="tasklist" title="Task list" aria-label="Task list" type="button">&#9744;</button>
            </div>
            <span class="toolbar-sep"></span>
            <div class="toolbar-group">
              <button class="toolbar-btn" data-action="link" title="Link" aria-label="Insert link" type="button">&#128279;</button>
              <button class="toolbar-btn" data-action="image" title="Image" aria-label="Insert image" type="button">&#128247;</button>
              <button class="toolbar-btn" data-action="table" title="Table" aria-label="Insert table" type="button">&#9638;</button>
              <button class="toolbar-btn" data-action="hr" title="Horizontal rule" aria-label="Horizontal rule" type="button">&mdash;</button>
            </div>
            <div class="mode-toggle">
              <button class="mode-btn ${modeSplit ? 'active' : ''}" data-mode="split" type="button">${this._escapeHtml(lSplit)}</button>
              <button class="mode-btn ${modeSource ? 'active' : ''}" data-mode="source" type="button">${this._escapeHtml(lSource)}</button>
              <button class="mode-btn ${modePreview ? 'active' : ''}" data-mode="preview" type="button">${this._escapeHtml(lPreview)}</button>
            </div>
          </div>
          <div class="editor-split">
            <textarea class="source"
                      placeholder="${this._escapeAttr(placeholder)}"
                      rows="${rows}"
                      ${disabled ? 'disabled' : ''}
                      ${readonly ? 'readonly' : ''}
            >${this._escapeHtml(this._source)}</textarea>
            <div class="preview">
              <div class="preview-content">${rendered}</div>
            </div>
          </div>
        </div>
        ${error ? `<span class="error">${this._escapeHtml(error)}</span>` : ''}
      </div>
    `;
  }

  protected onMount() {
    const attrVal = this.getAttribute('value');
    if (attrVal !== null) this._source = attrVal;
  }

  protected onUpdated() {
    const textarea = this.$<HTMLTextAreaElement>('textarea.source');
    const previewDiv = this.$<HTMLElement>('.preview-content');
    const disabled = this.boolAttr('disabled');
    const readonly = this.boolAttr('readonly');

    // Restore textarea cursor position after re-render
    if (textarea && !disabled && !readonly) {
      textarea.value = this._source;

      this.listen(textarea, 'input', () => {
        this._source = textarea.value;
        if (previewDiv) previewDiv.innerHTML = this._renderMarkdown(this._source);
        this.emit('change', { name: this.attr('name'), value: this._source });
      });

      this.listen(textarea, 'blur', () => {
        this.emit('blur', { name: this.attr('name'), value: this._source });
      });

      this.listen(textarea, 'paste', (e: Event) => {
        this._handlePaste(e as ClipboardEvent);
      });
    }

    // Mode toggle buttons
    this.$$<HTMLButtonElement>('.mode-btn').forEach(btn => {
      this.listen(btn, 'click', () => {
        this.setAttribute('mode', btn.dataset.mode!);
      });
    });

    // Heading dropdown toggle
    const headingMenuBtn = this.$<HTMLButtonElement>('[data-action="heading-menu"]');
    const headingDropdown = this.$<HTMLElement>('.heading-dropdown');
    if (headingMenuBtn && headingDropdown) {
      this.listen(headingMenuBtn, 'click', (e: Event) => {
        e.stopPropagation();
        this._headingDropdownOpen = !this._headingDropdownOpen;
        headingDropdown.classList.toggle('open', this._headingDropdownOpen);
      });

      // Close dropdown when clicking outside
      this.listen(document.body, 'click', () => {
        if (this._headingDropdownOpen) {
          this._headingDropdownOpen = false;
          headingDropdown.classList.remove('open');
        }
      });
    }

    // Heading options
    this.$$<HTMLButtonElement>('.heading-opt').forEach(btn => {
      this.listen(btn, 'click', (e: Event) => {
        e.stopPropagation();
        this._headingDropdownOpen = false;
        if (headingDropdown) headingDropdown.classList.remove('open');
        this._handleToolbarAction(btn.dataset.action!, textarea);
      });
    });

    // Toolbar action buttons (skip heading-menu which is handled above)
    if (!disabled && !readonly) {
      this.$$<HTMLButtonElement>('.toolbar-btn').forEach(btn => {
        if (btn.dataset.action === 'heading-menu') return;
        this.listen(btn, 'click', (e: Event) => {
          e.preventDefault();
          this._handleToolbarAction(btn.dataset.action!, textarea);
        });
      });
    }
  }

  // ── Public API ──

  get value(): string { return this._source; }
  set value(v: string) {
    this._source = v;
    this.update();
  }

  get inputValue(): string { return this._source; }
  set inputValue(v: string) {
    this._source = v ?? '';
    this.update();
  }

  get markdownRenderer(): MarkdownRenderer | null { return this._renderer; }
  set markdownRenderer(fn: MarkdownRenderer | null) {
    this._renderer = fn;
    const previewDiv = this.$<HTMLElement>('.preview-content');
    if (previewDiv) previewDiv.innerHTML = this._renderMarkdown(this._source);
  }

  getValue(): string { return this._source; }

  setValue(md: string): void {
    this._source = md;
    this.update();
  }

  focus(): void {
    const textarea = this.$<HTMLTextAreaElement>('textarea.source');
    textarea?.focus();
  }

  insertText(text: string): void {
    const textarea = this.$<HTMLTextAreaElement>('textarea.source');
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    textarea.value = textarea.value.substring(0, start) + text + textarea.value.substring(end);
    textarea.selectionStart = textarea.selectionEnd = start + text.length;
    textarea.focus();
    this._source = textarea.value;
    const previewDiv = this.$<HTMLElement>('.preview-content');
    if (previewDiv) previewDiv.innerHTML = this._renderMarkdown(this._source);
  }

  // ── Internal ──

  private _currentMode(): 'split' | 'source' | 'preview' {
    const m = this.attr('mode', 'split');
    if (m === 'source' || m === 'preview') return m;
    return 'split';
  }

  private _handleToolbarAction(action: string, textarea: HTMLTextAreaElement | null): void {
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.substring(start, end);
    let before = '';
    let after = '';
    let placeholder = '';

    switch (action) {
      case 'bold':          before = '**'; after = '**'; placeholder = 'bold text'; break;
      case 'italic':        before = '*'; after = '*'; placeholder = 'italic text'; break;
      case 'strikethrough': before = '~~'; after = '~~'; placeholder = 'strikethrough'; break;
      case 'highlight':     before = '=='; after = '=='; placeholder = 'highlighted'; break;
      case 'sup':           before = '^'; after = '^'; placeholder = 'superscript'; break;
      case 'sub':           before = '~'; after = '~'; placeholder = 'subscript'; break;
      case 'h1':            before = '\n# '; after = '\n'; placeholder = 'Heading 1'; break;
      case 'h2':            before = '\n## '; after = '\n'; placeholder = 'Heading 2'; break;
      case 'h3':            before = '\n### '; after = '\n'; placeholder = 'Heading 3'; break;
      case 'h4':            before = '\n#### '; after = '\n'; placeholder = 'Heading 4'; break;
      case 'h5':            before = '\n##### '; after = '\n'; placeholder = 'Heading 5'; break;
      case 'h6':            before = '\n###### '; after = '\n'; placeholder = 'Heading 6'; break;
      case 'quote':         before = '\n> '; after = '\n'; placeholder = 'quote'; break;
      case 'code': {
        if (selected.includes('\n')) {
          before = '\n```\n'; after = '\n```\n'; placeholder = 'code';
        } else {
          before = '`'; after = '`'; placeholder = 'code';
        }
        break;
      }
      case 'ul':            before = '\n- '; after = '\n'; placeholder = 'list item'; break;
      case 'ol':            before = '\n1. '; after = '\n'; placeholder = 'list item'; break;
      case 'tasklist':      before = '\n- [ ] '; after = '\n'; placeholder = 'task'; break;
      case 'link':          before = '['; after = '](url)'; placeholder = 'link text'; break;
      case 'image':         before = '!['; after = '](url)'; placeholder = 'alt text'; break;
      case 'table':         before = '\n| Header | Header |\n| ------ | ------ |\n| Cell'; after = ' | Cell |\n'; placeholder = ''; break;
      case 'hr':            before = '\n---\n'; after = ''; placeholder = ''; break;
      default: return;
    }

    const text = selected || placeholder;
    const replacement = before + text + after;
    textarea.value = textarea.value.substring(0, start) + replacement + textarea.value.substring(end);
    textarea.focus();

    if (selected) {
      textarea.selectionStart = start + before.length;
      textarea.selectionEnd = start + before.length + selected.length;
    } else {
      textarea.selectionStart = start + before.length;
      textarea.selectionEnd = start + before.length + placeholder.length;
    }

    this._source = textarea.value;
    const previewDiv = this.$<HTMLElement>('.preview-content');
    if (previewDiv) previewDiv.innerHTML = this._renderMarkdown(this._source);
    this.emit('change', { name: this.attr('name'), value: this._source });
  }

  private _handlePaste(e: ClipboardEvent): void {
    const html = e.clipboardData?.getData('text/html');
    if (!html || !this._isWordHtml(html)) return;

    e.preventDefault();
    const markdown = BMarkdownEditor.cleanWordHtml(html);

    const textarea = this.$<HTMLTextAreaElement>('textarea.source');
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    textarea.value = textarea.value.substring(0, start) + markdown + textarea.value.substring(end);
    textarea.selectionStart = textarea.selectionEnd = start + markdown.length;
    textarea.focus();

    this._source = textarea.value;
    const previewDiv = this.$<HTMLElement>('.preview-content');
    if (previewDiv) previewDiv.innerHTML = this._renderMarkdown(this._source);
    this.emit('change', { name: this.attr('name'), value: this._source });
  }

  private _isWordHtml(html: string): boolean {
    return html.includes('mso-') || html.includes('urn:schemas-microsoft-com') || html.includes('Microsoft Word');
  }

  // ── Built-in Markdown Renderer ──

  private _renderMarkdown(source: string): string {
    if (this._renderer) return this._renderer(source);
    return BMarkdownEditor.renderMarkdown(source);
  }

  static renderMarkdown(src: string): string {
    if (!src) return '<p></p>';

    const tokens: string[] = [];
    const mask = (s: string) => { tokens.push(s); return `\x00${tokens.length - 1}\x00`; };

    let work = src;

    // 1. Mask code blocks (triple backtick fences)
    work = work.replace(/```[\s\S]*?```/g, (m) => {
      const lines = m.slice(3, -3);
      const firstNewline = lines.indexOf('\n');
      const lang = firstNewline > 0 ? lines.substring(0, firstNewline).trim() : '';
      const code = firstNewline > 0 ? lines.substring(firstNewline + 1) : lines;
      const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return mask(`<pre><code${lang ? ` class="language-${lang}"` : ''}>${escaped}</code></pre>`);
    });

    // 2. Mask inline code
    work = work.replace(/`([^`]+)`/g, (_m, code) => mask(`<code>${code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code>`));

    // 3. Escape HTML
    work = work.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // 4. Horizontal rules
    work = work.replace(/^(---|\*\*\*|___)\s*$/gm, '<hr>');

    // 5. Headings
    work = work.replace(/^(#{1,6})\s+(.+)$/gm, (_m, hashes, text) => {
      const level = hashes.length;
      return `<h${level}>${text}</h${level}>`;
    });

    // 6. Blockquotes
    work = work.replace(/^>\s?(.+)$/gm, '<blockquote>$1</blockquote>');
    // Merge consecutive blockquotes
    work = work.replace(/<\/blockquote>\n<blockquote>/g, '\n');

    // 7. Tables (simple GFM tables)
    work = work.replace(/^(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)*)/gm, (_m, headerRow, _sep, bodyRows) => {
      const headers = headerRow.split('|').filter((c: string) => c.trim()).map((c: string) => `<th>${c.trim()}</th>`).join('');
      const rows = bodyRows.trim().split('\n').map((row: string) => {
        const cells = row.split('|').filter((c: string) => c.trim()).map((c: string) => `<td>${c.trim()}</td>`).join('');
        return `<tr>${cells}</tr>`;
      }).join('');
      return `<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
    });

    // 8. Task lists (before general unordered lists)
    work = work.replace(/^[-*+]\s+\[([ xX])\]\s+(.+)$/gm, (_m, checked, text) => {
      const isChecked = checked !== ' ';
      return `<li class="task-list-item"><input type="checkbox" ${isChecked ? 'checked' : ''} disabled>${text}</li>`;
    });

    // 9. Unordered lists
    work = work.replace(/^(\s*)[-*+]\s+(.+)$/gm, '$1<li>$2</li>');
    work = work.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

    // 10. Ordered lists
    work = work.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');

    // 11. Inline formatting
    work = work.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    work = work.replace(/__(.+?)__/g, '<strong>$1</strong>');
    work = work.replace(/\*(.+?)\*/g, '<em>$1</em>');
    work = work.replace(/(?<!\w)_(.+?)_(?!\w)/g, '<em>$1</em>');
    work = work.replace(/~~(.+?)~~/g, '<del>$1</del>');
    work = work.replace(/==(.+?)==/g, '<mark>$1</mark>');

    // Superscript: ^text^ — single char or parenthesized
    work = work.replace(/\^([^\s^]+?)\^/g, '<sup>$1</sup>');
    // Subscript: ~text~ (single tilde, not double ~~ which is strikethrough)
    work = work.replace(/(?<!~)~([^~\s]+?)~(?!~)/g, '<sub>$1</sub>');

    // 12. Images (before links)
    work = work.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2">');

    // 13. Links
    work = work.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

    // 14. Paragraphs — wrap double-newline-separated blocks
    const blocks = work.split(/\n\n+/);
    work = blocks.map(block => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      if (/^<(h[1-6]|ul|ol|blockquote|pre|hr|table)/.test(trimmed)) return trimmed;
      if (trimmed.includes('\x00')) return trimmed;
      return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
    }).join('\n');

    // 15. Restore masked tokens
    work = work.replace(/\x00(\d+)\x00/g, (_m, i) => tokens[Number(i)]);

    return work;
  }

  // ── Word HTML Cleanup ──

  static cleanWordHtml(html: string): string {
    let text = html;

    // Strip styles, scripts, conditional comments
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '');

    // Remove Word-specific tags
    text = text.replace(/<\/?(o|v|w|m):[^>]*>/gi, '');
    text = text.replace(/<xml[^>]*>[\s\S]*?<\/xml>/gi, '');
    text = text.replace(/<meta[^>]*>/gi, '');
    text = text.replace(/<link[^>]*>/gi, '');

    // Remove all attributes except href on <a> and src on <img>
    text = text.replace(/<(\w+)\s+[^>]*?>/g, (m, tag) => {
      const href = m.match(/href="([^"]*)"/i);
      const src = m.match(/src="([^"]*)"/i);
      let attrs = '';
      if (href) attrs += ` href="${href[1]}"`;
      if (src) attrs += ` src="${src[1]}"`;
      return `<${tag}${attrs}>`;
    });

    // Convert formatting to markdown
    text = text.replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, '**$2**');
    text = text.replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, '*$2*');
    text = text.replace(/<(u)>([\s\S]*?)<\/\1>/gi, '__$2__');
    text = text.replace(/<(del|s|strike)>([\s\S]*?)<\/\1>/gi, '~~$2~~');
    text = text.replace(/<(mark)>([\s\S]*?)<\/\1>/gi, '==$2==');
    text = text.replace(/<sup>([\s\S]*?)<\/sup>/gi, '^$1^');
    text = text.replace(/<sub>([\s\S]*?)<\/sub>/gi, '~$1~');

    // Convert headings
    text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n');
    text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n');
    text = text.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n');
    text = text.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n');
    text = text.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '\n##### $1\n');
    text = text.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '\n###### $1\n');

    // Convert lists
    text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, content) => {
      const cleaned = content.replace(/<[^>]+>/g, '').trim();
      return `\n- ${cleaned}`;
    });
    text = text.replace(/<\/?(ul|ol|dl)>/gi, '\n');

    // Convert links
    text = text.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');

    // Convert images
    text = text.replace(/<img[^>]*alt="([^"]*)"[^>]*src="([^"]*)"[^>]*\/?>/gi, '![$1]($2)');
    text = text.replace(/<img[^>]*src="([^"]*)"[^>]*\/?>/gi, '![]($1)');

    // Convert blockquotes
    text = text.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_m, content) => {
      return content.split('\n').map((line: string) => `> ${line}`).join('\n');
    });

    // Convert paragraphs to double newlines
    text = text.replace(/<\/p>/gi, '\n\n');
    text = text.replace(/<br\s*\/?>/gi, '\n');

    // Strip all remaining tags
    text = text.replace(/<[^>]+>/g, '');

    // Decode entities
    text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    text = text.replace(/&nbsp;/g, ' ');

    // Collapse whitespace
    text = text.replace(/[ \t]+/g, ' ');
    text = text.replace(/\n{3,}/g, '\n\n');
    text = text.trim();

    return text;
  }

  private _escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  private _escapeAttr(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }
}

define('b-markdown-editor', BMarkdownEditor);
