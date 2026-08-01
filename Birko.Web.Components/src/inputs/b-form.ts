import { BaseComponent, define, t as globalT, parseDecimal } from 'birko-web-core';
import { isActivationKey, escapeAttr } from '../dom-utils';

// ── Types ──

// `(string & {})` hints the known literals via IntelliSense while still accepting
// plain `string` from inline object literals (where TS widens `type: 'text'`).
export type FieldType =
  | 'text' | 'password' | 'email' | 'number' | 'percent' | 'decimal'
  | 'textarea' | 'markdown' | 'select' | 'multi-select' | 'tags'
  | 'checkbox' | 'switch' | 'radio' | 'search'
  | 'option-group' | 'file' | 'range' | 'date' | 'datetime' | 'date-range' | 'time' | 'custom'
  | (string & {});

export type RuleType =
  | 'required' | 'minLength' | 'maxLength'
  | 'min' | 'max' | 'range'
  | 'pattern' | 'email' | 'match' | 'custom'
  | (string & {});

export type ValidatorFn = (value: unknown, data: Record<string, unknown>) => string | null;

export interface ValidationRule {
  type: RuleType;
  value?: unknown;
  message?: string;
}

export interface GroupRule {
  message: string;
  validate: (groupData: Record<string, unknown>) => boolean;
}

export interface FormField {
  name: string;
  type: FieldType;
  label: string;
  placeholder?: string;
  /** Terse explainer, rendered as a tooltip behind a `?` icon beside the label. */
  hint?: string;
  /**
   * Persistent help text rendered under the control and wired into its `aria-describedby` — for a value
   * or constraint the user needs on screen while typing ("Goal 8000 steps", "Max 20 characters"). Use
   * {@link FormField.hint} instead for a terse explainer that can live behind a `?` icon. A field may
   * carry both.
   */
  description?: string;
  value?: unknown;
  rows?: number;
  fullWidth?: boolean;
  hidden?: boolean;
  disabled?: boolean;
  options?: { value: string; label: string }[];
  searchable?: boolean;
  creatable?: boolean;
  default?: unknown;
  required?: boolean;
  rules?: ValidationRule[];
  // Range- or markdown-specific
  mode?: 'single' | 'range' | 'split' | 'source' | 'preview';
  display?: 'both' | 'slider' | 'input';
  valueType?: 'number' | 'int' | 'percent';
  min?: number | string;
  max?: number | string;
  step?: number;
  // Date-specific
  native?: boolean;
  // Date-range-specific
  minDays?: number;
  maxDays?: number;
  monthsVisible?: 1 | 2;
  confirm?: boolean;
  presets?: { label: string; start: string; end: string }[];
  separator?: string;
  // Tags-specific
  separators?: string;
  maxCount?: number;
  allowDuplicates?: boolean;
}

export interface FormGroupDef {
  name: string;
  label?: string;
  // `string & {}` preserves IntelliSense while allowing consumers to pass inline
  // object literals (where `layout: 'stack'` widens to `string`) without `as const`.
  layout?: 'stack' | 'grid' | 'inline' | (string & {});
  collapsible?: boolean;
  collapsed?: boolean;
  children: (FormField | FormGroupDef)[];
  rules?: GroupRule[];
}

export interface FormSchema extends FormGroupDef {
  validateOn?: 'submit' | 'blur';
}

export interface FormResult {
  valid: boolean;
  data: Record<string, unknown>;
  errors: Record<string, string>;
  groupErrors: Record<string, string[]>;
}

function isGroup(child: FormField | FormGroupDef): child is FormGroupDef {
  return 'children' in child;
}

// ── Localisation ──

export type FormTranslateFn = (key: string, params?: Record<string, string | number>) => string;

/**
 * Resolve a validation key against (in order): the legacy `setTranslate` hook, the
 * global i18n singleton, and finally the English fallback with interpolation.
 */
function fmt(key: string, params: Record<string, string | number>, fallback: string): string {
  // Legacy shim — some apps (e.g. Symbio.UI) wire translations via BForm.setTranslate.
  if (_legacyTranslate) {
    const result = _legacyTranslate(key, params);
    if (result !== key) return result;
  }
  return globalT(key, params, fallback);
}

let _legacyTranslate: FormTranslateFn | null = null;

// ── Component ──

export class BForm extends BaseComponent {
  /**
   * @deprecated Prefer the global i18n singleton — call `useI18n(instance)` or
   * `getI18n().addMessages('en', { common: { required: '...' } })` so translations
   * are shared across all components. Kept as a backward-compatible shim.
   */
  static setTranslate(fn: FormTranslateFn): void {
    _legacyTranslate = fn;
  }

  static get observedAttributes() {
    return ['layout', 'validate-on', 'readonly', 'disabled'];
  }

  private _schema: FormSchema | null = null;
  private _collapsed = new Set<string>();
  private _errors = new Map<string, string>();       // dot-path → error
  private _fieldCallbacks?: Map<string, ((value: unknown, data: Record<string, unknown>) => void)[]>;
  private _settingValues = false;
  private _groupErrors = new Map<string, string[]>(); // group name → errors

