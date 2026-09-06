import { useCallback, useEffect, useRef } from "react";

export function useQueuedVisualActions(blocked: boolean) {
  const queuedActionsRef = useRef<Array<() => void>>([]);

  const clearQueuedVisualActions = useCallback(() => {
    queuedActionsRef.current = [];
  }, []);

  const queueVisualAction = useCallback((action: () => void) => {
    if (blocked) {
      queuedActionsRef.current.push(action);
      return;
    }
    action();
  }, [blocked]);

  useEffect(() => {
    if (blocked || queuedActionsRef.current.length === 0) return;
    const queuedActions = queuedActionsRef.current;
    queuedActionsRef.current = [];
    queuedActions.forEach((action) => action());
  }, [blocked]);

  return { queueVisualAction, clearQueuedVisualActions };
}
