"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/format";

export type ToastKind = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  detail?: string;
}

interface ToastApi {
  notify: (kind: ToastKind, title: string, detail?: string) => void;
  success: (title: string, detail?: string) => void;
  error: (title: string, detail?: string) => void;
  info: (title: string, detail?: string) => void;
  warning: (title: string, detail?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const STYLE: Record<ToastKind, { icon: typeof Info; ring: string; iconClass: string }> = {
  success: { icon: CheckCircle2, ring: "border-emerald-200", iconClass: "text-emerald-600" },
  error: { icon: XCircle, ring: "border-red-200", iconClass: "text-red-600" },
  info: { icon: Info, ring: "border-indigo-200", iconClass: "text-indigo-600" },
  warning: { icon: AlertTriangle, ring: "border-amber-200", iconClass: "text-amber-600" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setItems((prev) => prev.filter((t) => t.id !== id)), []);

  const notify = useCallback(
    (kind: ToastKind, title: string, detail?: string) => {
      const id = ++seq.current;
      setItems((prev) => [...prev.slice(-3), { id, kind, title, detail }]);
      window.setTimeout(() => dismiss(id), kind === "error" ? 7000 : 4200);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      notify,
      success: (t, d) => notify("success", t, d),
      error: (t, d) => notify("error", t, d),
      info: (t, d) => notify("info", t, d),
      warning: (t, d) => notify("warning", t, d),
    }),
    [notify],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-[min(92vw,380px)] flex-col gap-2" aria-live="polite">
        <AnimatePresence initial={false}>
          {items.map((t) => {
            const s = STYLE[t.kind];
            const Icon = s.icon;
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 24 }}
                transition={{ duration: 0.24, ease: [0.19, 1, 0.22, 1] }}
                role={t.kind === "error" ? "alert" : "status"}
                className={cn("pointer-events-auto flex gap-3 rounded-2xl border bg-white p-4 shadow-glass", s.ring)}
              >
                <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", s.iconClass)} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink-lum">{t.title}</p>
                  {t.detail && <p className="mt-0.5 text-xs leading-5 text-ink-mut">{t.detail}</p>}
                </div>
                <button onClick={() => dismiss(t.id)} className="text-ink-mut hover:text-ink-lum" aria-label="Dismiss notification">
                  <X className="h-4 w-4" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

const NOOP: ToastApi = { notify: () => {}, success: () => {}, error: () => {}, info: () => {}, warning: () => {} };

export function useToast(): ToastApi {
  return useContext(ToastContext) ?? NOOP;
}

/**
 * Report the outcome of a store command that returns `{ error?: string }`.
 * Returns true when the command succeeded.
 */
export function useCommandFeedback() {
  const toast = useToast();
  return useCallback(
    (result: { error?: string } | undefined | void, success: string, detail?: string): boolean => {
      if (result && typeof result === "object" && "error" in result && result.error) {
        toast.error("Action not completed", result.error);
        return false;
      }
      toast.success(success, detail);
      return true;
    },
    [toast],
  );
}