  static get styles() {
    return `
      :host { display: block; }
      .b-form-group {
        border: var(--b-border-width, 1px) solid var(--b-border);
        border-radius: var(--b-radius-lg, 0.625rem);
        padding: 0;
        margin: 0 0 var(--b-space-lg, 1rem) 0;
      }
      .b-form-group:last-child { margin-bottom: 0; }
      .b-form-legend {
        font-size: var(--b-text-sm, 0.8125rem);
        font-weight: var(--b-font-weight-semibold, 600);
        color: var(--b-text-secondary);
        padding: 0 var(--b-space-sm, 0.5rem);
        margin-left: var(--b-space-md, 0.75rem);
      }
      .b-form-legend--toggle { cursor: pointer; user-select: none; }
      .b-form-collapse-icon {
        display: inline-block;
        transition: transform var(--b-transition, 150ms ease);
        font-size: var(--b-text-xs, 0.6875rem);
        margin-right: var(--b-space-xs, 0.25rem);
      }
      .b-form-collapse-icon.open { transform: rotate(90deg); }
      .b-form-group-body { padding: var(--b-space-lg, 1rem); }
      .b-form-group--stack {
        display: flex;
        flex-direction: column;
        gap: var(--b-space-lg, 1rem);
      }
      .b-form-group--grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--b-space-lg, 1rem);
      }
      .b-form-group--inline {
        display: flex;
        flex-wrap: wrap;
        gap: var(--b-space-lg, 1rem);
        align-items: flex-end;
      }
      .b-form-group--inline .b-form-field { flex: 0 0 auto; }
      .b-form-field--full {
        grid-column: 1 / -1;
        flex: 1 0 100%;
      }
      /* Labeled nested groups (fieldsets with legend) span full row in grid parent */
      .b-form-group--grid > .b-form-group:has(legend),
      .b-form-group--grid > .b-form-group--root-bare {
        grid-column: 1 / -1;
      }
      /* Label-less nested groups are pure layout wrappers — no chrome */
      .b-form-group:not(:has(legend)) {
        border: none;
        margin: 0;
      }
      .b-form-group:not(:has(legend)) > .b-form-group-body {
        padding: 0;
      }
      .b-form-field--hidden { display: none; }
      /* Align toggle fields (switch, checkbox, radio) with adjacent inputs in grid */
      .b-form-group--grid > .b-form-field--toggle {
        align-self: end;
        padding-bottom: var(--b-space-xs, 0.25rem);
      }
      .b-form-group--root-bare {
        border: none;
        padding: 0;
        margin: 0;
      }
      .b-form-group--root-bare > .b-form-group-body {
        padding: 0;
      }
      .b-form-group--invalid { border-color: var(--b-color-danger); }
      .b-form-group-error {
        font-size: var(--b-text-xs, 0.6875rem);
        color: var(--b-color-danger);
        font-weight: var(--b-font-weight-normal, 400);
        margin-left: var(--b-space-sm, 0.5rem);
      }
      .b-form-percent-wrap {
        position: relative;
      }
      .b-form-percent-sign {
        position: absolute;
        right: var(--b-space-sm, 0.5rem);
        bottom: 0;
        height: calc(var(--b-text-base, 0.875rem) + 2 * var(--b-space-sm, 0.5rem) + var(--b-border-width, 1px) * 2);
        display: flex;
        align-items: center;
        color: var(--b-text-secondary);
        font-size: var(--b-text-sm, 0.8125rem);
        pointer-events: none;
      }
      /* 40rem = the old 640px at a default 16px browser; rem in a media query tracks the
         reader's browser font size (a :root override does not affect it). */
      @media (max-width: 40rem) {
        .b-form-group--grid { grid-template-columns: 1fr; }
      }
    `;
  }

  // ── Public API ──

  setSchema(schema: FormSchema) {
    this._schema = schema;
    // Initialize collapsed state from schema
    this._collapsed.clear();
    this._walkGroups(schema, (g) => {
      if (g.collapsible && g.collapsed) this._collapsed.add(g.name);
    });
    // A schema swap changes the field set wholesale (e.g. create → edit, which drops/adds fields).
    // forceRender (full innerHTML) instead of the morphing update() so fields removed from the new
    // schema cannot survive as stale `[data-field]` nodes — values are repopulated right after via
    // reset()/setValues(), so there is no state to preserve.
    this.forceRender();
  }

  setValue(name: string, value: unknown) {
    this.setValues({ [name]: value });
  }

  setValues(values: Record<string, unknown>) {
    if (!this._schema) return;
    this._settingValues = true;
    // Convert percent fields from storage (0-1) to display (0-100) before setting
    const display = { ...values };
    this._convertPercent(this._schema, display, false);
    this._setGroupValues(this._schema, display, '');
    this._settingValues = false;
  }

  getValues(): Record<string, unknown> {
    if (!this._schema) return {};
    const data = this._getGroupValues(this._schema, '');
    this._convertPercent(this._schema, data, true);
    return data;
  }

