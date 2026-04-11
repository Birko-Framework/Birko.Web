import { BaseComponent } from 'birko-web-core';
import type { ApiClient } from 'birko-web-core/http';
import { apiErrorMessage } from 'birko-web-core/http';
import type { BForm, FormSchema } from 'birko-web-components/inputs';
import type { BButton } from 'birko-web-components/inputs';
import { toast } from 'birko-web-components/feedback';
import { showFormError } from 'birko-web-components/form-utils';

/**
 * Abstract base class for detail / edit pages that load a single entity by ID.
 *
 * The entity ID is read from the router hash params (`:id` segment).
 * On mount, the entity is fetched and the form is populated automatically.
 * Save and Cancel buttons are wired by the base class.
 *
 * ## Minimal subclass
 * ```ts
 * class ProductDetailPage extends BaseDetailPage<Product> {
 *   protected endpoint = 'api/products';
 *   protected get api() { return api; }
 *   protected get formSchema(): FormSchema { return { name: 'root', children: [...] }; }
 * }
 * define('s-product-detail-page', ProductDetailPage);
 * ```
 *
 * ## Route registration (in consumer app)
 * ```ts
 * { path: '/products/:id', component: () => wrap('s-product-detail-page') }
 * ```
 *
 * ## Read-only mode
 * ```ts
 * class ProductDetailPage extends BaseDetailPage<Product> {
 *   protected readonly = true;   // hides Save button, disables form
 *   ...
 * }
 * ```
 */
export abstract class BaseDetailPage<T extends Record<string, unknown>> extends BaseComponent {
  /** The loaded entity, available in `onEntityLoaded()` and after `onMount()` resolves. */
  protected entity: T | null = null;

  // ── Required ──────────────────────────────────────────────────────────────

  /** REST resource base path, e.g. `'api/products'`. The entity ID is appended automatically. */
  protected abstract endpoint: string;

  /** HTTP client instance. */
  protected abstract get api(): ApiClient;

  /** Form schema for displaying / editing the entity. */
  protected abstract get formSchema(): FormSchema;

  // ── Optional — override to customise ─────────────────────────────────────

  /** Human-readable entity name for toast messages. Default: `'Item'`. */
  protected entityLabel = 'Item';

  /** Route param name holding the entity ID. Default: `'id'`. */
  protected idParam = 'id';

  /**
   * Hash to navigate to on Cancel or after a successful save.
   * If `null`, `history.back()` is called instead.
   * Default: `null`.
   */
  protected backHash: string | null = null;

  /**
   * When `true`, the Save button is hidden and the form is rendered in read-only mode.
   * Default: `false`.
   */
  protected readonly = false;

  /**
   * Map the API entity to form field values before populating the form.
   * Override when field names differ between the API response and the form schema.
   * Default: identity pass-through.
   */
  protected mapToForm(item: T): Record<string, unknown> {
    return item as Record<string, unknown>;
  }

  /**
   * Map form values back to the request body before saving.
   * Override to transform or augment the data, e.g. to add computed fields.
   * Default: identity pass-through.
   */
  protected mapFromForm(data: Record<string, unknown>): Record<string, unknown> {
    return data;
  }

  /** Called after the entity is successfully loaded. Override for side effects. */
  protected onEntityLoaded?(_entity: T): void;

  /** Called after a successful save. Override to navigate away, refresh stores, etc. */
  protected onSaveSuccess?(_entity: T): void;

