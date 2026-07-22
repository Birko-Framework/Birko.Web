// Imperative dialog helpers — themed, awaitable replacements for the browser-native
// `confirm()` / `alert()` / `prompt()`, plus a few patterns the platform has no native for
// (`choose`, `promptForm`, `busy`). Call a function instead of hand-rendering a
// `<b-confirm-dialog>` / `<b-modal>` and awaiting `el.show()` in every page.
//
// Import from the dedicated lean subpath so a consumer pulls only these few components,
// NOT the whole `layout` / `inputs` barrels (which bundle b-chat, pickers, data-table, …):
//
//   import { confirm, confirmDelete, notify, alert, prompt, choose, promptForm, busy }
//     from 'birko-web-components/dialogs';
//
// All dialogs are themed (light/dark), non-blocking, keyboard/focus-trapped and dismissable
// (Escape) via the native <dialog> the underlying components use. Elements are created on
// demand, shown, and removed when answered. `busy`'s spinner overlay is intentionally NOT
// dismissable (it tracks in-flight work). `promptForm` code-splits `b-form` via dynamic import,
// so importing this module does not pull the form machinery until `promptForm` is first called.

import '../inputs/b-button.js';        // <b-button> — used inside every footer + confirm-dialog
import '../layout/b-confirm-dialog.js'; // <b-confirm-dialog> — confirm / confirmDelete
import '../layout/b-modal.js';          // <b-modal> — alert / prompt / choose / promptForm
import '../inputs/b-input.js';          // <b-input> — prompt
import '../feedback/b-spinner.js';      // <b-spinner> — busy
import { toast, type ToastVariant } from '../feedback/b-toast.js';
import { t } from 'birko-web-core';
import type { FormField, FormSchema, FormResult } from '../inputs/b-form.js'; // type-only — no runtime import (see promptForm / formModal)

/** The `toast` singleton, re-exported for convenience (notify() wraps it). */
export { toast };

/** One animation frame — lets a freshly-created component finish connectedCallback (render + wire listeners). */
const nextFrame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));

/** Append `message` as a themed body paragraph (textContent — never interprets HTML). */
function appendMessage(host: HTMLElement, message: string): void {
  if (!message) return;
  const p = document.createElement('p');
  p.textContent = message;
  p.style.cssText = 'margin:0;color:var(--b-text-secondary);font-size:var(--b-text-base);line-height:var(--b-line-height);';
  host.appendChild(p);
}

/** A footer <b-button> (slotted into b-modal's `footer` slot). */
function footerButton(label: string, variant: 'primary' | 'secondary' | 'danger'): HTMLElement {
  const btn = document.createElement('b-button');
  btn.setAttribute('slot', 'footer');
  btn.setAttribute('variant', variant);
  btn.textContent = label;
  return btn;
}

// ── confirm / confirmDelete ─────────────────────────────────────────────────

export interface ConfirmOptions {
  title?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'primary' | 'danger';
  /**
   * Render `message` as raw HTML instead of escaped text. Default `false` — the message is
   * treated as plain text (safe against XSS from user-derived strings such as usernames). Only
   * set this for a trusted, developer-authored markup string; NEVER for user-controlled input.
   */
  allowHtml?: boolean;
}

/**
 * A themed confirm dialog (replaces `window.confirm`). Resolves `true` on confirm,
 * `false` on cancel / Escape. Created on demand, shown modally, removed when answered.
 *
 * `message` is rendered as **text** by default — safe to pass user-derived strings. Opt into
 * markup with `{ allowHtml: true }` only for trusted, developer-authored content.
 */
export async function confirm(message: string, opts: ConfirmOptions = {}): Promise<boolean> {
  const el = document.createElement('b-confirm-dialog');
  el.setAttribute('message', message);
  if (opts.allowHtml) el.setAttribute('message-html', '');
  el.setAttribute('variant', opts.variant ?? 'primary');
  // Always set a (localized) title, else the component falls back to its English 'Confirm'.
  el.setAttribute('title', opts.title ?? t('bwc.dialog.confirmTitle', undefined, 'Confirm'));
  if (opts.confirmText) el.setAttribute('confirm-text', opts.confirmText);
  if (opts.cancelText) el.setAttribute('cancel-text', opts.cancelText);
  document.body.appendChild(el);
  await nextFrame(); // wait for render + wired button/Escape listeners before showing
  try {
    return await (el as unknown as { show(): Promise<boolean> }).show();
  } finally {
    el.remove();
  }
}