  validate(): FormResult {
    if (!this._schema) return { valid: true, data: {}, errors: {}, groupErrors: {} };
    this._errors.clear();
    this._groupErrors.clear();

    // Validate against display values (percent as 0-100) so rules/messages make sense
    const displayData = this._getGroupValues(this._schema, '');
    this._validateGroup(this._schema, displayData, '', true);

    // Convert percent fields to storage values (0-1) for output
    const data = { ...displayData };
    this._convertPercent(this._schema, data, true);

    const errors: Record<string, string> = {};
    for (const [k, v] of this._errors) errors[k] = v;
    const groupErrors: Record<string, string[]> = {};
    for (const [k, v] of this._groupErrors) groupErrors[k] = v;

    const valid = this._errors.size === 0 && this._groupErrors.size === 0;

    // Show errors on fields
    this._applyErrors();

    return { valid, data, errors, groupErrors };
  }

  validateGroup(groupName: string): FormResult {
    if (!this._schema) return { valid: true, data: {}, errors: {}, groupErrors: {} };

    // Find the group
    let target: FormGroupDef | null = null;
    let prefix = '';
    this._walkGroups(this._schema, (g, p) => {
      if (g.name === groupName) { target = g; prefix = p; }
    });
    if (!target) return { valid: true, data: this.getValues(), errors: {}, groupErrors: {} };

    // Clear only this group's errors
    const pfx = prefix ? prefix + '.' : '';
    for (const k of this._errors.keys()) {
      if (k.startsWith(pfx)) this._errors.delete(k);
    }
    this._groupErrors.delete(groupName);

    const data = this.getValues();
    const groupData = prefix ? this._getNestedValue(data, prefix) as Record<string, unknown> : data;
    this._validateGroup(target, groupData ?? {}, prefix);

    this._applyErrors();

    const errors: Record<string, string> = {};
    for (const [k, v] of this._errors) errors[k] = v;
    const groupErrs: Record<string, string[]> = {};
    for (const [k, v] of this._groupErrors) groupErrs[k] = v;
    const valid = this._errors.size === 0 && this._groupErrors.size === 0;
    return { valid, data, errors, groupErrors: groupErrs };
  }

  clearErrors() {
    this._errors.clear();
    this._groupErrors.clear();
    this._applyErrors();
  }

  reset() {
    if (!this._schema) return;
    this._errors.clear();
    this._groupErrors.clear();
    this._resetGroup(this._schema, '');
    this._applyErrors();
  }

  setFieldError(path: string, error: string) {
    this._errors.set(path, error);
    this._applyErrors();
  }

  setFieldOptions(path: string, options: { value: string; label: string }[]) {
    const el = this._getFieldElement(path);
    if (el && 'setOptions' in el) {
      (el as any).setOptions(options);
    }
  }

  /** Set (or clear) the hint text shown under a field, after the form is rendered. */
  setFieldHint(path: string, hint: string | null) {
    const el = this._getFieldElement(path);
    if (!el) return;
    if (hint) el.setAttribute('hint', hint);
    else el.removeAttribute('hint');
  }

  /** Add a single option to a multi-select field and optionally select it (no full re-render). */
  addFieldOption(path: string, option: { value: string; label: string; color?: string }, select = true) {
    const el = this._getFieldElement(path);
    if (el && 'addOption' in el) {
      (el as any).addOption(option, select);
    }
  }

  focusField(path: string) {
    const el = this._getFieldElement(path);
    if (el) {
      const input = (el.shadowRoot ?? el).querySelector('input, select, textarea') as HTMLElement;
      (input ?? el).focus();
    }
  }

  setFieldDisabled(path: string, disabled: boolean) {
    const el = this._getFieldElement(path);
    if (el) {
      if (disabled) el.setAttribute('disabled', '');
      else el.removeAttribute('disabled');
    }
  }

  /** Register a callback for when a specific field value changes. */
  onFieldChange(
    path: string,
    callback: (value: unknown, data: Record<string, unknown>) => void,
  ): () => void {
    this._fieldCallbacks ??= new Map();
    let list = this._fieldCallbacks.get(path);
    if (!list) { list = []; this._fieldCallbacks.set(path, list); }
    list.push(callback);
    return () => {
      const l = this._fieldCallbacks?.get(path);
      if (l) {
        const idx = l.indexOf(callback);
        if (idx !== -1) l.splice(idx, 1);
      }
    };
  }

  // ── Rendering ──

  render() {
    if (!this._schema) return '<slot></slot>';
    return this._renderGroup(this._schema, '', true);
  }

