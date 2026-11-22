/**
 * The first-paint theme script (TASK-972, FEATURE-024 D5). Before the app's code loads, the page shows the light look;
 * this script, put inline in the page head, applies what the shell will apply (a saved theme, Auto resolved from the
 * browser's light/dark setting, else the app's starting theme) before the first paint, so a dark page does not flash
 * light. It fails silently where storage is blocked.
 *
 * `prefix` is the shell's `storagePrefix`; `defaultTheme` its `defaultTheme`. Auto resolves to dark only when the app
 * registers dark: pass `hasDark: false` if it does not.
 */
export function themeBootScript(opts: { prefix?: string; defaultTheme?: string; hasDark?: boolean } = {}): string {
  const key = JSON.stringify(`${opts.prefix ?? 'app'}-theme`);
  const fallback = JSON.stringify(opts.defaultTheme ?? 'light');
  const dark = opts.hasDark === false ? 'false' : 'true';
  return `(function(){var t;try{t=localStorage.getItem(${key})}catch(e){}t=t||${fallback};`
    + `if(t==='auto')t=${dark}&&window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';`
    + `if(t!=='light')document.documentElement.setAttribute('data-theme',t)})();`;
}
