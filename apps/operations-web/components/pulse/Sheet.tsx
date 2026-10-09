"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/format";
import { Button } from "./Button";
import { useDialog } from "./use-dialog";

export type SheetProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  tone: "volt" | "danger";
  requireReason?: boolean;
  reasonLabel?: string;
  minReason?: number;
  extra?: ReactNode;
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
};

const EASE = [0.2, 0.8, 0.2, 1] as const;

function message(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "string" && e) return e;
  return "Something went wrong. Nothing was changed.";
}

export function Sheet(props: SheetProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(<AnimatePresence>{props.open ? <SheetPanel key="sheet" {...props} /> : null}</AnimatePresence>, document.body);
}

function SheetPanel({
  title,
  description,
  confirmLabel,
  tone,
  requireReason = false,
  reasonLabel = "Reason",
  minReason = 5,
  extra,
  onConfirm,
  onClose,
}: SheetProps) {
  const reduced = useReducedMotion();
  const ids = useId();
  const panel = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const busy = useRef(false);
  const alive = useRef(true);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const close = () => {
    if (!busy.current) onClose();
  };
  useDialog(true, panel, close, requireReason ? field : cancel);

  const trimmed = reason.trim();
  const valid = !requireReason || trimmed.length >= minReason;

  const confirm = async () => {
    if (busy.current || !valid) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      await onConfirm(trimmed);
      busy.current = false;
      if (alive.current) setPending(false);
      onClose();
    } catch (e) {
      busy.current = false;
      if (alive.current) {
        setPending(false);
        setError(message(e));
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-4 sm:items-center">
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-[rgba(7,6,12,0.68)] backdrop-blur-[6px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: EASE }}
        onClick={close}
      />
      <motion.div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        aria-describedby={description ? `${ids}-desc` : undefined}
        aria-busy={pending || undefined}
        tabIndex={-1}
        className="relative flex max-h-[calc(100vh-32px)] w-full max-w-[480px] flex-col overflow-hidden rounded-[28px] border border-line-soft bg-[rgba(26,23,38,0.94)] shadow-glow outline-none backdrop-blur-[18px]"
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.97 }}
        animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
        exit={reduced ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
        transition={{ duration: 0.22, ease: EASE }}
      >
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 h-28",
            tone === "danger"
              ? "bg-[radial-gradient(70%_100%_at_15%_0%,rgba(255,97,120,0.16),transparent_70%)]"
              : "bg-[radial-gradient(70%_100%_at_15%_0%,rgba(142,114,255,0.24),transparent_70%)]",
          )}
        />
        <div className="relative flex items-start gap-3 px-6 pt-6">
          <div className="min-w-0 flex-1">
            <h2 id={`${ids}-title`} className="font-display text-[22px] font-bold leading-tight tracking-[-0.02em] text-text">
              {title}
            </h2>
            {description ? (
              <p id={`${ids}-desc`} className="mt-1.5 text-[14px] leading-[1.5] text-text-2">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            disabled={pending}
            className="focus-ring -mr-2 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-[12px] text-text-3 transition-colors duration-150 hover:bg-[rgba(255,255,255,0.06)] hover:text-text disabled:opacity-40"
          >
            <X aria-hidden className="h-[18px] w-[18px]" />
          </button>
        </div>

        <form
          className="relative flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            void confirm();
          }}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pb-2 pt-5">
            {extra}
            {requireReason ? (
              <div>
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <label htmlFor={`${ids}-reason`} className="text-[12px] font-semibold text-text-3">
                    {reasonLabel}
                  </label>
                  <span className={cn("num text-[12px]", trimmed.length >= minReason ? "text-ok" : "text-text-3")} aria-hidden>
                    {Math.min(trimmed.length, minReason)}/{minReason}
                  </span>
                </div>
                <textarea
                  id={`${ids}-reason`}
                  ref={field}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={pending}
                  rows={3}
                  aria-describedby={`${ids}-hint`}
                  aria-invalid={reason.length > 0 && !valid ? true : undefined}
                  className="field block min-h-[92px] w-full resize-y rounded-control px-3.5 py-3 text-[14px] leading-[1.5] text-text placeholder:text-text-3 disabled:opacity-60"
                  placeholder="Write a short note for the audit trail"
                />
                <p id={`${ids}-hint`} className="mt-1.5 text-[12px] text-text-3">
                  At least {minReason} characters.
                </p>
              </div>
            ) : null}
            {error ? (
              <div role="alert" className="flex items-start gap-2.5 rounded-control border border-[rgba(255,97,120,0.3)] bg-[rgba(255,97,120,0.1)] px-3.5 py-3 text-[13px] leading-5 text-err">
                <AlertCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="break-words">{error}</span>
              </div>
            ) : null}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-line-soft px-6 py-4">
            <Button ref={cancel} variant="quiet" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" variant={tone === "volt" ? "volt" : "danger"} loading={pending} disabled={!valid}>
              {confirmLabel}
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
