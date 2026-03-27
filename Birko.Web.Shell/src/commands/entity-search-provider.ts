import type { ApiClient } from 'birko-web-core/http';
import type { CommandProvider, CommandItem } from 'birko-web-components/command';

export interface EntitySearchProviderOptions {
  moduleId: string;
  moduleLabel: string;
  icon: string;
  apiClient: ApiClient;
  /** Search endpoint path (default: `api/{moduleId}/search`) */
  endpoint?: string;
  order?: number;
}

/** Create a command palette provider that searches entities via API. */
export function createEntitySearchProvider(options: EntitySearchProviderOptions): CommandProvider {
  const {
    moduleId, moduleLabel, icon, apiClient,
    endpoint = `api/${moduleId}/search`,
    order = 30,
  } = options;

  return {
    id: `entity:${moduleId}`,
    label: moduleLabel,
    order,
    async search(query: string): Promise<CommandItem[]> {
      if (!query || query.length < 2) return [];

      const resp = await apiClient.get<{ id: string; label: string; href?: string }[]>(
        `${endpoint}?q=${encodeURIComponent(query)}&limit=5`,
      );
      if (!resp.ok) return [];

      return resp.data.map((item: { id: string; label: string; href?: string }) => ({
        id: `entity:${moduleId}:${item.id}`,
        label: item.label,
        description: moduleLabel,
        icon,
        category: moduleLabel,
        href: item.href ?? `/${moduleId}/${item.id}`,
      }));
    },
  };
}
