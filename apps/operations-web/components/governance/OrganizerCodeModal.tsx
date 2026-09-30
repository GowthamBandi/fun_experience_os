"use client";

import { useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { Modal } from "./controls";
import { formatDateTime } from "@/lib/console/records";

export const ORGANIZER_CODE_WARNING =
  "This code will not be shown again. Deliver it through a verified channel (the applicant's registered phone/email). Re-issue invalidates it.";

/**
 * One-time display of an Organizer Code returned by decideCase (organizer-kyc
 * approval) or reissueOrganizerCode. The code lives only in this component's
 * props; it is never written to storage, logs or the URL.
 */
export function OrganizerCodeModal({ code, orgId, expiresAt, subject, onClose }: { code: string; orgId?: string | null; expiresAt?: string | null; subject: string; onClose: () => void }) {
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  const [acknowledged, setAcknowledged] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
  }

  return (
    <Modal label="One-time Organizer Code">
      <p className="flex items-center gap-2 text-sm font-semibold text-white"><KeyRound className="h-4 w-4 text-indigo-300" />Organizer Code for {subject}</p>
      <div className="mt-4 flex items-center gap-3 rounded-xl border border-indigo-400/30 bg-[#0a111a] p-4">
        <code className="flex-1 select-all break-all font-mono text-2xl tracking-[0.18em] text-white" data-testid="organizer-code">{code}</code>
        <button type="button" onClick={copy} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 px-3 text-xs font-semibold text-slate-100 hover:bg-white/5">
          {copied === "copied" ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}{copied === "copied" ? "Copied" : "Copy"}
        </button>
      </div>
      {copied === "failed" && <p className="mt-2 text-xs text-amber-300">Copy failed — select the code and copy it manually.</p>}
      <dl className="mt-4 grid grid-cols-[7rem_1fr] gap-2 text-xs">
        <dt className="text-slate-500">Expires</dt><dd className="text-slate-200">{expiresAt ? formatDateTime(expiresAt) : "—"}</dd>
        {orgId && <><dt className="text-slate-500">Organizer ID</dt><dd className="break-all text-slate-200">{orgId}</dd></>}
      </dl>
      <p role="note" className="mt-4 rounded-xl border border-amber-400/25 bg-amber-400/5 p-3 text-xs leading-5 text-amber-100">{ORGANIZER_CODE_WARNING}</p>
      <label className="mt-4 flex items-start gap-2 text-xs text-slate-300">
        <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-0.5" />
        I have recorded the code for delivery through the applicant&apos;s verified channel.
      </label>
      <div className="mt-5 flex justify-end">
        <button type="button" disabled={!acknowledged} onClick={onClose} className="h-10 rounded-xl bg-indigo-500 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Close — the code will not be shown again</button>
      </div>
    </Modal>
  );
}
