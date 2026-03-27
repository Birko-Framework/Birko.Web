import type { ConnectionState } from '../shell/shell-types.js';

/** Create a connection state manager for SSE/WebSocket status tracking. */
export function createConnectionStateManager() {
  type StateListener = (state: ConnectionState) => void;
  const listeners = new Set<StateListener>();
  let current: ConnectionState = 'offline';

  function getState(): ConnectionState {
    return current;
  }

  function setState(state: ConnectionState): void {
    if (current === state) return;
    current = state;
    for (const listener of listeners) {
      try { listener(state); } catch { /* ignore */ }
    }
  }

  function onChange(listener: StateListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { getState, setState, onChange };
}
