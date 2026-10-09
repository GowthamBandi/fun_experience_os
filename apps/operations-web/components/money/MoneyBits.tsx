"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, Info, TriangleAlert } from "lucide-react";
import { Sheet, useToast, type ToastInput } from "@/components/pulse";
import { PhraseBox } from "@/components/governance/PhraseBox";
import { isConfirmed, type RequestIdBook } from "@/lib/console/actions";
import { rethrowForSheet } from "@/lib/console/errors";
import { canViewRoute } from "@/lib/console/capabilities";
import { useAdminSession } from "@/lib/firebase/auth";
import { formatDateTime } from "@/lib/console/records";
import { cn, relTime } from "@/lib/format";
import { fetchOrganizerNames } from "@/lib/organizers-firestore";
import { distinctIds, nameOrId } from "@/lib/trust";
import { useGovernanceCollection } from "@/lib/use-governance";
import { useOneShot } from "@/lib/use-query";

/** Organizer names are one publicOrganizers read each; cap the fan-out. */
const NAME_MAX = 40;

/** publicOrganizers.name for the distinct orgIds on screen, batched in one effect. */
export function useOrgNames(ids: Array<string | null>, scope: string): Record<string, string | null> {
  const orgIds = useMemo(() => distinctIds(ids, NAME_MAX), [ids]);
  const names = useOneShot(orgIds.length ? `${scope}-org-names|${orgIds.join(",")}` : null, () => fetchOrganizerNames(orgIds));
  return useMemo(() => names.value ?? {}, [names.value]);
}

export function OrgLink({ id, names, className }: { id: string | null; names: Record<string, string | null>; className?: string }) {
  const { consoleRole } = useAdminSession();
  const canOpen = canViewRoute(consoleRole, "/partners");
  if (!id) return <span className="text-text-3">—</span>;
  const org = nameOrId(id, names);
  // Organizer 360 is admin-only; other roles (auditors on Settlements) get the name without a dead-end link.
  if (!canOpen) return <span className={cn("inline-flex max-w-[220px] truncate", org.isName ? "font-semibold text-text" : "font-mono text-[12px] text-text-2", className)}>{org.text}</span>;
  return (
    <Link
      href={`/partners/${encodeURIComponent(id)}`}
      className={cn("focus-ring inline-flex max-w-[220px] items-center gap-1 truncate rounded-[6px] underline-offset-2 hover:text-text hover:underline", org.isName ? "font-semibold text-text" : "font-mono text-[12px] text-text-2", className)}
    >
      <span className="truncate">{org.text}</span>
      <ArrowUpRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-text-3" />
    </Link>
  );
}

export function Age({ at, now }: { at: Date | null; now: Date | null }) {
  return (
    <span className="num whitespace-nowrap text-[13px] text-text-2" title={formatDateTime(at)}>
      {now ? relTime(at, now) : "—"}
    </span>
  );
}

export function When({ at, now }: { at: Date | null; now: Date | null }) {
  if (!at) return <>—</>;
  return (
    <>
      {formatDateTime(at)}
      {now ? <span className="text-text-3"> · {relTime(at, now)}</span> : null}
    </>
  );
}

export function Fields({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <dl aria-label={label} className="divide-y divide-line-soft rounded-control border border-line-soft px-4">
      {children}
    </dl>
  );
}

export function Field({ label, children, mono = false }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-3 py-3 text-[13px]">
      <dt className="text-text-3">{label}</dt>
      <dd className={cn("min-w-0 break-words text-text", mono && "font-mono text-[12px]")}>{children}</dd>
    </div>
  );
}