  private _renderGroup(group: FormGroupDef, prefix: string, isRoot: boolean): string {
    const path = prefix ? `${prefix}.${group.name}` : (isRoot ? '' : group.name);
    const layout = group.layout ?? this.attr('layout', 'stack') as 'stack' | 'grid' | 'inline';
    const isCollapsed = this._collapsed.has(group.name);
    const hasLabel = !!group.label;
    const isBareRoot = isRoot && !hasLabel;
    const groupErrs = this._groupErrors.get(group.name);
    const isInvalid = !!groupErrs?.length;

    const bodyClasses = `b-form-group-body b-form-group--${layout}`;
    const bodyStyle = (group.collapsible && isCollapsed) ? 'display:none' : '';

    const children = group.children.map(child => {
      if (isGroup(child)) {
        return this._renderGroup(child, path, false);
      }
      return this._renderField(child, path);
    }).join('');

    if (isBareRoot) {
      return `<div class="b-form-group b-form-group--root-bare"><div class="${bodyClasses}">${children}</div></div>`;
    }

    const legendContent = group.collapsible
      ? `<span class="b-form-collapse-icon ${isCollapsed ? '' : 'open'}" data-group="${group.name}">&#9654;</span>${group.label ?? ''}`
      : (group.label ?? '');

    const errHtml = groupErrs
      ? groupErrs.map(e => `<span class="b-form-group-error">${e}</span>`).join('')
      : '';

    const bodyId = `${this.uid}-fg-${group.name}`;
    const legendAttrs = group.collapsible
      ? ` role="button" tabindex="0" aria-expanded="${!isCollapsed}" aria-controls="${bodyId}"`
      : '';

    return `
      <fieldset class="b-form-group ${isInvalid ? 'b-form-group--invalid' : ''}" data-group="${group.name}">
        ${hasLabel ? `<legend class="b-form-legend ${group.collapsible ? 'b-form-legend--toggle' : ''}"${legendAttrs}>${legendContent}${errHtml}</legend>` : ''}
        <div class="${bodyClasses}" id="${bodyId}" ${bodyStyle ? `style="${escapeAttr(bodyStyle)}"` : ''}>
          ${children}
        </div>
      </fieldset>
    `;
  }

  private _renderField(field: FormField, prefix: string): string {
    const path = prefix ? `${prefix}.${field.name}` : field.name;
    const error = this._errors.get(path) ?? '';
    const disabled = this.boolAttr('disabled');
    const readonly = this.boolAttr('readonly');
    const isToggle = field.type === 'switch' || field.type === 'checkbox' || field.type === 'radio';
    const classes = `b-form-field ${field.fullWidth ? 'b-form-field--full' : ''} ${field.hidden ? 'b-form-field--hidden' : ''} ${isToggle ? 'b-form-field--toggle' : ''}`;

    if (field.type === 'custom') {
      return `<div class="${classes}" data-field="${path}"><slot name="${field.name}"></slot></div>`;
    }

    const tag = this._fieldTag(field);
    const attrs = this._fieldAttrs(field, path, error, disabled || readonly || !!field.disabled);

    if (field.type === 'percent') {
      return `<div class="${classes}" data-field="${path}"><div class="b-form-percent-wrap">${tag(attrs)}<span class="b-form-percent-sign">%</span></div></div>`;
    }

    return `<div class="${classes}" data-field="${path}">${tag(attrs)}</div>`;
  }

  private _fieldTag(field: FormField): (attrs: string) => string {
    switch (field.type) {
      case 'textarea':
        return (a) => `<b-textarea ${a}></b-textarea>`;
      case 'markdown':
        return (a) => `<b-markdown-editor ${a}></b-markdown-editor>`;
      case 'tags':
        return (a) => `<b-tag-input ${a}></b-tag-input>`;
      case 'select':
        return (a) => `<b-select ${a}></b-select>`;
      case 'multi-select':
        return (a) => `<b-multi-select ${a}></b-multi-select>`;
      case 'checkbox':
        return (a) => `<b-checkbox ${a}></b-checkbox>`;
      case 'switch':
        return (a) => `<b-switch ${a}></b-switch>`;
      case 'radio':
        // Radio renders a group of radio buttons
        return (a) => (field.options ?? []).map(o =>
          `<b-radio name="${field.name}" value="${o.value}" label="${o.label}" ${a.includes('disabled') ? 'disabled' : ''}></b-radio>`
        ).join('');
      case 'option-group':
        return (a) => `<b-option-group ${a}></b-option-group>`;
      case 'search':
        return (a) => `<b-search-input ${a}></b-search-input>`;
      case 'file':
        return (a) => `<b-file-upload ${a}></b-file-upload>`;
      case 'range':
        return (a) => `<b-range ${a}></b-range>`;
      case 'date':
        return (a) => `<b-date-picker ${a}></b-date-picker>`;
      case 'datetime':
        return (a) => `<b-datetime-picker ${a}></b-datetime-picker>`;
      case 'date-range':
        return (a) => `<b-date-range-picker ${a}></b-date-range-picker>`;
      case 'time':
        return (a) => `<b-time ${a}></b-time>`;
      default: // text, password, email, number
        return (a) => `<b-input ${a}></b-input>`;
    }
  }