/**
 * A destructive confirm — danger styling, "Delete" / "Cancel" defaults. The common delete
 * case; pass a custom `confirmText` (e.g. "Remove") where the copy differs.
 */
export function confirmDelete(message: string, opts: ConfirmOptions = {}): Promise<boolean> {
  return confirm(message, {
    ...opts,
    variant: opts.variant ?? 'danger',
    confirmText: opts.confirmText ?? t('bwc.dialog.delete', undefined, 'Delete'),
    cancelText: opts.cancelText ?? t('bwc.dialog.cancel', undefined, 'Cancel'),
  });
}

// ── notify ──────────────────────────────────────────────────────────────────

/** A transient toast notice (the soft replacement for `window.alert`), default info. */
export function notify(message: string, variant: ToastVariant = 'info'): void {
  toast[variant](message);
}

// ── alert (modal acknowledgement) ─────────────────────────────────────────────

export interface AlertOptions {
  title?: string;
  okText?: string;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * A modal acknowledgement (the blocking, awaitable `window.alert` replacement — distinct from
 * the transient `notify` toast). Resolves once the user presses OK / Escape / the close button.
 */
export async function alert(message: string, opts: AlertOptions = {}): Promise<void> {
  const modal = document.createElement('b-modal');
  modal.setAttribute('size', opts.size ?? 'sm');
  modal.setAttribute('title', opts.title ?? t('bwc.dialog.noticeTitle', undefined, 'Notice'));
  appendMessage(modal, message);
  const ok = footerButton(opts.okText ?? t('bwc.dialog.ok', undefined, 'OK'), 'primary');
  modal.appendChild(ok);
  document.body.appendChild(modal);
  await nextFrame();

  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      modal.removeEventListener('close', finish);
      (modal as unknown as { close(): void }).close();
      modal.remove();
      resolve();
    };
    ok.addEventListener('click', finish);
    modal.addEventListener('close', finish); // Escape / backdrop / × close button
    (modal as unknown as { open(): void }).open();
  });
}

// ── prompt ────────────────────────────────────────────────────────────────────

export interface PromptOptions {
  title?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
  inputType?: 'text' | 'password' | 'email' | 'number';
  required?: boolean;
}

/**
 * A single-field text prompt (replaces `window.prompt`), built on `b-modal` + `b-input`.
 * Resolves the entered string on confirm, or `null` on cancel / Escape. When `required`, an
 * empty value shows an inline error instead of resolving. Enter in the field submits.
 */
export async function prompt(message: string, opts: PromptOptions = {}): Promise<string | null> {
  const modal = document.createElement('b-modal');
  modal.setAttribute('size', 'sm');
  modal.setAttribute('title', opts.title ?? t('bwc.dialog.promptTitle', undefined, 'Prompt'));
  appendMessage(modal, message);

  const input = document.createElement('b-input');
  if (opts.inputType) input.setAttribute('type', opts.inputType);
  if (opts.placeholder) input.setAttribute('placeholder', opts.placeholder);
  if (opts.defaultValue) input.setAttribute('value', opts.defaultValue);
  if (opts.required) input.setAttribute('required', '');
  modal.appendChild(input);

  const cancel = footerButton(opts.cancelText ?? t('bwc.dialog.cancel', undefined, 'Cancel'), 'secondary');
  const ok = footerButton(opts.confirmText ?? t('bwc.dialog.ok', undefined, 'OK'), 'primary');
  modal.appendChild(cancel);
  modal.appendChild(ok);

  document.body.appendChild(modal);
  await nextFrame();

  return new Promise<string | null>((resolve) => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      modal.removeEventListener('close', onClose);
      (modal as unknown as { close(): void }).close();
      modal.remove();
      resolve(value);
    };
    const onClose = () => finish(null);
    const submit = () => {
      const value = (input as unknown as { value: string }).value ?? '';
      if (opts.required && !value) {
        input.setAttribute('error', t('bwc.dialog.required', undefined, 'This field is required'));
        return;
      }
      finish(value);
    };
    ok.addEventListener('click', submit);
    cancel.addEventListener('click', onClose);
    input.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') { e.preventDefault(); submit(); }
    });
    modal.addEventListener('close', onClose); // Escape / backdrop / × close button
    (modal as unknown as { open(): void }).open();
  });
}

// ── choose (pick one of N) ──────────────────────────────────────────────────

