"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/format";

export type ToastInput = { tone: "ok" | "err" | "info"; title: string; body?: string };
type ToastItem = ToastInput & { id: number };
type ToastApi = { show(input: ToastInput): void };

const ToastContext = createContext<ToastApi | null>(null);
const LIFETIME_MS = 5000;
const EASE = [0.2, 0.8, 0.2, 1] as const;

const TONE = {
  ok: { icon: CheckCircle2, ring: "text-ok bg-[rgba(63,221,154,0.14)]", bar: "bg-ok" },
  err: { icon: AlertCircle, ring: "text-err bg-[rgba(255,97,120,0.14)]", bar: "bg-err" },
  info: { icon: Info, ring: "text-info bg-[rgba(99,190,255,0.14)]", bar: "bg-info" },
} as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const show = useCallback((input: ToastInput) => {
    const id = ++seq.current;
    setToasts((ts) => [...ts.slice(-3), { ...input, id }]);
  }, []);
  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <section aria-label="Notifications" className="pointer-events-none fixed bottom-5 right-5 z-[90] flex w-[min(380px,calc(100vw-40px))] flex-col items-stretch gap-2.5">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <ToastCard key={t.id} toast={t} onDismiss={dismiss} />
          ))}
        </AnimatePresence>
      </section>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const reduced = useReducedMotion();
  const { icon: Icon, ring, bar } = TONE[toast.tone];

  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(toast.id), LIFETIME_MS);
    return () => window.clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <motion.div
      layout={!reduced}
      role="status"
      aria-live="polite"
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.96 }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, x: 24, scale: 0.98 }}
      transition={{ duration: 0.22, ease: EASE }}
      className="pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-[20px] border border-line-soft bg-[rgba(36,32,51,0.94)] p-3.5 pr-11 shadow-[0_24px_64px_-20px_rgba(0,0,0,0.7)] backdrop-blur-[16px]"
    >
      <span aria-hidden className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-[12px]", ring)}>
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="font-display text-[14px] font-bold leading-5 tracking-[-0.01em] text-text">{toast.title}</div>
        {toast.body ? <p className="mt-0.5 break-words text-[13px] leading-5 text-text-2">{toast.body}</p> : null}
      </div>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(toast.id)}
        className="focus-ring absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-[10px] text-text-3 transition-colors duration-150 hover:bg-[rgba(255,255,255,0.06)] hover:text-text"
      >
        <X aria-hidden className="h-4 w-4" />
      </button>
      {reduced ? null : (
        <motion.span
          aria-hidden
          className={cn("absolute bottom-0 left-0 h-[2px] w-full origin-left opacity-70", bar)}
          initial={{ scaleX: 1 }}
          animate={{ scaleX: 0 }}
          transition={{ duration: LIFETIME_MS / 1000, ease: "linear" }}
        />
      )}
    </motion.div>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>.");
  return ctx;
}