  private _fieldAttrs(field: FormField, path: string, error: string, disabled: boolean): string {
    // Escape every interpolated value: field.value comes from loaded entity data and
    // label/hint/placeholder/error from the schema, so an unescaped double-quote or angle bracket
    // would break out of the attribute and inject markup into the shadow tree.
    const parts: string[] = [`data-path="${escapeAttr(path)}"`];

    if (field.type !== 'radio') {
      parts.push(`name="${escapeAttr(field.name)}"`);
      if (field.label) parts.push(`label="${escapeAttr(field.label)}"`);
    }

    if (field.hint) parts.push(`hint="${escapeAttr(field.hint)}"`);
    if (field.description) parts.push(`description="${escapeAttr(field.description)}"`);
    if (field.value !== undefined && field.value !== '') parts.push(`value="${escapeAttr(String(field.value))}"`);
    if (field.placeholder) parts.push(`placeholder="${escapeAttr(field.placeholder)}"`);
    if (error) parts.push(`error="${escapeAttr(error)}"`);
    if (disabled) parts.push('disabled');
    const isRequired = field.required || field.rules?.some(r => r.type === 'required');
    if (isRequired) parts.push('required');

    // Type-specific
    switch (field.type) {
      case 'password': case 'email': case 'number':
        parts.push(`type="${field.type}"`);
        break;
      case 'percent':
        parts.push('type="number"');
        break;
      // `decimal` is a b-input component mode, not an HTML input type, so the attribute has to be
      // forwarded for it to engage at all — without this case the switch emitted no `type`, b-input
      // defaulted to `text`, and the whole mode silently vanished: no `inputmode="decimal"` (so a
      // comma-locale keypad never appeared), no range/step check, no badInput. The field looked fine
      // and accepted anything, which is the exact hundredfold-wrong-value failure the mode exists to
      // prevent.
      //
      // min/max/step go on the HOST, unlike every other numeric field here. b-input deliberately does
      // NOT forward them to its inner control in this mode (a `type="text"` input ignores them, and
      // advertising an unenforced constraint is worse than none) and enforces them itself in
      // syncFormState by reading them off the host. So the host is where they have to land.
      case 'decimal':
        parts.push('type="decimal"');
        if (field.min !== undefined) parts.push(`min="${escapeAttr(String(field.min))}"`);
        if (field.max !== undefined) parts.push(`max="${escapeAttr(String(field.max))}"`);
        if (field.step !== undefined) parts.push(`step="${escapeAttr(String(field.step))}"`);
        break;
      case 'textarea':
        if (field.rows) parts.push(`rows="${field.rows}"`);
        break;
      case 'markdown':
        if (field.rows) parts.push(`rows="${field.rows}"`);
        if (field.mode) parts.push(`mode="${field.mode}"`);
        break;
      case 'tags':
        if (field.separators) parts.push(`separators="${field.separators}"`);
        if (field.maxCount !== undefined) parts.push(`max-count="${field.maxCount}"`);
        if (field.allowDuplicates) parts.push('allow-duplicates');
        break;
      case 'select':
      case 'multi-select':
        if (field.searchable) parts.push('searchable');
        if (field.creatable) parts.push('creatable');
        break;
      case 'range':
        if (field.mode) parts.push(`mode="${field.mode}"`);
        if (field.display) parts.push(`display="${field.display}"`);
        if (field.valueType) parts.push(`value-type="${field.valueType}"`);
        if (field.min !== undefined) parts.push(`min="${field.min}"`);
        if (field.max !== undefined) parts.push(`max="${field.max}"`);
        if (field.step !== undefined) parts.push(`step="${field.step}"`);
        break;
      case 'date':
        if (field.min !== undefined) parts.push(`min="${field.min}"`);
        if (field.max !== undefined) parts.push(`max="${field.max}"`);
        if (field.native) parts.push('native');
        break;
      case 'datetime':
        if (field.min !== undefined) parts.push(`min="${field.min}"`);
        if (field.max !== undefined) parts.push(`max="${field.max}"`);
        break;
      case 'date-range':
        if (field.min !== undefined) parts.push(`min="${field.min}"`);
        if (field.max !== undefined) parts.push(`max="${field.max}"`);
        if (field.minDays !== undefined) parts.push(`min-days="${field.minDays}"`);
        if (field.maxDays !== undefined) parts.push(`max-days="${field.maxDays}"`);
        if (field.monthsVisible !== undefined) parts.push(`months-visible="${field.monthsVisible}"`);
        if (field.confirm) parts.push('confirm');
        if (field.native) parts.push('native');
        if (field.separator) parts.push(`separator="${field.separator}"`);
        if (field.presets) parts.push(`presets='${JSON.stringify(field.presets).replace(/'/g, '&apos;')}'`);
        break;
      case 'time':
        if (field.min !== undefined) parts.push(`min="${field.min}"`);
        if (field.max !== undefined) parts.push(`max="${field.max}"`);
        if (field.step !== undefined) parts.push(`step="${field.step}"`);
        break;
    }

    return parts.join(' ');
  }

  // ── Events ──

