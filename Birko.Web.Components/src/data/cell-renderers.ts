import type { Formatter } from 'birko-web-core/i18n';

// ── Types ──────────────────────────────────────────────────────────────────

export interface CellRenderers {
  /** Format as locale date — "21.3.2026" */
  date(value: unknown): string;
  /** Format as date + time — "21.3.2026 14:30" */
  datetime(value: unknown): string;
  /** Format as relative time — "5 minutes ago" */
  relative(value: unknown): string;
  /** Format as number — "1 234" */
  number(value: unknown, decimals?: number): string;
  /** Format as currency — "1 234,56 €" */
  currency(value: unknown, currencyCode?: string): string;
  /** Format as percentage — "85 %" */
  percent(value: unknown, decimals?: number): string;
  /** Render a status badge */
  badge(value: unknown, variantMap: Record<string, { label: string; variant: string }>): string;
  /** Boolean as colored badge */
  boolean(value: unknown, trueLabel?: string, falseLabel?: string): string;
  /** Render user avatar with initials */
  avatar(value: unknown, row: Record<string, unknown>): string;
  /** Truncated text with tooltip */
  truncate(value: unknown, maxLength?: number): string;
  /** Clickable link */
  link(value: unknown, href: string | ((row: Record<string, unknown>) => string), row: Record<string, unknown>): string;
  /** Progress bar (0–100) */
  progress(value: unknown): string;
  /** List of tags/badges */
  tags(value: unknown): string;
  /** Enum value via lookup (array index or key map) */
  enum(value: unknown, labels: string[] | Record<string, string>): string;
  /** File size — "2.4 MB" */
  fileSize(value: unknown): string;
  /** Color swatch */
  color(value: unknown): string;
}

// ── Factory ────────────────────────────────────────────────────────────────

/**
 * Create cell renderers bound to a locale-aware formatter and translator.
 *
 * @param fmt   Locale-aware formatter (from `createFormatter(i18n)`)
 * @param t     Translation function (from `i18n.t.bind(i18n)`)
 */
export function createCellRenderers(
  fmt: Formatter,
  t: (key: string, params?: Record<string, string | number>) => string,
): CellRenderers {
  return {
    date(value: unknown): string {
      if (!value) return muted('—');
      return fmt.date(value as string);
    },

    datetime(value: unknown): string {
      if (!value) return muted('—');
      return fmt.datetime(value as string);
    },

    relative(value: unknown): string {
      if (!value) return muted('—');
      return `<span title="${escapeAttr(fmt.datetime(value as string))}">${fmt.relative(value as string)}</span>`;
    },

    number(value: unknown, decimals?: number): string {
      if (value == null) return muted('—');
      return fmt.number(value as number, decimals);
    },

    currency(value: unknown, currencyCode = 'EUR'): string {
      if (value == null) return muted('—');
      return fmt.currency(value as number, currencyCode);
    },

    percent(value: unknown, decimals = 0): string {
      if (value == null) return muted('—');
      return fmt.percent(value as number, decimals);
    },

    badge(value: unknown, variantMap: Record<string, { label: string; variant: string }>): string {
      const entry = variantMap[String(value)];
      if (!entry) return muted('—');
      return `<b-badge variant="${escapeAttr(entry.variant)}">${escapeHtml(entry.label)}</b-badge>`;
    },

    boolean(value: unknown, trueLabel?: string, falseLabel?: string): string {
      const isTrue = value === true || value === 'true' || value === 1;
      return `<b-badge variant="${isTrue ? 'success' : 'neutral'}">${isTrue ? (trueLabel ?? t('common.yes')) : (falseLabel ?? t('common.no'))}</b-badge>`;
    },

    avatar(value: unknown, row: Record<string, unknown>): string {
      const name = String(value ?? '');
      const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
      const img = row['avatarUrl'] as string | undefined;
      if (img) {
        return `<span class="cell-avatar"><img src="${escapeAttr(img)}" alt="${escapeHtml(name)}" /></span> ${escapeHtml(name)}`;
      }
      return `<span class="cell-avatar cell-avatar--initials">${initials}</span> ${escapeHtml(name)}`;
    },

    truncate(value: unknown, maxLength = 50): string {
      const s = String(value ?? '');
      if (s.length <= maxLength) return escapeHtml(s);
      return `<span title="${escapeAttr(s)}">${escapeHtml(s.slice(0, maxLength))}&hellip;</span>`;
    },

    link(value: unknown, href: string | ((row: Record<string, unknown>) => string), row: Record<string, unknown>): string {
      const url = typeof href === 'function' ? href(row) : href;
      return `<a href="${escapeAttr(url)}" class="cell-link">${escapeHtml(String(value ?? ''))}</a>`;
    },

    progress(value: unknown): string {
      const pct = Math.max(0, Math.min(100, Number(value ?? 0)));
      const variant = pct >= 80 ? 'success' : pct >= 40 ? 'primary' : 'warning';
      return `
        <div class="cell-progress">
          <div class="cell-progress-bar cell-progress--${variant}" style="width:${pct}%"></div>
          <span class="cell-progress-text">${pct}%</span>
        </div>
      `;
    },

    tags(value: unknown): string {
      const items = Array.isArray(value) ? value : [];
      if (items.length === 0) return muted('—');
      return items.map(tag => `<b-badge variant="neutral">${escapeHtml(String(tag))}</b-badge>`).join(' ');
    },

    enum(value: unknown, labels: string[] | Record<string, string>): string {
      if (Array.isArray(labels)) {
        return escapeHtml(labels[value as number] ?? '—');
      }
      return escapeHtml(labels[String(value)] ?? '—');
    },

    fileSize(value: unknown): string {
      const bytes = Number(value ?? 0);
      if (bytes === 0) return muted('—');
      const units = ['B', 'KB', 'MB', 'GB'];
      let i = 0;
      let size = bytes;
      while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
      return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
    },

    color(value: unknown): string {
      const hex = String(value ?? '');
      if (!hex) return muted('—');
      return `<span class="cell-color" style="background:${escapeAttr(hex)}" title="${escapeHtml(hex)}"></span> ${escapeHtml(hex)}`;
    },
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function muted(text: string): string {
  return `<span style="color:var(--b-text-muted)">${text}</span>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
