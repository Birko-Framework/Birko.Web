export interface ModuleManifest {
  id: string;
  label: string;
  labelKey?: string;
  icon: string;
  order: number;
  category?: string;
  /** One line for the module's ribbon tooltip (TASK-803). `descriptionKey` goes through the label resolver. */
  description?: string;
  descriptionKey?: string;
  options: ModuleOption[];
  permissions: string[];
  status?: ModuleStatus;
  defaultWidgets?: PlacedWidget[];
}

export interface ModuleOption {
  id: string;
  label: string;
  labelKey?: string;
  route: string;
  permission?: string;
  badge?: number;
  icon?: string;
  group?: string;
  groupLabel?: string;
  groupLabelKey?: string;
  actionOnly?: boolean;
  /** One line for the page's ribbon tooltip (TASK-803). `descriptionKey` goes through the label resolver. */
  description?: string;
  descriptionKey?: string;
}

export interface ModuleStatus {
  text: string;
  variant?: 'success' | 'warning' | 'danger';
}

export interface PlacedWidget {
  widgetId: string;
  layoutId?: string;
  position: { col: number; row: number };
}

export interface ModuleState {
  modules: ModuleManifest[];
  activeModuleId: string | null;
  activeOptionId: string | null;
}

export interface SidebarItem {
  id: string;
  label: string;
  icon: string;
  href: string;
}

export interface RouteEntry {
  moduleId: string;
  optionId: string;
  route: string;
}
