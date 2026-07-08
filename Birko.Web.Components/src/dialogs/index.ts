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
import type { FormField } from '../inputs/b-form.js'; // type-only — no runtime import (see promptForm)

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
}

/**
 * A themed confirm dialog (replaces `window.confirm`). Resolves `true` on confirm,
 * `false` on cancel / Escape. Created on demand, shown modally, removed when answered.
 */
export async function confirm(message: string, opts: ConfirmOptions = {}): Promise<boolean> {
  const el = document.createElement('b-confirm-dialog');
  el.setAttribute('message', message);
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
