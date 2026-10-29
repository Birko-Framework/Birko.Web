/**
 * The modal `<dialog>`s Birko components opened, oldest first.
 *
 * `showModal()` puts a dialog in the browser's top layer and makes everything outside it inert, so anything that
 * must stay usable while a modal is open (the toasts, TASK-786) has to be placed INSIDE the newest one. The browser
 * exposes no top-layer order and fires no composed event on `showModal()` (the dialogs live in shadow roots), so
 * every component that opens a modal dialog does it through {@link showModal} and the order is kept here.
 * A dialog a consumer opens with its own `showModal()` is not known here.
 */

const stack: HTMLDialogElement[] = [];
const listeners = new Set<() => void>();
const watched = new WeakSet<HTMLDialogElement>();

function notify(): void {
  listeners.forEach((fn) => fn());
}

function forget(dlg: HTMLDialogElement): void {
  const i = stack.indexOf(dlg);
  if (i >= 0) stack.splice(i, 1);
}

function closed(dlg: HTMLDialogElement): void {
  if (dlg.open || !stack.includes(dlg)) return;
  forget(dlg);
  notify();
}

/** `dlg.showModal()`, recorded as the newest modal until it closes. */
export function showModal(dlg: HTMLDialogElement): void {
  dlg.showModal();
  forget(dlg);
  stack.push(dlg);
  if (!watched.has(dlg)) {
    watched.add(dlg);
    dlg.addEventListener('close', () => closed(dlg));
    // Escape: Chromium closes the dialog right after `cancel` but fires `close` ~150 ms later (measured; Firefox and a
    // close() call fire it at once), and a toast moved into the dialog would be hidden for that long.
    dlg.addEventListener('cancel', () => setTimeout(() => closed(dlg)));
  }
  notify();
}

/** The newest modal dialog that is still open and in the document, or null when none is. */
export function topModal(): HTMLDialogElement | null {
  for (let i = stack.length - 1; i >= 0; i--) {
    const dlg = stack[i];
    if (dlg.isConnected && dlg.open) return dlg;
  }
  return null;
}

/** Call `fn` whenever a modal opens or closes. Returns the unsubscribe. */
export function onModalChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
