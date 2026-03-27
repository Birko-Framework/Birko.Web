import { BaseComponent, define } from 'birko-web-core';

// ── Types ──

export type FieldType =
  | 'text' | 'password' | 'email' | 'number'
  | 'textarea' | 'select' | 'multi-select'
  | 'checkbox' | 'switch' | 'radio' | 'search'
  | 'file' | 'custom';

export type RuleType =
  | 'required' | 'minLength' | 'maxLength'
  | 'min' | 'max' | 'range'
  | 'pattern' | 'email' | 'match' | 'custom';

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
  value?: unknown;
  rows?: number;
  fullWidth?: boolean;
  hidden?: boolean;
  options?: { value: string; label: string }[];
  searchable?: boolean;
  default?: unknown;
  required?: boolean;
  rules?: ValidationRule[];
}

export interface FormGroupDef {
  name: string;
  label?: string;
  layout?: 'stack' | 'grid' | 'inline';
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

let _t: FormTranslateFn | null = null;

function fmt(key: string, params: Record<string, string | number>, fallback: string): string {
  if (_t) {
    const result = _t(key, params);
    if (result !== key) return result;  // key was resolved
  }
  // Fallback: interpolate params into the fallback string
  return fallback.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? k));
}

// ── Component ──

export class BForm extends BaseComponent {
  /**
   * Set a global translation function for validation messages.
   * Keys follow the pattern: `common.required`, `common.minLength`, etc.
   * Params: `{label}`, `{value}`, `{min}`, `{max}`.
   */
  static setTranslate(fn: FormTranslateFn): void {
    _t = fn;
  }

  static get observedAttributes() {
    return ['layout', 'validate-on', 'readonly', 'disabled'];
  }

  private _schema: FormSchema | null = null;
  private _collapsed = new Set<string>();
  private _errors = new Map<string, string>();       // dot-path → error
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
      .b-form-field--hidden { display: none; }
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
      @media (max-width: 640px) {
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
    this.update();
  }

  setValue(name: string, value: unknown) {
    this.setValues({ [name]: value });
  }

  setValues(values: Record<string, unknown>) {
    if (!this._schema) return;
    this._setGroupValues(this._schema, values, '');
  }

  getValues(): Record<string, unknown> {
    if (!this._schema) return {};
    return this._getGroupValues(this._schema, '');
  }

  validate(): FormResult {
    if (!this._schema) return { valid: true, data: {}, errors: {}, groupErrors: {} };
    this._errors.clear();
    this._groupErrors.clear();

    const data = this.getValues();
    this._validateGroup(this._schema, data, '', true);

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

  focusField(path: string) {
    const el = this._getFieldElement(path);
    if (el) {
      const input = (el.shadowRoot ?? el).querySelector('input, select, textarea') as HTMLElement;
      (input ?? el).focus();
    }
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

    return `
      <fieldset class="b-form-group ${isInvalid ? 'b-form-group--invalid' : ''}" data-group="${group.name}">
        ${hasLabel ? `<legend class="b-form-legend ${group.collapsible ? 'b-form-legend--toggle' : ''}">${legendContent}${errHtml}</legend>` : ''}
        <div class="${bodyClasses}" ${bodyStyle ? `style="${bodyStyle}"` : ''}>
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
    const classes = `b-form-field ${field.fullWidth ? 'b-form-field--full' : ''} ${field.hidden ? 'b-form-field--hidden' : ''}`;

    if (field.type === 'custom') {
      return `<div class="${classes}" data-field="${path}"><slot name="${field.name}"></slot></div>`;
    }

    const tag = this._fieldTag(field);
    const attrs = this._fieldAttrs(field, path, error, disabled || readonly);

    return `<div class="${classes}" data-field="${path}">${tag(attrs)}</div>`;
  }

  private _fieldTag(field: FormField): (attrs: string) => string {
    switch (field.type) {
      case 'textarea':
        return (a) => `<b-textarea ${a}></b-textarea>`;
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
      case 'search':
        return (a) => `<b-search-input ${a}></b-search-input>`;
      case 'file':
        return (a) => `<b-file-upload ${a}></b-file-upload>`;
      default: // text, password, email, number
        return (a) => `<b-input ${a}></b-input>`;
    }
  }

  private _fieldAttrs(field: FormField, path: string, error: string, disabled: boolean): string {
    const parts: string[] = [`data-path="${path}"`];

    if (field.type !== 'radio') {
      parts.push(`name="${field.name}"`);
      if (field.label) parts.push(`label="${field.label}"`);
    }

    if (field.value !== undefined && field.value !== '') parts.push(`value="${String(field.value)}"`);
    if (field.placeholder) parts.push(`placeholder="${field.placeholder}"`);
    if (error) parts.push(`error="${error}"`);
    if (disabled) parts.push('disabled');
    if (field.required) parts.push('required');

    // Type-specific
    switch (field.type) {
      case 'password': case 'email': case 'number':
        parts.push(`type="${field.type}"`);
        break;
      case 'textarea':
        if (field.rows) parts.push(`rows="${field.rows}"`);
        break;
      case 'select':
      case 'multi-select':
        if (field.searchable) parts.push('searchable');
        break;
    }

    return parts.join(' ');
  }

  // ── Events ──

  protected onUpdated() {
    if (!this._schema) return;

    // Wire up field change events
    this._wireFieldEvents(this._schema, '');

    // Wire up collapsible group toggles
    this.$$<HTMLElement>('.b-form-legend--toggle').forEach(legend => {
      legend.addEventListener('click', () => {
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
      });
    });

    // Populate select/multi-select options from schema
    this._populateOptions(this._schema, '');
  }

  private _wireFieldEvents(group: FormGroupDef, prefix: string) {
    const path = prefix ? `${prefix}.${group.name}` : '';

    for (const child of group.children) {
      if (isGroup(child)) {
        this._wireFieldEvents(child, path || group.name);
        continue;
      }

      const fieldPath = path ? `${path}.${child.name}` : child.name;
      const el = this._getFieldElement(fieldPath);
      if (!el) continue;

      const eventName = child.type === 'search' ? 'search' : 'change';
      el.addEventListener(eventName, ((e: CustomEvent) => {
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

        this.emit('change', { path: fieldPath, value: e.detail?.value ?? e.detail?.checked ?? e.detail?.values, data: this.getValues() });
      }) as EventListener);
    }
  }

  private _populateOptions(group: FormGroupDef, prefix: string) {
    const path = prefix ? `${prefix}.${group.name}` : '';

    for (const child of group.children) {
      if (isGroup(child)) {
        this._populateOptions(child, path || group.name);
        continue;
      }

      if ((child.type === 'select' || child.type === 'multi-select') && child.options) {
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
    // Required check
    if (field.required) {
      if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
        this._errors.set(path, field.rules?.find(r => r.type === 'required')?.message
          ?? fmt('common.required', { label: field.label }, '{label} is required'));
        return; // Stop on first error
      }
    }

    if (!field.rules) return;

    for (const rule of field.rules) {
      if (rule.type === 'required') continue; // Already handled above

      const err = this._checkRule(rule, field, value, allData);
      if (err) {
        this._errors.set(path, err);
        return; // Stop on first error
      }
    }
  }

  private _checkRule(rule: ValidationRule, field: FormField, value: unknown, allData: Record<string, unknown>): string | null {
    const str = String(value ?? '');
    const num = Number(value);

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
      case 'file':
        return 'getFiles' in el ? (el as any).getFiles() : [];
      default:
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
      case 'select':
        el.setAttribute('value', String(value));
        break;
      default:
        el.setAttribute('value', String(value ?? ''));
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
