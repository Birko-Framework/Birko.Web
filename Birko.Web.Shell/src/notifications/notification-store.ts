import { Store } from 'birko-web-core/state';
import type { Notification, NotificationState } from './notification-types.js';

/** Create a notification store with helper functions. */
export function createNotificationStore() {
  const store = new Store<NotificationState>({
    unreadCount: 0,
    preview: [],
    drawerOpen: false,
  });

  /** Handle a new notification from SSE. Increments badge, updates preview. */
  function handleNewNotification(n: Notification): void {
    store.set('unreadCount', store.get('unreadCount') + 1);
    const preview = store.get('preview');
    store.set('preview', [n, ...preview].slice(0, 5));
  }

  function openDrawer(): void  { store.set('drawerOpen', true); }
  function closeDrawer(): void { store.set('drawerOpen', false); }

  return { store, handleNewNotification, openDrawer, closeDrawer };
}
