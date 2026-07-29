export { BSidebar, type SidebarItem } from './b-sidebar.js';
export { BBreadcrumb } from './b-breadcrumb.js';
export { BRibbon, type RibbonTab, type RibbonGroup, type RibbonItem, type RibbonGroupSize } from './b-ribbon.js';
// The progressive-scaling policy is exported so a consumer can reason about it (and so the playground
// can parity-test it against the C# original in Birko.Xaml.Core).
export { resolveRibbonSizes, RIBBON_SIZE_LADDER, type RibbonGroupMetrics } from './ribbon-scaling.js';
export { BTreeMenu, type TreeMenuItem, type TreeConfig, type TreeNodeAction } from './b-tree-menu.js';
