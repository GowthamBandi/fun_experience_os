"use client";

import { ShieldAlert } from "lucide-react";
import { isConfirmed } from "@/lib/console/actions";
import { cn } from "@/lib/format";

/** The typed-phrase confirmation for high-risk Sheets (suspend organizer, reissue code, cancel event). */
export function PhraseBox({ phrase, consequence, value, onChange }: { phrase: string; consequence: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="rounded-control border border-[rgba(255,97,120,0.3)] bg-[rgba(255,97,120,0.07)] p-4">
      <p className="flex items-center gap-2 font-display text-[14px] font-bold text-err">
        <ShieldAlert aria-hidden className="h-4 w-4" />
        High-risk action
      </p>
      <p className="mt-1 text-[13px] leading-[1.5] text-text-2">{consequence}</p>
      <label className="mt-3 block">
        <span className="text-[12px] font-semibold text-text-3">
          Type <code className="rounded-[6px] bg-[rgba(0,0,0,0.3)] px-1.5 py-0.5 font-mono text-text">{phrase}</code> to confirm
        </span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          aria-label={`Type ${phrase} to confirm`}
          className={cn("field mt-2 h-11 w-full rounded-control px-3.5 font-mono text-[14px] text-text", isConfirmed(value, phrase) && "!border-[rgba(63,221,154,0.5)]")}
        />
      </label>
    </div>
  );
}
