import { t } from 'birko-web-core';

/**
 * The hour : minute row shared by b-time and b-datetime-picker (TASK-928): − | 14 | + per number, one joined control
 * each, full-height buttons for touch. One producer, so the two pickers cannot drift apart again. Styles:
 * `timeStepperSheet` in shared-styles.
 *
 * Every control carries a `data-spin` / `data-time` key, so `refreshKeepingFocus` finds it again after the panel is
 * rebuilt and focus stays on the button that was pressed.
 */

const pad = (n: number) => String(n).padStart(2, '0');

export function renderTimeStepper(hour: number, minute: number, step: number): string {
  const field = (unit: 'hour' | 'minute', value: number, max: number, inputStep: number, names: [string, string, string]) => `
    <div class="ts-field">
      <button type="button" class="ts-btn" data-spin="${unit}-down" aria-label="${names[1]}">&minus;</button>
      <input class="ts-num" data-time="${unit}" type="number" inputmode="numeric" min="0" max="${max}" step="${inputStep}"
             aria-label="${names[0]}" value="${pad(value)}" />
      <button type="button" class="ts-btn" data-spin="${unit}-up" aria-label="${names[2]}">+</button>
    </div>`;
  return `
    <div class="ts-row">
      ${field('hour', hour, 23, 1, [t('bwc.time.hours', undefined, 'Hours'), t('bwc.time.hourDown', undefined, 'Decrease hours'), t('bwc.time.hourUp', undefined, 'Increase hours')])}
      <span class="ts-sep" aria-hidden="true">:</span>
      ${field('minute', minute, 59, step, [t('bwc.time.minutes', undefined, 'Minutes'), t('bwc.time.minuteDown', undefined, 'Decrease minutes'), t('bwc.time.minuteUp', undefined, 'Increase minutes')])}
    </div>`;
}

export interface TimeStepperWiring {
  /** Minutes per − / + press and per wheel notch. */
  step: number;
  get(): { hour: number; minute: number };
  /** A new time from a button, the wheel or a typed number. The owner stores it, emits and re-renders. */
  set(hour: number, minute: number): void;
  listen(el: EventTarget, type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions): void;
}

/** Wire one rendered `.ts-row`. Safe to call again on the same row (a panel refresh followed by a render). */
export function wireTimeStepper(row: HTMLElement | null, w: TimeStepperWiring): void {
  if (!row || row.dataset.wired) return;
  row.dataset.wired = '';

  const shift = (unit: 'hour' | 'minute', dir: 1 | -1) => {
    const { hour, minute } = w.get();
    if (unit === 'hour') w.set((hour + dir + 24) % 24, minute);
    else w.set(hour, (minute + dir * w.step + 60) % 60);
  };

  w.listen(row, 'click', (e: Event) => {
    const spin = (e.target as HTMLElement).closest<HTMLElement>('[data-spin]')?.dataset.spin;
    if (!spin) return;
    const [unit, dir] = spin.split('-') as ['hour' | 'minute', 'up' | 'down'];
    shift(unit, dir === 'up' ? 1 : -1);
  });

  row.querySelectorAll<HTMLInputElement>('.ts-num').forEach((input) => {
    const unit = input.dataset.time as 'hour' | 'minute';
    const max = unit === 'hour' ? 23 : 59;
    const commit = () => {
      let v = parseInt(input.value, 10);
      if (isNaN(v)) v = 0;
      v = Math.min(max, Math.max(0, v));
      input.value = pad(v);
      const { hour, minute } = w.get();
      if ((unit === 'hour' ? hour : minute) === v) return;
      if (unit === 'hour') w.set(v, minute);
      else w.set(hour, v);
    };
    w.listen(input, 'change', commit);
    w.listen(input, 'blur', commit);
    w.listen(input, 'wheel', (e: Event) => {
      e.preventDefault();
      shift(unit, (e as WheelEvent).deltaY < 0 ? 1 : -1);
    }, { passive: false });
  });
}
