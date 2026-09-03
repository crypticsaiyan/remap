// Promise-based confirmation gate for destructive WebMCP tools. The pending
// prompt's *display* payload lives in Redux (mcpConfirmSlice) so ConfirmDialog
// can render it; the resolver function itself is kept here, outside Redux,
// since function references don't belong in serializable store state.

import {store} from 'src/store';
import {
  clearPendingConfirmation,
  setPendingConfirmation,
} from 'src/store/mcpConfirmSlice';

let pendingResolver: ((approved: boolean) => void) | null = null;

export function confirmDestructiveAction(payload: {
  toolName: string;
  title: string;
  description: string;
}): Promise<boolean> {
  return new Promise((resolve) => {
    // Only one confirmation can be pending at a time; auto-deny a stale one
    // rather than leaving it dangling if a second destructive call races in.
    if (pendingResolver) {
      pendingResolver(false);
    }
    pendingResolver = resolve;
    store.dispatch(
      setPendingConfirmation({
        requestId: `confirm-${Date.now()}`,
        title: payload.title,
        description: payload.description,
        toolName: payload.toolName,
      }),
    );
  });
}

export function resolvePendingConfirmation(approved: boolean) {
  if (pendingResolver) {
    const resolve = pendingResolver;
    pendingResolver = null;
    resolve(approved);
  }
  store.dispatch(clearPendingConfirmation());
}
