/**
 * Shared CSSStyleSheet objects for Birko web components.
 *
 * CSS lives in shared-styles.css (proper syntax highlighting & tooling).
 * This file imports the CSS, splits it by `@sheet` markers, and creates
 * reusable CSSStyleSheet objects (parsed once, shared by reference).
 *
 * Usage:
 *   import { backdropSheet, formFieldSheet } from '../shared-styles';
 *
 *   static get sharedStyles() {
 *     return [backdropSheet, formFieldSheet];
 *   }
 */

import css from './shared-styles.css';

/** Parse CSS file into named sections delimited by `/* @sheet name` comments. */
function parseSections(raw: string): Map<string, string> {
  const sections = new Map<string, string>();
  const parts = raw.split(/\/\*\s*@sheet\s+(\w+)[^*]*\*\//);
  // parts: [preamble, name1, css1, name2, css2, ...]
  for (let i = 1; i < parts.length; i += 2) {
    sections.set(parts[i], parts[i + 1].trim());
  }
  return sections;
}

function createSheet(cssText: string): CSSStyleSheet {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(cssText);
  return sheet;
}

const sections = parseSections(css);

function getSheet(name: string): CSSStyleSheet {
  const text = sections.get(name);
  if (!text) throw new Error(`Shared style section "@sheet ${name}" not found`);
  return createSheet(text);
}

/** Fixed fullscreen backdrop with fade transition. */
export const backdropSheet = getSheet('backdrop');

/** Reset + backdrop for native <dialog> elements. */
export const dialogBaseSheet = getSheet('dialogBase');

/** Icon-only close button (x). */
export const closeButtonSheet = getSheet('closeButton');

/** Flex header bar: title left, actions right, bottom border. */
export const overlayHeaderSheet = getSheet('overlayHeader');

/** Scrollable body area filling remaining flex space. */
export const overlayBodySheet = getSheet('overlayBody');

/** Flex footer bar: actions right-aligned, top border. */
export const overlayFooterSheet = getSheet('overlayFooter');

/** Form field container with label and error message. */
export const formFieldSheet = getSheet('formField');

/** Shared input/select/textarea styling: border, focus ring, error, disabled. */
export const formControlSheet = getSheet('formControl');

/** Popover dropdown panel styling shared by dropdown-menu, multi-select, etc. */
export const dropdownPanelSheet = getSheet('dropdownPanel');

/** Wrapper, label, disabled, focus for toggle-like inputs (switch, checkbox, radio). */
export const formToggleSheet = getSheet('formToggle');

/** Spinner keyframes animation. */
export const spinSheet = getSheet('spin');
