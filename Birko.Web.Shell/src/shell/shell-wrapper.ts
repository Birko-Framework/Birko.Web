/**
 * Create a persistent shell wrapper for hash-based routing.
 * The shell element is a singleton — only the inner page is swapped on navigation.
 */
export function createShellWrapper(shellTag: string): (pageTag: string) => HTMLElement {
  let shell: HTMLElement | null = null;

  return (pageTag: string): HTMLElement => {
    if (!shell) shell = document.createElement(shellTag);
    shell.innerHTML = '';
    const page = document.createElement(pageTag);
    shell.appendChild(page);
    return shell;
  };
}