  protected onUpdated() {
    if (!this._schema) return;

    // Wire up field change events
    this._wireFieldEvents(this._schema, '', true);

    // Wire up collapsible group toggles
    const toggleGroup = (legend: HTMLElement) => {
      const icon = legend.querySelector('.b-form-collapse-icon') as HTMLElement;
      const groupName = icon?.dataset.group;
      if (!groupName) return;

      if (this._collapsed.has(groupName)) {
        this._collapsed.delete(groupName);
      } else {
        this._collapsed.add(groupName);
      }
      this.update();
      this.emit('group-toggle', { group: groupName, collapsed: this._collapsed.has(groupName) });
    };
    this.$$<HTMLElement>('.b-form-legend--toggle').forEach(legend => {
      this.listen(legend, 'click', () => toggleGroup(legend));
      // The legend exposes role="button"; honor Enter/Space activation for keyboard users.
      this.listen<KeyboardEvent>(legend, 'keydown', (e) => {
        if (!isActivationKey(e)) return;
        e.preventDefault();
        toggleGroup(legend);
      });
    });

    // Populate select/multi-select options from schema
    this._populateOptions(this._schema, '');

    // Submit-on-Enter: fire a `submit` CustomEvent when the user hits Enter in a
    // single-line text input. Multi-line inputs (textarea / contenteditable),
    // toggles, file pickers, buttons, IME composition, and already-handled events
    // are ignored. Consumers opt in by adding a `submit` listener on the b-form.
    if (this.shadowRoot) {
      this.listen(this.shadowRoot, 'keydown', ((e: KeyboardEvent) => {
        if (e.key !== 'Enter') return;
        if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
        if ((e as { isComposing?: boolean }).isComposing) return;
        if (e.defaultPrevented) return;

        const target = e.composedPath()[0] as HTMLElement | undefined;
        if (!target) return;
        if (target instanceof HTMLTextAreaElement) return;
        if (target instanceof HTMLButtonElement) return;
        if (target.isContentEditable) return;
        if (target instanceof HTMLInputElement) {
          const skip = ['checkbox', 'radio', 'file', 'range', 'color', 'button', 'submit', 'reset'];
          if (skip.includes(target.type)) return;
        }

        e.preventDefault();
        this.emit('submit', this.validate());
      }) as EventListener);
    }
  }

  private _wireFieldEvents(group: FormGroupDef, prefix: string, isRoot = false) {
    const path = prefix ? `${prefix}.${group.name}` : (isRoot ? '' : group.name);

    for (const child of group.children) {
      if (isGroup(child)) {
        this._wireFieldEvents(child, path, false);
        continue;
      }

      const fieldPath = path ? `${path}.${child.name}` : child.name;
      const el = this._getFieldElement(fieldPath);
      if (!el) continue;

      const eventName = child.type === 'search' ? 'search' : 'change';
      this.listen(el, eventName, ((e: CustomEvent) => {
        // Clear field error on change
        if (this._errors.has(fieldPath)) {
          this._errors.delete(fieldPath);
          this._applyErrors();
        }

        // Validate on blur mode: validate this field
        if (this.attr('validate-on') === 'blur') {
          this._validateField(child, this._getFieldValue(el, child), this.getValues(), fieldPath);
          this._applyErrors();
        }

        if (this._settingValues) return;
        const changeValue = e.detail?.value ?? e.detail?.checked ?? e.detail?.values;
        const changeData = this.getValues();
        this.emit('change', { path: fieldPath, value: changeValue, data: changeData });
        const cbs = this._fieldCallbacks?.get(fieldPath);
        if (cbs?.length) queueMicrotask(() => cbs.forEach(cb => cb(changeValue, changeData as Record<string, unknown>)));
      }) as EventListener);
    }
  }

  private _populateOptions(group: FormGroupDef, prefix: string) {
    const isRoot = group.name === 'root' && !prefix;
    const path = isRoot ? '' : (prefix ? `${prefix}.${group.name}` : group.name);

    for (const child of group.children) {
      if (isGroup(child)) {
        this._populateOptions(child, path);
        continue;
      }

      if ((child.type === 'select' || child.type === 'multi-select' || child.type === 'option-group') && child.options) {
        const fieldPath = path ? `${path}.${child.name}` : child.name;
        const el = this._getFieldElement(fieldPath);
        if (el && 'setOptions' in el) {
          (el as any).setOptions(child.options);
        }
      }
    }
  }

  // ── Validation ──

  private _validateGroup(group: FormGroupDef, data: Record<string, unknown>, prefix: string, isRoot = false) {
    const path = prefix ? `${prefix}.${group.name}` : (isRoot ? '' : group.name);

    for (const child of group.children) {
      if (isGroup(child)) {
        const childData = (data[child.name] as Record<string, unknown>) ?? {};
        this._validateGroup(child, childData, path);
      } else {
        const fieldPath = path ? `${path}.${child.name}` : child.name;
        const value = data[child.name];
        this._validateField(child, value, data, fieldPath);
      }
    }

    // Group-level rules
    if (group.rules) {
      const groupErrs: string[] = [];
      for (const rule of group.rules) {
        if (!rule.validate(data)) {
          groupErrs.push(rule.message);
        }
      }
      if (groupErrs.length) this._groupErrors.set(group.name, groupErrs);
    }
  }

  private _validateField(field: FormField, value: unknown, allData: Record<string, unknown>, path: string) {
    // Required check — honour both field.required and rules: [{ type: 'required' }]
    const requiredRule = field.rules?.find(r => r.type === 'required');
    const isRequired = field.required || !!requiredRule;
    if (isRequired) {
      if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
        this._errors.set(path, requiredRule?.message
          ?? fmt('common.required', { label: field.label }, '{label} is required'));
        return; // Stop on first error
      }
    }

    if (!field.rules) return;