  /** Translation function — override for localised labels. */
  protected t(key: string): string {
    const defaults: Record<string, string> = {
      'common.save':        'Save',
      'common.cancel':      'Cancel',
      'common.saved':       `${this.entityLabel} saved`,
      'common.loading':     'Loading…',
      'common.loadError':   `Failed to load ${this.entityLabel}`,
    };
    return defaults[key] ?? key;
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  static get styles(): string {
    return `
      :host { display: block; height: 100%; }
      .detail-page {
        display: flex;
        flex-direction: column;
        height: 100%;
        gap: var(--b-space-lg, 1rem);
        padding: var(--b-space-lg, 1rem);
        box-sizing: border-box;
      }
      .detail-footer {
        display: flex;
        gap: var(--b-space-md, 0.75rem);
        justify-content: flex-end;
        padding-top: var(--b-space-md, 0.75rem);
        border-top: 1px solid var(--b-border);
        flex-shrink: 0;
      }
      .detail-loading {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: var(--b-text-secondary);
      }
      b-form { flex: 1; min-height: 0; overflow: auto; }
    `;
  }

  // ── Template ──────────────────────────────────────────────────────────────

  render(): string {
    if (!this.entity && !this._loadError) {
      return `<div class="detail-page"><div class="detail-loading"><b-spinner></b-spinner></div></div>`;
    }

    if (this._loadError) {
      return `<div class="detail-page"><div class="detail-loading">${this._loadError}</div></div>`;
    }

    return `
      <div class="detail-page">
        <b-form id="form" ${this.readonly ? 'readonly' : ''}></b-form>
        <div class="detail-footer">
          <b-button id="btn-cancel" variant="ghost">${this.t('common.cancel')}</b-button>
          ${this.readonly ? '' : `<b-button id="btn-save" variant="primary">${this.t('common.save')}</b-button>`}
        </div>
      </div>
    `;
  }

  // ── Internal state ────────────────────────────────────────────────────────

  private _loadError: string | null = null;

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  protected onMount(): void {
    void this._load();
  }

  protected onUpdated(): void {
    this._wireEvents();
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _entityId(): string | null {
    const hash = window.location.hash.slice(1);
    // Match /:param pattern — find last segment if no param name matched
    const paramMatch = hash.match(new RegExp(`[?&]?${this.idParam}=([^&/]+)`));
    if (paramMatch) return paramMatch[1];

    // Fall back to last path segment (common case: /products/abc123)
    const segments = hash.split('?')[0].split('/').filter(Boolean);
    return segments.length ? segments[segments.length - 1] : null;
  }

  private async _load(): Promise<void> {
    const id = this._entityId();
    if (!id) {
      this._loadError = 'No entity ID in URL';
      this.update();
      return;
    }

    const resp = await this.api.get<T>(`${this.endpoint}/${id}`);
    if (!resp.ok) {
      this._loadError = apiErrorMessage(resp.data, this.t('common.loadError'));
      this.update();
      return;
    }

    this.entity = resp.data;
    this._loadError = null;
    this.update();

    // Populate form after render
    requestAnimationFrame(() => {
      const form = this.$<BForm>('#form');
      if (!form) return;
      form.setSchema(this.formSchema);
      form.setValues(this.mapToForm(this.entity!));
      this.onEntityLoaded?.(this.entity!);
    });
  }

  private _wireEvents(): void {
    const saveBtn   = this.$<BButton>('#btn-save');
    const cancelBtn = this.$<BButton>('#btn-cancel');

    if (cancelBtn) this.listen(cancelBtn as unknown as EventTarget, 'click', () => this._goBack());
    if (saveBtn)   this.listen(saveBtn   as unknown as EventTarget, 'click', () => this._save());
  }

  private _goBack(): void {
    if (this.backHash) {
      window.location.hash = this.backHash;
    } else {
      history.back();
    }
  }

  private async _save(): Promise<void> {
    const form    = this.$<BForm>('#form');
    const saveBtn = this.$<BButton>('#btn-save');
    if (!form || !saveBtn) return;

    const { valid, data } = form.validate();
    if (!valid) return;

    const id = this._entityId();
    if (!id) return;

    saveBtn.setAttribute('loading', '');

    const body = this.mapFromForm(data);
    const resp = await this.api.put<T>(`${this.endpoint}/${id}`, body);

    saveBtn.removeAttribute('loading');

    if (!resp.ok) {
      showFormError(form as Parameters<typeof showFormError>[0], resp.data);
      return;
    }

    this.entity = resp.data;
    toast.success(this.t('common.saved'));
    this.onSaveSuccess?.(resp.data);
  }

  /** Reload entity data from the server — useful after external changes. */
  protected refresh(): void {
    this.entity = null;
    this._loadError = null;
    this.update();
    void this._load();
  }
}
