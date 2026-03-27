export type NotificationType =
  | 'alarm' | 'order' | 'reservation' | 'stock'
  | 'invoice' | 'maintenance' | 'system' | 'user';

export interface Notification {
  id: string;
  type: NotificationType;
  moduleId: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  href?: string;
  read: boolean;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationState {
  unreadCount: number;
  preview: Notification[];
  drawerOpen: boolean;
}