    // Skip other rules on empty optional fields — no point validating format of blank value
    const isEmpty = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);

    for (const rule of field.rules) {
      if (rule.type === 'required') continue; // Already handled above
      if (isEmpty) continue; // Don't validate format/length/etc. of blank optional fields

      const err = this._checkRule(rule, field, value, allData);
      if (err) {
        this._errors.set(path, err);
        return; // Stop on first error
      }
    }
  }

  private _checkRule(rule: ValidationRule, field: FormField, value: unknown, allData: Record<string, unknown>): string | null {
    const str = String(value ?? '');
    // `decimal` fields hold a user-typed string that may use a comma, and `_getFieldValue` returns it
    // raw — so `Number('81,8')` is NaN, and every numeric comparison below silently answers false:
    // a `min`/`max`/`range` RULE would never fire on a comma value. Now that the `min`/`max`
    // attributes are enforced by b-input for this type, leaving the rules fail-open would mean the
    // two spellings of the same constraint disagree.
    //
    // A null parse (blank, or unparseable) deliberately stays NaN, so the numeric rules keep passing
    // and the existing owners of those cases still report them exactly once — `required` for blank,
    // b-input's own `badInput` for junk.
    const num = field.type === 'decimal' ? (parseDecimal(str) ?? NaN) : Number(value);

    switch (rule.type) {
      case 'minLength':
        if (str.length < (rule.value as number))
          return rule.message ?? fmt('common.minLength', { label: field.label, value: rule.value as number }, '{label} must be at least {value} characters');
        break;
      case 'maxLength':
        if (str.length > (rule.value as number))
          return rule.message ?? fmt('common.maxLength', { label: field.label, value: rule.value as number }, '{label} must be at most {value} characters');
        break;
      case 'min':
        if (num < (rule.value as number))
          return rule.message ?? fmt('common.min', { label: field.label, value: rule.value as number }, '{label} must be at least {value}');
        break;
      case 'max':
        if (num > (rule.value as number))
          return rule.message ?? fmt('common.max', { label: field.label, value: rule.value as number }, '{label} must be at most {value}');
        break;
      case 'range': {
        const [min, max] = rule.value as [number, number];
        if (num < min || num > max)
          return rule.message ?? fmt('common.range', { label: field.label, min, max }, '{label} must be between {min} and {max}');
        break;
      }
      case 'pattern': {
        const regex = rule.value instanceof RegExp ? rule.value : new RegExp(rule.value as string);
        if (!regex.test(str))
          return rule.message ?? fmt('common.invalidFormat', { label: field.label }, '{label} format is invalid');
        break;
      }
      case 'email':
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str))
          return rule.message ?? fmt('common.invalidEmail', { label: field.label }, 'Invalid email address');
        break;
      case 'match':
        if (str !== String(allData[rule.value as string] ?? ''))
          return rule.message ?? fmt('common.mustMatch', { label: field.label, value: rule.value as string }, '{label} must match {value}');
        break;
      case 'custom': {
        const fn = rule.value as ValidatorFn;
        return fn(value, allData);
      }
    }
    return null;
  }

  private _applyErrors() {
    // Set/clear error attribute on each field element
    if (!this._schema) return;
    this._walkFields(this._schema, '', (field, path) => {
      const el = this._getFieldElement(path);
      if (!el) return;
      const err = this._errors.get(path);
      if (err) {
        el.setAttribute('error', err);
      } else {
        el.removeAttribute('error');
      }
    });

    // Update group error display
    this.$$<HTMLElement>('.b-form-group').forEach(fieldset => {
      const groupName = fieldset.dataset.group!;
      const errs = this._groupErrors.get(groupName);
      fieldset.classList.toggle('b-form-group--invalid', !!errs?.length);
      // Update error spans in legend
      const errSpans = fieldset.querySelectorAll('.b-form-group-error');
      errSpans.forEach(s => s.remove());
      if (errs?.length) {
        const legend = fieldset.querySelector('.b-form-legend');
        if (legend) {
          for (const e of errs) {
            const span = document.createElement('span');
            span.className = 'b-form-group-error';
            span.textContent = e;
            legend.appendChild(span);
          }
        }
      }
    });
  }

  // ── Data helpers ──

  private _getGroupValues(group: FormGroupDef, prefix: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const child of group.children) {
      if (isGroup(child)) {
        result[child.name] = this._getGroupValues(child, prefix ? `${prefix}.${child.name}` : child.name);
      } else {
        const path = prefix ? `${prefix}.${child.name}` : child.name;
        const el = this._getFieldElement(path);
        if (el) result[child.name] = this._getFieldValue(el, child);
      }
    }
    return result;
  }

  private _setGroupValues(group: FormGroupDef, values: Record<string, unknown>, prefix: string) {
    for (const child of group.children) {
      const val = values[child.name];
      if (val === undefined) continue;

      if (isGroup(child)) {
        if (typeof val === 'object' && val !== null) {
          this._setGroupValues(child, val as Record<string, unknown>, prefix ? `${prefix}.${child.name}` : child.name);
        }
      } else {
        const path = prefix ? `${prefix}.${child.name}` : child.name;
        const el = this._getFieldElement(path);
        if (!el) continue;
        this._setFieldValue(el, child, val);
      }
    }
  }

  private _resetGroup(group: FormGroupDef, prefix: string) {
    for (const child of group.children) {
      if (isGroup(child)) {
        this._resetGroup(child, prefix ? `${prefix}.${child.name}` : child.name);
      } else {
        const path = prefix ? `${prefix}.${child.name}` : child.name;
        const el = this._getFieldElement(path);
        if (!el) continue;
        this._setFieldValue(el, child, child.default ?? (child.type === 'checkbox' || child.type === 'switch' ? false : ''));
      }
    }
  }

  private _getFieldValue(el: HTMLElement, field: FormField): unknown {
    switch (field.type) {
      case 'checkbox':
      case 'switch':
        return (el as any).checked ?? el.hasAttribute('checked');
      case 'multi-select':
        return 'getSelected' in el ? (el as any).getSelected() : [];
      case 'tags':
        return 'getTags' in el ? (el as any).getTags() : [];
      case 'file':
        return 'getFiles' in el ? (el as any).getFiles() : [];
      case 'range': {
        const raw = 'inputValue' in el ? (el as any).inputValue : '';
        if ((field.mode ?? 'single') === 'range') {
          try { return JSON.parse(raw); } catch { return { from: 0, to: 0 }; }
        }
        return Number(raw) || 0;
      }
      case 'date-range': {
        const raw = 'inputValue' in el ? (el as any).inputValue : '';
        if (!raw) return null;
        const idx = raw.indexOf('/');
        if (idx < 0) return null;
        return { start: raw.slice(0, idx), end: raw.slice(idx + 1) };
      }
      default:
        // All Birko input components expose unified inputValue getter
        return 'inputValue' in el ? (el as any).inputValue : el.getAttribute('value') ?? '';
    }
  }

  private _setFieldValue(el: HTMLElement, field: FormField, value: unknown) {
    switch (field.type) {
      case 'checkbox':
      case 'switch':
        if (value) el.setAttribute('checked', '');
        else el.removeAttribute('checked');
        break;
      case 'multi-select':
        if ('setSelected' in el) (el as any).setSelected(value as string[]);
        break;
      case 'tags':
        if ('setTags' in el) (el as any).setTags(Array.isArray(value) ? value as string[] : []);
        break;
      case 'range':
        if ('inputValue' in el) {
          (el as any).inputValue = typeof value === 'object'
            ? JSON.stringify(value)
            : String(value ?? '');
        }
        break;
      case 'date-range':
        if ('inputValue' in el) {
          if (value && typeof value === 'object' && 'start' in (value as object) && 'end' in (value as object)) {
            const v = value as { start: string; end: string };
            (el as any).inputValue = v.start && v.end ? `${v.start}/${v.end}` : '';
          } else {
            (el as any).inputValue = String(value ?? '');
          }
        }
        break;
      default:
        // All Birko input components expose unified inputValue setter
        // (b-input, b-textarea, b-select, b-search-input, b-date-picker, b-option-group)
        if ('inputValue' in el) {
          (el as any).inputValue = String(value ?? '');
        } else {
          el.setAttribute('value', String(value ?? ''));
        }
    }
  }

  // ── Percent conversion ──

  /** Walk schema tree and convert percent fields in data: toStorage divides by 100, toDisplay multiplies by 100. */
  private _convertPercent(group: FormGroupDef, data: Record<string, unknown>, toStorage: boolean) {
    for (const child of group.children) {
      if (isGroup(child)) {
        const nested = data[child.name];
        if (nested && typeof nested === 'object') {
          this._convertPercent(child, nested as Record<string, unknown>, toStorage);
        }
      } else if ((child as FormField).type === 'percent' && child.name in data) {
        const n = Number(data[child.name]);
        if (!isNaN(n)) {
          data[child.name] = toStorage ? n / 100 : n * 100;
        }
      } else if ((child as FormField).type === 'range' && (child as FormField).valueType === 'percent' && child.name in data) {
        const val = data[child.name];
        if (typeof val === 'object' && val !== null) {
          const obj = val as { from: number; to: number };
          data[child.name] = {
            from: toStorage ? obj.from / 100 : obj.from * 100,
            to: toStorage ? obj.to / 100 : obj.to * 100,
          };
        } else {
          const n = Number(val);
          if (!isNaN(n)) {
            data[child.name] = toStorage ? n / 100 : n * 100;
          }
        }
      }
    }
  }

  // ── DOM helpers ──

  private _getFieldElement(path: string): HTMLElement | null {
    return this.$(`[data-path="${path}"]`);
  }

  private _getNestedValue(data: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce<unknown>((obj, key) =>
      (obj as Record<string, unknown>)?.[key], data);
  }

  private _walkGroups(group: FormGroupDef, fn: (g: FormGroupDef, prefix: string) => void, prefix = '') {
    fn(group, prefix);
    const path = prefix ? `${prefix}.${group.name}` : group.name;
    for (const child of group.children) {
      if (isGroup(child)) this._walkGroups(child, fn, path);
    }
  }

  private _walkFields(group: FormGroupDef, prefix: string, fn: (f: FormField, path: string) => void) {
    for (const child of group.children) {
      if (isGroup(child)) {
        this._walkFields(child, prefix ? `${prefix}.${child.name}` : child.name, fn);
      } else {
        fn(child, prefix ? `${prefix}.${child.name}` : child.name);
      }
    }
  }
}

define('b-form', BForm);
