import { FormControlComponent, define } from 'birko-web-core';
import { escapeHtml, escapeAttr } from '../dom-utils';
import { formFieldSheet, comboControlSheet } from '../shared-styles';
import { renderField, fieldAria } from './label-hint';

export interface MultiSelectOption {
  value: string;
  label: string;
  color?: string;
}

/** @deprecated Use MultiSelectOption instead */
export type Option = MultiSelectOption;

export class BMultiSelect extends FormControlComponent {
  static get observedAttributes() {
    return ['label', 'name', 'placeholder', 'error', 'disabled', 'searchable', 'creatable',
            'label-no-matches', 'label-search', 'label-remove', 'label-create', 'hint', 'description', 'bare'];
  }

  private _options: MultiSelectOption[] = [];
  private _selected = new Set<string>();
  private _filter = '';
  private _open = false;
  private _outsideClickHandler: ((e: Event) => void) | null = null;
  private _wiredContainer: HTMLElement | null = null;

  static get sharedStyles() {
    return [formFieldSheet, comboControlSheet];
  }

  static get styles() {
    return `
      :host { display: block; position: relative; }
      .container {
        flex-wrap: wrap;
        gap: var(--b-space-xs, 0.25rem);
        padding: var(--b-space-xs, 0.25rem) var(--b-space-sm, 0.5rem);
      }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: var(--b-space-xs, 0.25rem);
        padding: 0.0625rem var(--b-space-sm, 0.5rem);
        border-radius: var(--b-radius-full, 9999px);
        background: var(--b-bg-tertiary);
        font-size: var(--b-text-sm, 0.8125rem);
        color: var(--b-text);
        white-space: nowrap;
      }
      .chip-dot {
        width: 0.5rem; height: 0.5rem;
        border-radius: var(--b-radius-full, 9999px);
        flex-shrink: 0;
      }
      .chip-remove {
        background: none; border: none; cursor: pointer; padding: 0;
        color: var(--b-text-muted); font-size: var(--b-text-sm, 0.8125rem); line-height: 1;
      }
      .chip-remove:hover { color: var(--b-text); }
      .placeholder {
        color: var(--b-text-muted);
        font-size: var(--b-text-base, 0.875rem);
        padding: 0.125rem 0;
      }
      .dropdown {
        display: none;
        position: fixed;
        inset: auto;
        margin: 0;
        z-index: 9999;
        padding: var(--b-space-xs, 0.25rem) 0;
        background: var(--b-bg-elevated);
        border: var(--b-border-width, 1px) solid var(--b-border);
        border-radius: var(--b-radius, 0.375rem);
        box-shadow: var(--b-shadow-md);
        max-height: 12.5rem;
        overflow-y: auto;
      }
      .dropdown.open { display: block; }
      .dropdown:popover-open { display: block; }
      .option {
        display: flex; align-items: center;
        gap: var(--b-space-sm, 0.5rem);
        padding: var(--b-space-sm, 0.5rem) var(--b-space-md, 0.75rem);
        cursor: pointer; font-size: var(--b-text-sm, 0.8125rem); color: var(--b-text);
        transition: background var(--b-transition, 150ms ease);
      }
      .option:hover { background: var(--b-bg-tertiary); }
      .option input { width: auto; margin: 0; cursor: pointer; }
      .option-dot {
        width: 0.5rem; height: 0.5rem;
        border-radius: var(--b-radius-full, 9999px);
        flex-shrink: 0;
      }
      .option-create {
        display: flex; align-items: center; gap: var(--b-space-sm, 0.5rem);
        padding: var(--b-space-sm, 0.5rem) var(--b-space-md, 0.75rem);
        cursor: pointer; font-size: var(--b-text-sm, 0.8125rem);
        color: var(--b-color-primary);
        transition: background var(--b-transition, 150ms ease);
        border-top: var(--b-border-width, 1px) solid var(--b-border);
      }
      .option-create:hover { background: var(--b-bg-tertiary); }
      .search-wrap {
        padding: var(--b-space-xs, 0.25rem) var(--b-space-sm, 0.5rem);
        border-bottom: var(--b-border-width, 1px) solid var(--b-border);
        position: sticky; top: 0; background: var(--b-bg); z-index: 1;
      }
      .search-wrap input {
        width: 100%; border: none; outline: none; background: transparent;
        font-size: var(--b-text-sm, 0.8125rem); color: var(--b-text);
        padding: var(--b-space-xs, 0.25rem) 0;
      }
      .search-wrap input::placeholder { color: var(--b-text-muted); }
      /* iOS 16px focus-zoom floor (TASK-126 sweep). Measured at 11.38px. The class selector outranks
         formControlSheet's bare rule, exactly as b-select's .combo-input did — same component shape, same
         escape, and it survived the first pass of the sweep only because the field is rendered lazily
         (searchable + panel open), so the harness had to learn to ask for it before it could be measured. */
      @media (pointer: coarse) {
        .search-wrap input { font-size: max(16px, var(--b-text-sm, 0.8125rem)); }
      }
      .no-results {
        padding: var(--b-space-sm, 0.5rem) var(--b-space-md, 0.75rem);
        color: var(--b-text-muted); font-size: var(--b-text-sm, 0.8125rem);
      }
    `;
  }