export interface ChooseOption<T = string> {
  label: string;
  value: T;
  variant?: 'primary' | 'secondary' | 'danger';
}

export interface ChooseOptions {
  title?: string;
  cancelText?: string;
  /** Show a Cancel button in the footer (resolves null). Default true. */
  cancellable?: boolean;
}

/**
 * A single-choice dialog — pick one of N options (the "which export format?" pattern the
 * platform has no native for). Resolves the chosen option's `value`, or `null` on cancel /
 * Escape. Options render as a vertical stack of buttons.
 */
export async function choose<T = string>(
  message: string,
  options: ChooseOption<T>[],
  opts: ChooseOptions = {},
): Promise<T | null> {
  const modal = document.createElement('b-modal');
  modal.setAttribute('size', 'sm');
  modal.setAttribute('title', opts.title ?? t('bwc.dialog.chooseTitle', undefined, 'Choose'));
  appendMessage(modal, message);

  const list = document.createElement('div');
  list.style.cssText = 'display:flex;flex-direction:column;gap:var(--b-space-sm);margin-top:var(--b-space-md);';
  modal.appendChild(list);

  const cancellable = opts.cancellable ?? true;
  const cancel = cancellable
    ? footerButton(opts.cancelText ?? t('bwc.dialog.cancel', undefined, 'Cancel'), 'secondary')
    : null;
  if (cancel) modal.appendChild(cancel);

  document.body.appendChild(modal);
  await nextFrame();

  return new Promise<T | null>((resolve) => {
    let settled = false;
    const finish = (value: T | null) => {
      if (settled) return;
      settled = true;
      modal.removeEventListener('close', onClose);
      (modal as unknown as { close(): void }).close();
      modal.remove();
      resolve(value);
    };
    const onClose = () => finish(null);
    for (const opt of options) {
      const btn = document.createElement('b-button');
      btn.setAttribute('variant', opt.variant ?? 'secondary');
      btn.style.width = '100%';
      btn.textContent = opt.label;
      btn.addEventListener('click', () => finish(opt.value));
      list.appendChild(btn);
    }
    if (cancel) cancel.addEventListener('click', onClose);
    modal.addEventListener('close', onClose); // Escape / backdrop / × close button
    (modal as unknown as { open(): void }).open();
  });
}

// ── promptForm (multi-field) ──────────────────────────────────────────────────

