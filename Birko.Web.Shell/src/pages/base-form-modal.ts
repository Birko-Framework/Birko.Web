import { BaseComponent, t as globalT } from 'birko-web-core';
import type { ApiClient } from 'birko-web-core/http';
import { apiErrorMessage } from 'birko-web-core/http';
import type { BForm, FormSchema } from 'birko-web-components/inputs';
import type { BButton } from 'birko-web-components/inputs';
import type { BModal } from 'birko-web-components/layout';
import { toast } from 'birko-web-components/feedback';
import { showFormError } from 'birko-web-components/form-utils';
import { entityUrl } from './endpoint-utils.js';

/**
 * Abstract reusable create/edit modal component.
 *
 * Encapsulates the `<b-modal>` + `<b-form>` + Save/Cancel buttons pattern.
 * Subclasses provide the endpoint and form schema; the base class handles
 * loading for edits, form population, validation, POST/PUT, and error display.
 *
 * Intended to be composed into pages — typically opened from a `BaseListPage`
 * via a custom row action, or from any other page.
 *
 * ## Minimal subclass
 * ```ts
 * class UserFormModal extends BaseFormModal<User> {
 *   protected endpoint = 'api/users';
 *   protected get api() { return api; }
 *   protected get formSchema(): FormSchema { return { name: 'root', children: [...] }; }
 * }
 * define('s-user-form-modal', UserFormModal);
 * ```
 *
 * ## Opening the modal from a parent page
 * ```ts
 * // Create (new entity)
 * const modal = this.$<UserFormModal>('s-user-form-modal')!;
 * modal.open();
 *
 * // Edit (load by id)
 * modal.open('user-guid-123');
 *
 * // Listen for success
 * modal.addEventListener('form-success', () => table.load());
 * ```
 */
export abstract class BaseFormModal<T extends Record<string, unknown>> extends BaseComponent {
  private _editingId: string | null = null;

  // ── Required ──────────────────────────────────────────────────────────────

  /** REST resource base path, e.g. `'api/users'`. */
  protected abstract endpoint: string;

  /** HTTP client instance. */
  protected abstract get api(): ApiClient;

  /** Form schema for the create / edit form. */
  protected abstract get formSchema(): FormSchema;

  // ── Optional — override to customise ─────────────────────────────────────

  /** Human-readable entity name for titles and toast messages. Default: `'Item'`. */
  protected entityLabel = 'Item';

  /** Modal size — passed to `<b-modal size="...">`. Default: `undefined` (medium). */
  protected declare modalSize?: 'sm' | 'lg' | 'xl' | 'xxl';

  /**
   * Map a loaded API entity to form field values for the edit flow.
   * Default: identity pass-through.
   */
  protected mapToForm(item: T): Record<string, unknown> {
    return item as Record<string, unknown>;
  }

  /**
   * Map form values to the request body before saving.
   * Default: identity pass-through.
   */
  protected mapFromForm(data: Record<string, unknown>): Record<string, unknown> {
    return data;
  }

  /**
   * Called after a successful create or edit.
   * Default: emits `'form-success'` custom event — listen on the element.
   */
  protected onSuccess(item: T, isEdit: boolean): void {
    this.emit('form-success', { item, isEdit });
  }

  /**
   * Called after the form/modal is ready — on both create (entity = null)
   * and edit (entity = loaded data, form values already set).
   *
   * Use this to wire cascading selects, load dynamic options, set up
   * field change listeners, or configure custom modal components.
   *
   * @param form — the `<b-form>` inside the modal
   * @param entity — null for create, loaded entity for edit
   */
  protected onFormReady(_form: BForm, _entity: T | null): void {}

  /**
   * Called after a successful create or edit, before closing the modal.
   * Use for post-save side effects (e.g. tag association, file upload).
   */
  protected async afterSave(_savedEntity: T, _isEdit: boolean): Promise<void> {}

  /**
   * Render the modal body HTML.
   * Default: `<b-form id="form"></b-form>`.
   * Override to add custom components alongside or instead of the form.
   * **Must** include a `<b-form id="form">` if the default save flow is used.
   */
  protected renderModalBody(): string {
    return '<b-form id="form"></b-form>';
  }

