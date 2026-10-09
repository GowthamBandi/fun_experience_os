"use client";

import { Suspense, type ReactNode } from "react";
import { PageContainer } from "@/components/shell/PageContainer";
import { Skeleton, SkeletonRows } from "@/components/pulse";

/** The route-level Suspense the `?record=` deep links need (useSearchParams), with a page-shaped fallback. */
export function ControlSuspense({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <PageContainer className="flex flex-col gap-6">
          <Skeleton className="h-10 w-64 rounded-pill" />
          <SkeletonRows rows={5} />
        </PageContainer>
      }
    >
      {children}
    </Suspense>
  );
}

/** Pretty-printed JSON for before/after snapshots and rule bodies; nothing when there is no value. */
export function JsonBlock({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <section aria-label={label} className="flex flex-col gap-2">
      <h3 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-text-3">{label}</h3>
      <pre className="max-h-64 overflow-auto rounded-control border border-line-soft bg-[rgba(0,0,0,0.28)] p-3.5 font-mono text-[12px] leading-5 text-text-2">{JSON.stringify(value, jsonSafe, 2)}</pre>
    </section>
  );
}

/** Firestore Timestamps stringify as ISO dates instead of {seconds, nanoseconds}. */
function jsonSafe(_key: string, value: unknown): unknown {
  if (value && typeof value === "object" && typeof (value as { toDate?: unknown }).toDate === "function") {
    try {
      return (value as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return null;
    }
  }
  return value;
}

/** A small count pill used in page summaries. */
export function SummaryPill({ label, value, tone = "default" }: { label: string; value: ReactNode; tone?: "default" | "ok" | "warn" | "err" }) {
  const color = tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "err" ? "text-err" : "text-text";
  return (
    <li className="inline-flex items-center gap-2 rounded-pill border border-line-soft bg-[rgba(255,255,255,0.03)] px-3 py-1.5">
      <span className="text-text-3">{label}</span>
      <b className={`num text-[13px] ${color}`}>{value}</b>
    </li>
  );
}