export interface PromptFormOptions {
  title?: string;
  confirmText?: string;
  cancelText?: string;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * A multi-field input dialog built on `b-form` (with its validation). Resolves the collected
 * `{ field: value }` record on submit (only when the form validates), or `null` on cancel /
 * Escape. Generalizes `prompt` to more than one field.
 *
 * `b-form` is loaded via dynamic import so importing this module stays lean — the form
 * machinery is only bundled (as a separate chunk) once `promptForm` is actually called.
 */
export async function promptForm(
  fields: FormField[],
  opts: PromptFormOptions = {},
): Promise<Record<string, unknown> | null> {
  await import('../inputs/b-form.js'); // registers <b-form> (heavy — code-split out of the lean entry)

  const modal = document.createElement('b-modal');
  modal.setAttribute('size', opts.size ?? 'md');
  modal.setAttribute('title', opts.title ?? t('bwc.dialog.formTitle', undefined, 'Details'));

  const form = document.createElement('b-form');
  modal.appendChild(form);

  const cancel = footerButton(opts.cancelText ?? t('bwc.dialog.cancel', undefined, 'Cancel'), 'secondary');
  const ok = footerButton(opts.confirmText ?? t('bwc.dialog.save', undefined, 'Save'), 'primary');
  modal.appendChild(cancel);
  modal.appendChild(ok);

  document.body.appendChild(modal);
  await nextFrame();
  (form as unknown as { setSchema(schema: unknown): void }).setSchema({ name: 'root', children: fields });

  return new Promise<Record<string, unknown> | null>((resolve) => {
    let settled = false;
    const finish = (value: Record<string, unknown> | null) => {
      if (settled) return;
      settled = true;
      modal.removeEventListener('close', onClose);
      (modal as unknown as { close(): void }).close();
      modal.remove();
      resolve(value);
    };
    const onClose = () => finish(null);
    const submit = () => {
      const result = (form as unknown as { validate(): { valid: boolean; data: Record<string, unknown> } }).validate();
      if (!result.valid) return; // b-form renders the field errors; keep the dialog open
      finish(result.data);
    };
    ok.addEventListener('click', submit);
    cancel.addEventListener('click', onClose);
    form.addEventListener('submit', submit); // b-form fires `submit` on Enter
    modal.addEventListener('close', onClose); // Escape / × close button (backdrop is disabled while a form is present)
    (modal as unknown as { open(): void }).open();
  });
}

// ── formModal (create/edit form modal — the hand-rendered-CRUD-modal replacement) ──

/**
 * The subset of the `<b-form>` API a {@link formModal} `onLoad`/`onSubmit` hook needs. Structural
 * so callers don't import the component class. Use `setFieldOptions` to inject async-loaded options
 * (codebooks), `setValues` for extra pre-fill, and `setFieldError` to surface a server error inline.
 */
export interface FormModalApi {
  setValues(values: Record<string, unknown>): void;
  getValues(): Record<string, unknown>;
  setFieldOptions(path: string, options: { value: string; label: string }[]): void;
  setFieldError(path: string, error: string): void;
  /** Wire a field-change reaction (e.g. auto-fill a field when a select changes). Returns an unsubscribe fn. */
  onFieldChange(path: string, callback: (value: unknown, data: Record<string, unknown>) => void): () => void;
}

/**
 * Thrown from a {@link formModal} `onSubmit` to surface a server-side validation error on a specific
 * field and keep the modal open (the imperative equivalent of the hand-rolled
 * `form.setFieldError(path, msg); return;` on a failed save).
 */
export class FieldError extends Error {
  constructor(public readonly field: string, message: string) {
    super(message);
    this.name = 'FieldError';
  }
}

export interface FormModalOptions {
  title?: string;
  confirmText?: string;
  cancelText?: string;
  size?: 'sm' | 'md' | 'lg';
  /** Pre-fill values (edit mode) — applied after `onLoad` so option lists are ready first. */
  values?: Record<string, unknown>;
  /**
   * Async hook run after the form mounts (schema set) but before it's shown — load and inject
   * async field options (`setFieldOptions`), compute dynamic defaults, etc. Receives the live form.
   */
  onLoad?: (form: FormModalApi) => void | Promise<void>;
  /**
   * Optional submit handler. Receives the validated `{ field: value }` data (the modal only submits
   * when the form validates). While it runs the confirm button shows a loading state and the modal
   * stays open. Resolve to close (and resolve the returned promise with the data); throw a
   * {@link FieldError} to surface an inline field error and keep the modal open (or call
   * `form.setFieldError(...)` yourself and throw any error to keep it open). When omitted, the modal
   * closes on a valid submit and simply returns the data for the caller to persist.
   */
  onSubmit?: (data: Record<string, unknown>, form: FormModalApi) => void | Promise<void>;
}

/**
 * A themed create/edit form modal built on `b-modal` + `b-form` — the imperative replacement for the
 * `~40` pages that hand-render `<b-modal><b-form>…</b-modal>` plus open/close/save/error wiring per
 * entity. Takes a full `b-form` **schema** (groups, layout, field hints — not just a flat field list
 * like {@link promptForm}), supports edit pre-fill (`values`), async option loading (`onLoad`) and an
 * inline server-error channel (`onSubmit` + {@link FieldError}).
 *
 * Resolves the collected data on a successful submit, or `null` on cancel / Escape. `b-form` is loaded
 * via dynamic import so importing this module stays lean (same code-split as `promptForm`).
 *
 *   const created = await formModal(schema, {
 *     title: t('…'),
 *     onLoad: (f) => f.setFieldOptions('typeId', await loadCodebookOptions('…')),
 *     onSubmit: async (data) => {
 *       const r = await api.post('…', data);
 *       if (!r.ok) throw new FieldError('name', r.error?.message ?? 'Save failed');
 *     },
 *   });
 */
export async function formModal(
  schema: FormSchema,
  opts: FormModalOptions = {},
): Promise<Record<string, unknown> | null> {
  await import('../inputs/b-form.js'); // registers <b-form> (heavy — code-split out of the lean entry)

  const modal = document.createElement('b-modal');
  modal.setAttribute('size', opts.size ?? 'md');
  modal.setAttribute('title', opts.title ?? t('bwc.dialog.formTitle', undefined, 'Details'));

  const form = document.createElement('b-form');
  modal.appendChild(form);

  const cancel = footerButton(opts.cancelText ?? t('bwc.dialog.cancel', undefined, 'Cancel'), 'secondary');
  const ok = footerButton(opts.confirmText ?? t('bwc.dialog.save', undefined, 'Save'), 'primary');
  // Stable hooks for consumers/tests (only one formModal is open at a time). Mirrors the confirm
  // dialog's stable confirm affordance.
  cancel.id = 'form-modal-cancel';
  ok.id = 'form-modal-confirm';
  modal.appendChild(cancel);
  modal.appendChild(ok);

  document.body.appendChild(modal);
  await nextFrame();

  const api = form as unknown as FormModalApi & {
    setSchema(schema: unknown): void;
    validate(): FormResult;
  };
  api.setSchema(schema);

  // Load async options / dynamic defaults, then apply edit pre-fill on top.
  if (opts.onLoad) await opts.onLoad(api);
  if (opts.values) api.setValues(opts.values);

  return new Promise<Record<string, unknown> | null>((resolve) => {
    let settled = false;
    let submitting = false;
    const finish = (value: Record<string, unknown> | null) => {
      if (settled) return;
      settled = true;
      modal.removeEventListener('close', onClose);
      (modal as unknown as { close(): void }).close();
      modal.remove();
      resolve(value);
    };
    const onClose = () => { if (!submitting) finish(null); }; // ignore Escape/× while a submit is in flight
    const submit = async () => {
      if (submitting) return;
      const result = api.validate();
      if (!result.valid) return; // b-form renders the field errors; keep the dialog open

      if (!opts.onSubmit) { finish(result.data); return; }

      submitting = true;
      ok.setAttribute('loading', '');
      try {
        await opts.onSubmit(result.data, api);
        finish(result.data);
      } catch (err) {
        // Keep the modal open; surface a FieldError inline (other errors are assumed already
        // surfaced by the handler via form.setFieldError, or shown as a toast by the caller).
        if (err instanceof FieldError) api.setFieldError(err.field, err.message);
        ok.removeAttribute('loading');
        submitting = false;
      }
    };
    ok.addEventListener('click', submit);
    cancel.addEventListener('click', () => finish(null));
    form.addEventListener('submit', submit); // b-form fires `submit` on Enter
    modal.addEventListener('close', onClose); // Escape / × close button (backdrop disabled with a form present)
    (modal as unknown as { open(): void }).open();
  });
}

// ── busy (spinner overlay) ────────────────────────────────────────────────────

export interface BusyOptions {
  message?: string;
}

/**
 * Run `work` behind a non-dismissable full-screen spinner overlay, resolving/rejecting with
 * its result. The overlay is always removed when the work settles (success or failure). Accepts
 * either a promise or a thunk returning one.
 *
 *   const data = await busy(() => api.save(model), { message: 'Saving…' });
 *
 * Rendered as a modal `<dialog>` so it lives in the browser **top layer** — above every
 * z-index stacking context (and any other open modal), matching the other helpers. The native
 * Escape-to-cancel is suppressed so the overlay cannot be dismissed while work is in flight.
 */
export async function busy<T>(work: Promise<T> | (() => Promise<T>), opts: BusyOptions = {}): Promise<T> {
  const dlg = document.createElement('dialog');
  dlg.setAttribute('role', 'alert');
  dlg.setAttribute('aria-busy', 'true');
  dlg.style.cssText =
    'position:fixed;inset:0;width:100vw;height:100dvh;max-width:100vw;max-height:100dvh;border:none;margin:0;padding:0;' +
    'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:var(--b-space-md);' +
    'background:var(--b-overlay-medium,rgba(0,0,0,.4));';
  // Non-dismissable: swallow the native Escape/cancel while work is running.
  const blockCancel = (e: Event) => e.preventDefault();
  dlg.addEventListener('cancel', blockCancel);

  const spinner = document.createElement('b-spinner');
  spinner.setAttribute('size', 'lg');
  dlg.appendChild(spinner);

  if (opts.message) {
    const msg = document.createElement('div');
    msg.textContent = opts.message;
    msg.style.cssText = 'color:var(--b-text-inverse,#fff);font-size:var(--b-text-base);font-weight:var(--b-font-weight-medium);';
    dlg.appendChild(msg);
  }

  document.body.appendChild(dlg);
  (dlg as HTMLDialogElement).showModal();
  try {
    return await (typeof work === 'function' ? (work as () => Promise<T>)() : work);
  } finally {
    dlg.close();
    dlg.remove();
  }
}
