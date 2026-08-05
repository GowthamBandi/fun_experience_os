"use client";

import { useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/overlays";

/** A destructive/confirming action that always asks first. */
export function ConfirmAction({
  label,
  title,
  body,
  confirmLabel = "Confirm",
  tone = "danger",
  onConfirm,
  variant = "secondary",
  className,
  icon,
}: {
  label: ReactNode;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  onConfirm: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "lamp";
  className?: string;
  icon?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} className={className} onClick={() => setOpen(true)}>
        {icon}
        {label}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={title}>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning/10 text-warning">
            <AlertTriangle className="h-4 w-4" />
          </span>
          <div className="min-w-0 text-sm text-ink-sec">{body}</div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
