"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, KeyRound, ShieldAlert } from "lucide-react";
import { Button } from "@/components/pulse";
import { useDialog } from "@/components/pulse/use-dialog";
import { formatDateTime } from "@/lib/console/records";

export const ORGANIZER_CODE_WARNING =
  "This code will not be shown again. Deliver it through a verified channel (the applicant's registered phone/email). Re-issue invalidates it.";

const noop = () => {};

/**
 * One-time display of an Organizer Code returned by decideCase (organizer-kyc
 * approval) or reissueOrganizerCode. The code lives only in this component's
 * props; it is never written to storage, logs or the URL. It can't be
 * dismissed (no Esc, no backdrop click) until the operator acknowledges it.
 */
export function OrganizerCodeModal({ code, orgId, expiresAt, subject, onClose }: { code: string; orgId?: string | null; expiresAt?: string | null; subject: string; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  const [acknowledged, setAcknowledged] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const copyButton = useRef<HTMLButtonElement>(null);
  const ids = useId();
  useEffect(() => setMounted(true), []);
  useDialog(mounted, panel, noop, copyButton);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
  }

  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[85] flex items-end justify-center p-4 sm:items-center">
      <div aria-hidden className="absolute inset-0 bg-[rgba(7,6,12,0.74)] backdrop-blur-[6px]" />
      <div
        ref={panel}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        aria-describedby={`${ids}-warn`}
        tabIndex={-1}
        className="relative w-full max-w-[520px] overflow-hidden rounded-[28px] border border-line-soft bg-[rgba(26,23,38,0.96)] p-6 shadow-glow outline-none backdrop-blur-[18px]"
      >
        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(70%_100%_at_15%_0%,rgba(142,114,255,0.28),transparent_70%)]" />
        <div className="relative flex items-start gap-3">
          <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-[rgba(142,114,255,0.18)] text-[#C2B4FF]">
            <KeyRound className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="overline font-semibold">One-time Organizer Code</p>
            <h2 id={`${ids}-title`} className="mt-1 font-display text-[22px] font-bold leading-tight tracking-[-0.02em] text-text">
              {subject}
            </h2>
          </div>
        </div>

        <div className="relative mt-5 flex items-center gap-3 rounded-[20px] border border-[rgba(142,114,255,0.35)] bg-[linear-gradient(135deg,rgba(142,114,255,0.14),rgba(18,16,28,0.9))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          <code className="num flex-1 select-all break-all text-[28px] font-bold tracking-[0.2em] text-text" data-testid="organizer-code">
            {code}
          </code>
          <Button ref={copyButton} variant="ghost" size="sm" icon={copied === "copied" ? <Check className="text-ok" /> : <Copy />} onClick={copy}>
            {copied === "copied" ? "Copied" : "Copy"}
          </Button>
        </div>
        {copied === "failed" && <p className="mt-2 text-[12px] text-warn">Copy failed. Select the code and copy it manually.</p>}

        <dl className="relative mt-4 grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-2 text-[13px]">
          <dt className="text-text-3">Expires</dt>
          <dd className="text-text">{expiresAt ? formatDateTime(expiresAt) : "—"}</dd>
          {orgId && (
            <>
              <dt className="text-text-3">Organizer ID</dt>
              <dd className="break-all font-mono text-[12px] text-text-2">{orgId}</dd>
            </>
          )}
        </dl>

        <p id={`${ids}-warn`} role="note" className="relative mt-4 flex gap-2.5 rounded-control border border-[rgba(255,184,77,0.3)] bg-[rgba(255,184,77,0.08)] p-3.5 text-[13px] leading-5 text-[#FFD9A0]">
          <ShieldAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
          <span>{ORGANIZER_CODE_WARNING}</span>
        </p>

        <label className="relative mt-4 flex cursor-pointer items-start gap-2.5 text-[13px] leading-5 text-text-2">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
            className="focus-ring mt-0.5 h-4 w-4 shrink-0 accent-[#8E72FF]"
          />
          I have recorded the code for delivery through the applicant&apos;s verified channel.
        </label>

        <div className="relative mt-5 flex justify-end border-t border-line-soft pt-4">
          <Button variant="volt" disabled={!acknowledged} onClick={onClose}>
            Close. The code won&apos;t be shown again
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