  setOptions(options: MultiSelectOption[]) {
    this._options = options;
    if (this._open) {
      const dropdown = this.$<HTMLElement>('.dropdown');
      if (dropdown) this._refreshOptions(dropdown);
    } else {
      this.update();
    }
  }

  getSelected(): string[] {
    return [...this._selected];
  }

  setSelected(values: string[]) {
    this._selected = new Set(values);
    this.update();
  }

  /** Add a single option and optionally select it — surgical DOM update, no full re-render. */
  addOption(option: MultiSelectOption, select = true) {
    // Avoid duplicates
    if (!this._options.some(o => o.value === option.value)) {
      this._options.push(option);
    }
    if (select) {
      this._selected.add(option.value);
    }
    this._emitAndUpdate();
  }

  get value(): string { return this.inputValue; }
  set value(v: string) { this.inputValue = v; }

  /** Unified interface — comma-separated string */
  get inputValue(): string { return this.getSelected().join(','); }
  set inputValue(v: string) { this.setSelected(v ? v.split(',') : []); }

  /**
   * One `FormData` entry per selected value, under this control's `name` — the native
   * `<select multiple>` shape, so a server binds a list (ASP.NET Core `string[]`, PHP `name[]`, …)
   * instead of having to split a delimited string. Nothing is submitted when the selection is empty,
   * again matching native.
   *
   * `value` / `inputValue` keep returning the comma-joined string: `b-form` and every existing consumer
   * read that, and form participation is an additional surface, not a replacement. Note the joined form
   * is lossy for values containing a comma — the multi-entry form is not, which is the other reason to
   * prefer it here.
   */
  protected formValue(): FormData | null {
    return this.multiFormValue(this.getSelected());
  }

  /**
   * There is no `value` attribute on this control — its selection comes from `setSelected()` — so the base
   * default would reset it by parsing `null` and clearing the list. Snapshot the selection instead.
   *
   * Note the baseline is taken at first sync, i.e. before a page's `setOptions()`/`setSelected()` usually
   * run; call `resetFormBaseline()` after populating if `form.reset()` should return to that state.
   */
  protected captureInitialState(): unknown {
    return this.getSelected();
  }

  protected restoreInitialState(state: unknown): void {
    this.setSelected(Array.isArray(state) ? [...state as string[]] : []);
  }

  /** Div-based combo — no native primitive to mirror; the base's generic `required` check applies. */
  protected validationSource(): undefined {
    return undefined;
  }

  protected formAnchor(): HTMLElement | undefined {
    return this.$<HTMLElement>('.container') ?? undefined;
  }


  render() {
    const label = this.attr('label');
    const error = this.attr('error');
    const placeholder = this.attr('placeholder', 'Select...');
    const disabled = this.boolAttr('disabled');
    const searchable = this.boolAttr('searchable');

    const chips = this._options
      .filter(o => this._selected.has(o.value))
      .map(o => `
        <span class="chip">
          ${o.color ? `<span class="chip-dot" style="background:${escapeAttr(o.color)}"></span>` : ''}
          ${escapeHtml(o.label)}
          <button class="chip-remove" data-value="${escapeAttr(o.value)}" type="button" aria-label="${this.attr('label-remove', 'Remove')} ${escapeAttr(o.label)}">&times;</button>
        </span>
      `).join('');

    const filterLower = this._filter.toLowerCase();
    const filtered = searchable && this._filter
      ? this._options.filter(o => o.label.toLowerCase().includes(filterLower) || o.value.toLowerCase().includes(filterLower))
      : this._options;

    const noMatchesLabel = this.attr('label-no-matches', 'No matches');
    const searchLabel = this.attr('label-search', 'Search...');

    const description = this.attr('description');
    const bare = this.boolAttr('bare');
    const required = this.boolAttr('required');
    return renderField({
      bare,
      uid: this.uid,
      label,
      hint: this.attr('hint'),
      description,
      error,
      required,
      // `.dropdown` is resolved by selector in onUpdated and anchored to `.container` — both stay in
      // the control so bare mode keeps a working popover.
      control: `
        <div class="container combo-container ${error ? 'has-error' : ''} ${disabled ? 'disabled' : ''}"
             tabindex="${disabled ? '-1' : '0'}"
             aria-haspopup="true"
             aria-expanded="${this._open}"
             aria-controls="${this.uid}-opts"
             ${fieldAria({ uid: this.uid, error, description, required, bare, label })}>
          ${chips || `<span class="placeholder">${placeholder}</span>`}
        </div>
        <div class="dropdown" popover="manual" id="${this.uid}-opts" role="group" aria-label="${label || this.attr('label-options', 'Options')}">
          ${searchable ? `<div class="search-wrap"><input type="text" class="dd-search" placeholder="${searchLabel}" value="${escapeAttr(this._filter)}" /></div>` : ''}
          ${filtered.length > 0 ? filtered.map(o => `
            <label class="option">
              <input type="checkbox" value="${escapeAttr(o.value)}" ${this._selected.has(o.value) ? 'checked' : ''} />
              ${o.color ? `<span class="option-dot" style="background:${escapeAttr(o.color)}"></span>` : ''}
              ${escapeHtml(o.label)}
            </label>
          `).join('') : `<div class="no-results">${noMatchesLabel}</div>`}
        </div>`,
    });
  }