  /** Translation function — delegates to the global i18n singleton; `{entity}` auto-interpolated. */
  protected t(key: string, params?: Record<string, string | number>): string {
    const defaults: Record<string, string> = {
      'bws.common.new':    'New {entity}',
      'bws.common.edit':   'Edit {entity}',
      'bws.common.save':   'Save',
      'bws.common.cancel': 'Cancel',
      'bws.common.saved':  '{entity} saved',
    };
    const mergedParams = { entity: this.entityLabel, ...params };
    return globalT(key, mergedParams, defaults[key] ?? key);
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  static get styles(): string {
    return `
      :host { display: contents; }
    `;
  }

  // ── Template ──────────────────────────────────────────────────────────────

  render(): string {
    const sizeAttr = this.modalSize ? ` size="${this.modalSize}"` : '';
    return `
      <b-modal id="modal" title=""${sizeAttr}>
        ${this.renderModalBody()}
        <div slot="footer">
          <b-button id="btn-cancel" variant="ghost">${this.t('bws.common.cancel')}</b-button>
          <b-button id="btn-save" variant="primary">${this.t('bws.common.save')}</b-button>
        </div>
      </b-modal>
    `;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  protected onMount(): void {
    const form = this.$<BForm>('#form');
    form?.setSchema(this.formSchema);
  }

  protected onUpdated(): void {
    const saveBtn   = this.$<BButton>('#btn-save');
    const cancelBtn = this.$<BButton>('#btn-cancel');
    const modal     = this.$<BModal>('#modal');

    if (cancelBtn) this.listen(cancelBtn as unknown as EventTarget, 'click', () => modal?.close());
    if (saveBtn)   this.listen(saveBtn   as unknown as EventTarget, 'click', () => this._save());
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Open the modal.
   * - `open()` — create mode: empty form.
   * - `open(id)` — edit mode: loads the entity then populates the form.
   */
  async open(id?: string): Promise<void> {
    const modal   = this.$<BModal>('#modal');
    const form    = this.$<BForm>('#form');
    const saveBtn = this.$<BButton>('#btn-save');
    if (!modal || !form) return;

    if (id) {
      this._editingId = id;
      modal.setAttribute('title', this.t('bws.common.edit'));
      saveBtn?.setAttribute('loading', '');
      modal.open();

      let resp;
      try {
        resp = await this.api.get<T>(entityUrl(this.endpoint, id));
      } catch (e) {
        // A rejected api.get must not leave the modal open with a stuck spinner.
        toast.error(apiErrorMessage((e as { data?: unknown })?.data));
        modal.close();
        return;
      } finally {
        saveBtn?.removeAttribute('loading');
      }

      if (!resp.ok) {
        toast.error(apiErrorMessage(resp.data));
        modal.close();
        return;
      }

      form.reset();
      form.clearErrors();
      form.setValues(this.mapToForm(resp.data));
      this.onFormReady(form, resp.data);
    } else {
      this._editingId = null;
      modal.setAttribute('title', this.t('bws.common.new'));
      form.reset();
      form.clearErrors();
      modal.open();
      this.onFormReady(form, null);
    }
  }

  /** Programmatically close the modal (e.g. from parent after external changes). */
  close(): void {
    this.$<BModal>('#modal')?.close();
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async _save(): Promise<void> {
    const form    = this.$<BForm>('#form');
    const saveBtn = this.$<BButton>('#btn-save');
    const modal   = this.$<BModal>('#modal');
    if (!form || !saveBtn || !modal) return;

    const { valid, data } = form.validate();
    if (!valid) return;

    saveBtn.setAttribute('loading', '');

    // try/finally so a rejected api.put/api.post doesn't leave the Save button spinning.
    try {
      const body = this.mapFromForm(data);
      const isEdit = this._editingId !== null;
      const resp = isEdit
        ? await this.api.put<T>(entityUrl(this.endpoint, this._editingId!), body)
        : await this.api.post<T>(this.endpoint, body);

      if (!resp.ok) {
        showFormError(form as Parameters<typeof showFormError>[0], resp.data);
        return;
      }

      await this.afterSave(resp.data, isEdit);

      toast.success(this.t('bws.common.saved'));
      modal.close();
      this.onSuccess(resp.data, isEdit);
    } finally {
      saveBtn.removeAttribute('loading');
    }
  }
}
