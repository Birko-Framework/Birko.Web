// ── Types ───────────────────────────────────────────────────────────────────

export interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  category: string;
  href?: string;
  action?: () => void | Promise<void>;
}

export interface CommandProvider {
  id: string;
  label: string;
  order: number;
  search(query: string): Promise<CommandItem[]> | CommandItem[];
}

// ── Provider registry ───────────────────────────────────────────────────────

const _providers: CommandProvider[] = [];

export function registerProvider(provider: CommandProvider): void {
  const idx = _providers.findIndex(p => p.id === provider.id);
  if (idx >= 0) _providers[idx] = provider;
  else _providers.push(provider);
  _providers.sort((a, b) => a.order - b.order);
}

export function getProviders(): CommandProvider[] {
  return _providers;
}

// ── Recent items ─────────────────────────────────────────────────────────────

export interface RecentItem {
  id: string;
  label: string;
  href: string;
  moduleId?: string;
  icon?: string;
  visitedAt: number;
}

export interface RecentProviderOptions {
  /** LocalStorage key for recent items. */
  storageKey?: string;
  /** Maximum number of recent items to store. */
  maxItems?: number;
  /** Number of items to show when query is empty. */
  previewCount?: number;
}

/**
 * Create a recent-items command provider with configurable storage.
 */
export function createRecentProvider(options: RecentProviderOptions = {}): {
  provider: CommandProvider;
  trackItem: (item: Omit<RecentItem, 'visitedAt'>) => void;
  getItems: () => RecentItem[];
} {
  const storageKey = options.storageKey ?? 'birko_recent';
  const maxItems = options.maxItems ?? 20;
  const previewCount = options.previewCount ?? 5;

  function getItems(): RecentItem[] {
    try {
      return JSON.parse(localStorage.getItem(storageKey) ?? '[]') as RecentItem[];
    } catch {
      return [];
    }
  }

  function trackItem(item: Omit<RecentItem, 'visitedAt'>): void {
    const recent = getItems().filter(r => r.id !== item.id);
    recent.unshift({ ...item, visitedAt: Date.now() });
    localStorage.setItem(storageKey, JSON.stringify(recent.slice(0, maxItems)));
  }

  const provider: CommandProvider = {
    id: 'recent',
    label: 'Recent',
    order: 0,
    search(query: string): CommandItem[] {
      const recent = getItems();
      const filtered = query
        ? recent.filter(r => r.label.toLowerCase().includes(query.toLowerCase()))
        : recent.slice(0, previewCount);

      return filtered.map(r => ({
        id: `recent:${r.id}`,
        label: r.label,
        description: r.href,
        icon: r.icon,
        category: 'Recent',
        href: r.href,
      }));
    },
  };

  return { provider, trackItem, getItems };
}
