"use client";

import { useEffect, useRef, type RefObject } from "react";

// Open dialogs, newest last. Only the top one handles Esc and Tab, so a Sheet over a Drawer closes alone.
const stack: symbol[] = [];

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute("inert") && el.offsetParent !== null);
}

export function useDialog(open: boolean, panel: RefObject<HTMLElement | null>, onEscape: () => void, initialFocus?: RefObject<HTMLElement | null>) {
  const escape = useRef(onEscape);
  escape.current = onEscape;

  useEffect(() => {
    if (!open) return;
    const id = Symbol("dialog");
    stack.push(id);
    const previous = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => {
      const root = panel.current;
      if (!root) return;
      (initialFocus?.current ?? focusables(root)[0] ?? root).focus();
    });

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id) return;
      if (e.key === "Escape") {
        e.preventDefault();
        escape.current();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      const items = focusables(panel.current);
      if (items.length === 0) {
        e.preventDefault();
        panel.current.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!panel.current.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      const at = stack.indexOf(id);
      if (at >= 0) stack.splice(at, 1);
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [open]);
}
