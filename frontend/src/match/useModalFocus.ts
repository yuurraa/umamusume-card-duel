import { useEffect, useRef, type RefObject } from "react";

type ModalFocusOptions = {
  active?: boolean;
  onClose?: (() => void) | undefined;
};

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const activeDialogStack: HTMLElement[] = [];

/** Keeps keyboard focus inside a dialog and restores the invoking element. */
export function useModalFocus<T extends HTMLElement = HTMLElement>({ active = true, onClose }: ModalFocusOptions = {}): RefObject<T> {
  const dialogRef = useRef<T | null>(null);
  const onCloseRef = useRef(onClose);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!active) return undefined;
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    activeDialogStack.push(dialog);

    const getFocusable = (): HTMLElement[] => Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      .filter((element) => element.getAttribute("aria-hidden") !== "true");

    const focusInitialControl = () => {
      const firstControl = getFocusable()[0];
      if (firstControl) {
        firstControl.focus();
        return;
      }
      if (!dialog.hasAttribute("tabindex")) dialog.setAttribute("tabindex", "-1");
      dialog.focus();
    };

    focusInitialControl();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (activeDialogStack[activeDialogStack.length - 1] !== dialog) return;
      if (event.key === "Escape") {
        if (onCloseRef.current) {
          event.preventDefault();
          onCloseRef.current();
        }
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = getFocusable();
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const current = document.activeElement;
      if (event.shiftKey && (current === first || current === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (current === last || current === dialog)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      const stackIndex = activeDialogStack.lastIndexOf(dialog);
      const wasTopDialog = stackIndex === activeDialogStack.length - 1;
      if (stackIndex >= 0) activeDialogStack.splice(stackIndex, 1);
      const previous = previouslyFocusedRef.current;
      if (wasTopDialog && previous && previous.isConnected) previous.focus();
      previouslyFocusedRef.current = null;
    };
  }, [active]);

  return dialogRef as RefObject<T>;
}