  protected update(): void {
    this._wiredContainer = null;
    super.update();
  }

  protected onUpdated() {
    // Before the re-wiring guards below: `setSelected()` / `setOptions()` change state and re-render
    // without emitting, so this is the only place that reliably sees every value change.
    this.syncFormState();

    const container = this.$<HTMLElement>('.container');
    const dropdown = this.$<HTMLElement>('.dropdown');
    if (!container || !dropdown) return;
    // Skip re-wiring if onUpdated fires twice without an intervening update()
    // (e.g. b-form populates options after the element's own connectedCallback
    // has already wired). Otherwise the container click handler gets registered
    // twice on the same AbortController and a single click both opens and
    // closes the dropdown.
    if (this._wiredContainer === container) return;
    this._wiredContainer = container;

    // Toggle dropdown on container click
    this.listen(container, 'click', (e) => {
      if ((e.target as HTMLElement).classList.contains('chip-remove')) return;
      if (this._open) {
        this._closeDropdown();
      } else {
        this._openDropdown(container, dropdown);
      }
    });

    // Outside click → close
    if (this._outsideClickHandler) {
      document.removeEventListener('mousedown', this._outsideClickHandler);
    }
    this._outsideClickHandler = (e: Event) => {
      const path = e.composedPath();
      if (!path.includes(container) && !path.includes(dropdown)) {
        this._closeDropdown();
      }
    };
    this.listen(document, 'mousedown', this._outsideClickHandler);

    // Close on Escape
    this.listen(container, 'keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Escape') this._closeDropdown();
    });

    // Chip remove buttons
    this.$$<HTMLElement>('.chip-remove').forEach(btn => {
      this.listen(btn, 'click', (e) => {
        e.stopPropagation();
        this._selected.delete(btn.dataset.value!);
        this._emitAndUpdate();
      });
    });

    // Search input
    const searchInput = this.$<HTMLInputElement>('.dd-search');
    if (searchInput) {
      this.listen(searchInput, 'input', () => {
        this._filter = searchInput.value;
        this._refreshOptions(dropdown);
        this.emit('search', { query: this._filter, name: this.attr('name') });
      });
      this.listen(searchInput, 'click', (e) => e.stopPropagation());
    }

    // Checkbox changes
    this._wireOptionCheckboxes(dropdown);

    // Creatable option click
    this._wireCreateOption(dropdown);
  }

  private _openDropdown(container: HTMLElement, dropdown: HTMLElement) {
    this._open = true;
    container.setAttribute('aria-expanded', 'true');

    // Position fixed dropdown below the container
    const rect = container.getBoundingClientRect();
    const gap = 4;
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.width = `${rect.width}px`;
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < 200 && rect.top > spaceBelow) {
      dropdown.style.top = '';
      dropdown.style.bottom = `${window.innerHeight - rect.top + gap}px`;
    } else {
      dropdown.style.bottom = '';
      dropdown.style.top = `${rect.bottom + gap}px`;
    }

    // Promote to top-layer so it renders above <dialog> modals.
    try { (dropdown as any).showPopover?.(); }
    catch { /* already open */ }
    dropdown.classList.add('open');
    // Belt-and-suspenders: force visibility even if popover API silently failed.
    dropdown.style.setProperty('display', 'block', 'important');

    // Focus search input if searchable
    const searchInput = this.$<HTMLInputElement>('.dd-search');
    if (searchInput) searchInput.focus();
  }

  private _closeDropdown() {
    if (!this._open) return;
    this._open = false;
    const dropdown = this.$<HTMLElement>('.dropdown');
    const container = this.$<HTMLElement>('.container');
    try { (dropdown as any)?.hidePopover?.(); }
    catch { /* already closed */ }
    dropdown?.classList.remove('open');
    dropdown?.style.removeProperty('display');
    container?.setAttribute('aria-expanded', 'false');
    if (this._filter) {
      this._filter = '';
      if (dropdown) this._refreshOptions(dropdown);
    }
  }

  private _emitAndUpdate() {
    this.emit('change', { name: this.attr('name'), values: this.getSelected() });
    this.syncFormState();
    this._updateChips();
    const dropdown = this.$<HTMLElement>('.dropdown');
    if (dropdown) this._refreshOptions(dropdown);
  }

  /** Refresh dropdown options in-place without full re-render. */
  private _refreshOptions(dropdown: HTMLElement) {
    // Preserve scroll position — rebuilding the option nodes would otherwise
    // reset scrollTop to 0, jumping the list back to the top when a user
    // toggles a selection partway down.
    const prevScrollTop = dropdown.scrollTop;
    const searchWrap = dropdown.querySelector('.search-wrap');
    const filterLower = this._filter.toLowerCase();
    const filtered = this._filter
      ? this._options.filter(o => o.label.toLowerCase().includes(filterLower) || o.value.toLowerCase().includes(filterLower))
      : this._options;

    // Remove all children except search wrap
    for (const child of Array.from(dropdown.children)) {
      if (child !== searchWrap) child.remove();
    }

    if (filtered.length === 0 && !this._canCreate()) {
      dropdown.insertAdjacentHTML('beforeend', `<div class="no-results">${this.attr('label-no-matches', 'No matches')}</div>`);
    } else if (filtered.length > 0) {
      dropdown.insertAdjacentHTML('beforeend', filtered.map(o => `
        <label class="option">
          <input type="checkbox" value="${escapeAttr(o.value)}" ${this._selected.has(o.value) ? 'checked' : ''} />
          ${o.color ? `<span class="option-dot" style="background:${escapeAttr(o.color)}"></span>` : ''}
          ${escapeHtml(o.label)}
        </label>
      `).join(''));
    }

    // Show create option when creatable and filter doesn't match existing
    if (this._canCreate() && this._filter.trim()) {
      const exactMatch = this._options.some(o => o.label.toLowerCase() === this._filter.trim().toLowerCase());
      if (!exactMatch) {
        const createLabel = this.attr('label-create', 'Create');
        dropdown.insertAdjacentHTML('beforeend',
          `<div class="option-create" data-create-value="${escapeAttr(this._filter.trim())}">+ ${createLabel} &ldquo;${escapeHtml(this._filter.trim())}&rdquo;</div>`
        );
      }
    }

    this._wireOptionCheckboxes(dropdown);
    this._wireCreateOption(dropdown);

    // Restore scroll position after the option nodes were rebuilt.
    dropdown.scrollTop = prevScrollTop;
  }

  private _wireOptionCheckboxes(dropdown: HTMLElement) {
    dropdown.querySelectorAll<HTMLInputElement>('.option input').forEach(input => {
      this.listen(input, 'change', () => {
        if (input.checked) {
          this._selected.add(input.value);
        } else {
          this._selected.delete(input.value);
        }
        this._emitAndUpdate();
      });
    });
  }

  private _wireCreateOption(dropdown: HTMLElement) {
    const createEl = dropdown.querySelector<HTMLElement>('.option-create');
    if (!createEl) return;
    this.listen(createEl, 'click', (e) => {
      e.stopPropagation();
      const name = createEl.dataset.createValue ?? this._filter.trim();
      if (!name) return;
      this.emit('create', { name });
      this._filter = '';
      const searchInput = this.$<HTMLInputElement>('.dd-search');
      if (searchInput) searchInput.value = '';
    });
  }

  /** Patch only the chips area — no full re-render. */
  private _updateChips() {
    const container = this.$<HTMLElement>('.container');
    if (!container) return;
    const placeholder = this.attr('placeholder', 'Select...');

    const chips = this._options
      .filter(o => this._selected.has(o.value))
      .map(o => `
        <span class="chip">
          ${o.color ? `<span class="chip-dot" style="background:${escapeAttr(o.color)}"></span>` : ''}
          ${escapeHtml(o.label)}
          <button class="chip-remove" data-value="${escapeAttr(o.value)}" type="button" aria-label="${this.attr('label-remove', 'Remove')} ${escapeAttr(o.label)}">&times;</button>
        </span>
      `).join('');

    container.innerHTML = chips || `<span class="placeholder">${placeholder}</span>`;

    // Re-wire chip remove buttons
    container.querySelectorAll<HTMLElement>('.chip-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._selected.delete(btn.dataset.value!);
        this._emitAndUpdate();
      });
    });
  }

  private _canCreate(): boolean {
    return this.boolAttr('creatable');
  }
}

define('b-multi-select', BMultiSelect);
