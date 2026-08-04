import { BaseComponent, define } from 'birko-web-core';
import { rovingIndex } from '../dom-utils';

export interface SegmentedOption {
  value: string;
  label: string;
}

/**
 * Segmented control — pill-style single-pick group of buttons.
 *
 * Use for short, fixed enumerations (≤4 options) where a select dropdown feels heavy.
 * Emits `change` with `{ name, value }` on selection.
 */
export class BSegmented extends BaseComponent {
  static get observedAttributes() {
    return ['name', 'value', 'disabled', 'label'];
  }

  private _options: SegmentedOption[] = [];

  static get styles() {
    return `
      :host { display: inline-block; }
      .segmented {
        display: inline-flex;
        background: var(--b-bg-tertiary);
        border-radius: var(--b-radius, 0.375rem);
        padding: 2px;
        gap: 2px;
      }
      .segmented button {
        background: transparent;
        border: none;
        padding: var(--b-space-xs, 0.25rem) var(--b-space-md, 0.75rem);
        font-size: var(--b-text-sm, 0.8125rem);
        font-weight: var(--b-font-weight-medium, 500);
        color: var(--b-text-secondary);
        border-radius: calc(var(--b-radius, 0.375rem) - 2px);
        cursor: pointer;
        white-space: nowrap;
        transition: background var(--b-transition, 150ms ease), color var(--b-transition, 150ms ease);
      }
      .segmented button:hover:not(:disabled):not(.active) { color: var(--b-text); }
      .segmented button.active {
        background: var(--b-bg);
        color: var(--b-text);
        box-shadow: var(--b-shadow-sm, 0 1px 2px rgba(0,0,0,0.05));
      }
      .segmented button:focus-visible {
        outline: none;
        box-shadow: var(--b-focus-ring, 0 0 0 3px rgba(37, 99, 235, 0.15));
      }
      /* Touch floor. The pills were sized entirely by font-size + padding, which measured **19.0px** tall — 43% of
         the 44 × 44 target Apple's Human Interface Guidelines ask for (and WCAG 2.1 SC 2.5.5 Target Size
         (Enhanced), AAA — *not* SC 2.5.8 Target Size (Minimum), which is 24 × 24 at AA; an earlier version of this
         note cited 2.5.8 for the 44, which would tell a reader AA demands it) — in every engine, so this was never
         a WebKit quirk but a missing rule. Consumers cannot fix it: the group lives in this shadow root and
         exposes no CSS part.

         Coarse pointer only, unlike b-button (see its note): a segmented control is legitimately dense in a desktop
         toolbar, and inflating it there would move every existing consumer's layout for no benefit. max(token,
         44px) rather than the bare token because the token itself resolves to 38.5px under the shipped reset's
         14px root — that is its own defect and its own task; this floor must hold either way.

         **Both axes, because the criterion has two.** The first version of this rule floored height alone, and a
         44 × 44 target was the stated reason for it — so Reps' shipped 30/90/all range switch went on rendering
         its "All" pill at **36.6 × 44** at every phone width from 320 up, under a green suite: the regression test
         asserted the box's height and nothing looks wrong in a screenshot. min-width is what a short label needs
         and padding cannot give it — padding is proportional to nothing here, so "All" and "Vsetko" are floored by
         different amounts by the same declaration, whereas a floor is the same 44px for both. (The padding-inline
         declaration this replaces was a no-op: the base rule above already sets --b-space-md on that axis, and it
         measured 10.5px identically under both pointers.)

         The label size is raised in the same pass deliberately: a 44px box around 11.4px text is a tappable
         control that still cannot be read at arm's length, which is half a fix. No 16px iOS concern here — the
         focus-zoom floor applies to focusable *inputs*, and these are buttons. */
      @media (pointer: coarse) {
        .segmented button {
          min-height: max(var(--b-control-min-height-lg, 2.75rem), 44px);
          min-width: max(var(--b-control-min-height-lg, 2.75rem), 44px);
          font-size: max(var(--b-text-base, 0.875rem), 14px);
        }
      }
      .segmented button:disabled {
        opacity: var(--b-disabled-opacity, 0.5);
        cursor: not-allowed;
      }
    `;
  }

  setOptions(options: SegmentedOption[]) {
    this._options = options;
    this.update();
  }

  render() {
    const value = this.attr('value');
    const disabled = this.boolAttr('disabled');
    // Single-choice control → radiogroup pattern (not tabs: there are no tabpanels).
    // Roving tabindex: the checked option is the tab stop, else the first option.
    const selectedIdx = this._options.findIndex(o => o.value === value);
    const focusIdx = selectedIdx >= 0 ? selectedIdx : 0;
    const buttons = this._options.map((o, i) => `
      <button type="button" role="radio" data-value="${o.value}"
              class="${o.value === value ? 'active' : ''}"
              ${disabled ? 'disabled' : ''}
              tabindex="${i === focusIdx ? '0' : '-1'}"
              aria-checked="${o.value === value}">${o.label}</button>
    `).join('');
    const groupLabel = this.attr('label') || this.attr('name');
    return `<div class="segmented" role="radiogroup"${groupLabel ? ` aria-label="${groupLabel}"` : ''}>${buttons}</div>`;
  }

  protected onUpdated() {
    const buttons = this.$$<HTMLButtonElement>('button');
    const select = (v: string) => {
      if (v === this.attr('value')) return;
      this.setAttribute('value', v);
      this.emit('change', { name: this.attr('name'), value: v });
    };
    buttons.forEach((btn, i) => {
      this.listen(btn, 'click', () => select(btn.dataset.value!));
      // Arrow keys move + select (focus follows selection, per the radio-group pattern).
      this.listen<KeyboardEvent>(btn, 'keydown', (e) => {
        const next = rovingIndex(e, i, buttons.length);
        if (next === null) return;
        select(buttons[next].dataset.value!);
        buttons[next].focus();
      });
    });
  }

  get value(): string { return this.attr('value'); }
  set value(v: string) {
    if (v) this.setAttribute('value', v);
    else this.removeAttribute('value');
  }
}

define('b-segmented', BSegmented);
