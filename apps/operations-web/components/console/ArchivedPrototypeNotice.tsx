"use client";

import Link from "next/link";
import { Archive, ArrowLeft } from "lucide-react";
import { ARCHIVED_BANNER } from "@/lib/console/archived";

/** Rendered instead of an archived prototype page (ADR-0006). */
export function ArchivedPrototypeNotice({ pathname }: { pathname: string }) {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col items-center justify-center px-5 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-400/20 bg-slate-400/10 text-slate-300"><Archive className="h-5 w-5" /></span>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight text-white">Archived prototype</h1>
      <p className="mt-3 text-sm leading-6 text-slate-400" data-testid="archived-notice">{ARCHIVED_BANNER}</p>
      <p className="mt-3 text-xs leading-5 text-slate-500">
        <code className="rounded bg-white/5 px-1.5 py-0.5 text-slate-300">{pathname}</code> belongs to the old company-operated operations model. In the governed marketplace, organizers run event-day operations in PULSE; this console governs (ADR-0006).
      </p>
      <Link href="/" className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-indigo-500 px-4 text-sm font-semibold text-white hover:bg-indigo-400"><ArrowLeft className="h-4 w-4" />Back to the Command Center</Link>
    </div>
  );
}

/** Persistent banner above archived pages when NEXT_PUBLIC_SHOW_ARCHIVED_PROTOTYPE=true. */
export function ArchivedPrototypeBanner() {
  return (
    <div role="note" data-testid="archived-banner" className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-amber-400/25 bg-[#2a2110] px-5 py-2.5 text-xs text-amber-100">
      <Archive className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1">{ARCHIVED_BANNER} Local reference only (browser storage).</span>
      <Link href="/" className="font-semibold underline underline-offset-2">Command Center</Link>
    </div>
  );
}