export function Note({ tone = "info", children }: { tone?: "info" | "warn"; children: ReactNode }) {
  const warn = tone === "warn";
  const Icon = warn ? TriangleAlert : Info;
  return (
    <div
      role={warn ? "note" : undefined}
      className={cn(
        "flex items-start gap-2.5 rounded-control border px-3.5 py-3 text-[13px] leading-[1.5]",
        warn ? "border-[rgba(255,184,77,0.3)] bg-[rgba(255,184,77,0.08)] text-text" : "border-[rgba(99,190,255,0.25)] bg-[rgba(99,190,255,0.06)] text-text-2",
      )}
    >
      <Icon aria-hidden className={cn("mt-0.5 h-4 w-4 shrink-0", warn ? "text-warn" : "text-info")} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-text-3">{children}</h3>;
}

/** The drawer body when the deep-linked record isn't in the live list. */
export function Gone({ noun }: { noun: string }) {
  return (
    <p role="status" className="rounded-control border border-dashed border-[rgba(255,184,77,0.35)] px-3.5 py-3 text-[13px] text-warn">
      This {noun} is no longer in the live list (it may have been removed, or you lost access). Close the panel and refresh the list.
    </p>
  );
}

/* ------------------------------------------------------------ decision sheet */

export interface DecisionSpec {
  /** One request id per intended action: a retry after a network failure replays it. */
  idKey: string;
  title: string;
  consequence: string;
  confirmLabel: string;
  tone: "volt" | "danger";
  /** Typed phrase (CONFIRM_PHRASES) for high-risk decisions. */
  phrase?: string | null;
  /** Minimum note length; 0 hides the note (commands whose contract takes none). */
  reasonMin: number;
  reasonLabel?: string;
  /** Extra inputs, controlled by the caller. */
  fields?: ReactNode;
  /** A client-side check before the call (missing input); a message blocks the call. */
  validate?: () => string | null;
  execute: (requestId: string, reason: string) => Promise<ToastInput>;
}

/**
 * The confirm Sheet for a money decision: note, optional typed phrase, a stable
 * request id per intended action and the server's mapped message on failure
 * (rethrowForSheet keeps the id only when a retry should replay it).
 */
export function DecisionSheet({ spec, book, onClose }: { spec: DecisionSpec | null; book: RequestIdBook; onClose: () => void }) {
  const toast = useToast();
  const [typed, setTyped] = useState("");
  // A new decision clears the phrase; a live update that only moves the idKey (status/updatedAt) keeps it,
  // like the Sheet keeps the note. The changed key still gets its own request id.
  const opened = spec ? `${spec.title}|${spec.confirmLabel}` : null;
  useEffect(() => setTyped(""), [opened]);

  const confirm = async (reason: string) => {
    if (!spec) return;
    if (spec.phrase && !isConfirmed(typed, spec.phrase)) throw new Error(`Type ${spec.phrase} to confirm.`);
    const invalid = spec.validate?.() ?? null;
    if (invalid) throw new Error(invalid);
    try {
      const outcome = await spec.execute(book.idFor(spec.idKey), reason);
      book.reset();
      toast.show(outcome);
    } catch (cause) {
      rethrowForSheet(cause, book);
    }
  };

  return (
    <Sheet
      open={!!spec}
      title={spec?.title ?? ""}
      description={spec && !spec.phrase ? spec.consequence : undefined}
      confirmLabel={spec?.confirmLabel ?? ""}
      tone={spec?.tone ?? "danger"}
      requireReason={!!spec && spec.reasonMin > 0}
      minReason={spec?.reasonMin || 10}
      reasonLabel={spec?.reasonLabel ?? "Reason (kept in the audit trail)"}
      extra={
        spec?.fields || spec?.phrase ? (
          <>
            {spec.fields}
            {spec.phrase ? <PhraseBox phrase={spec.phrase} consequence={spec.consequence} value={typed} onChange={setTyped} /> : null}
          </>
        ) : undefined
      }
      onConfirm={confirm}
      onClose={onClose}
    />
  );
}

/* --------------------------------------------------------------- org picker */

const LABEL = "text-[12px] font-semibold text-text-3";
const INPUT = "field mt-1.5 h-11 w-full rounded-control px-3.5 text-[14px] text-text";

/**
 * Organizer picker for proposals and settlement builds: the live organizers list
 * (name, then id). When the list can't load or is cut off, the ID can be typed.
 */
export function OrgPicker({ value, onChange, enabled }: { value: string; onChange: (id: string) => void; enabled: boolean }) {
  const { records, loading, error, truncated } = useGovernanceCollection("organizers", enabled);
  const options = useMemo(
    () =>
      records
        .map((r) => {
          const name = typeof r.raw.name === "string" && r.raw.name.trim() ? r.raw.name.trim() : typeof r.raw.subject === "string" && r.raw.subject.trim() ? r.raw.subject.trim() : null;
          return { id: r.id, name: name ?? r.id, status: typeof r.raw.status === "string" ? r.raw.status : null };
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    [records],
  );
  const listed = options.some((o) => o.id === value);
  return (
    <div className="flex flex-col gap-3">
      {!error ? (
        <label className="block">
          <span className={LABEL}>Organizer</span>
          <select value={listed ? value : ""} onChange={(e) => onChange(e.target.value)} disabled={loading} aria-label="Organizer" className={cn(INPUT, "bg-surface-high")}>
            <option value="">{loading ? "Loading organizers…" : "Choose an organizer"}</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
                {o.status && o.status !== "active" ? ` (${o.status})` : ""} · {o.id}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {error || truncated ? (
        <label className="block">
          <span className={LABEL}>{error ? "Organizer ID (orgId)" : "Not listed? Organizer ID (orgId)"}</span>
          <input value={value} onChange={(e) => onChange(e.target.value.trim())} placeholder="e.g. org_abc123" autoComplete="off" spellCheck={false} className={cn(INPUT, "font-mono")} />
          {error ? <span className="mt-1.5 block text-[12px] text-warn">The organizer list couldn’t load ({error}). Enter the ID instead.</span> : null}
        </label>
      ) : null}
    </div>
  );
}
