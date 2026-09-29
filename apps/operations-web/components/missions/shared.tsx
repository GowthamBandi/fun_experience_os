"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, ChevronRight, Lock, SearchX } from "lucide-react";
import { useStore } from "@/lib/store";
import type { PrototypeState } from "@/lib/prototype/scenarios/state";
import type { LiveSessionState, ScheduledSession } from "@/lib/prototype/entities";
import { sessionTitle, venueName } from "@/lib/prototype/selectors/lookups";
import { sessionCapacityLedger } from "@/lib/prototype/selectors/capacity";
import { selectSessionFinancialSummary } from "@/lib/prototype/selectors/money";
import { selectCheckInSummary } from "@/lib/prototype/selectors/checkIn";
import { selectLiveSessionState } from "@/lib/prototype/selectors/liveSession";
import { selectResultsProgress } from "@/lib/prototype/selectors/results";
import { selectCompletionChecklist } from "@/lib/prototype/selectors/completion";
import { inr, cn } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, StatusChip, type Tone } from "@/components/ui/primitives";
import { PermissionDenied } from "@/components/ui/panels";
import { Dialog } from "@/components/ui/overlays";

/* ------------------------------------------------------------------ */
/* Status language                                                     */
/* ------------------------------------------------------------------ */

/** Plain-English label for a live-session or session status. */
export function getOperationalStatusLabel(status: string) {
  const map: Record<string, string> = {
    Ready: "Not started",
    Opening: "Opened",
    Live: "Running",
    Paused: "Paused",
    Emergency: "Emergency",
    Ending: "Ending",
    Ended: "Ended",
    Completed: "Completed",
  };
  return map[status] ?? status.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** One status for a session that combines its booking lifecycle and live state. */
export function sessionStage(session: ScheduledSession, lss: LiveSessionState): { label: string; tone: Tone } {
  if (session.status === "cancelled") return { label: "Cancelled", tone: "danger" };
  if (lss.status === "Completed" || session.status === "completed") return { label: "Completed", tone: "ok" };
  if (lss.status === "Emergency") return { label: "Emergency", tone: "danger" };
  if (lss.status === "Live") return { label: "Running", tone: "brand" };
  if (lss.status === "Paused") return { label: "Paused", tone: "warn" };
  if (lss.status === "Opening") return { label: "Opened", tone: "info" };
  if (lss.status === "Ended") return { label: "Ended — finish pending", tone: "warn" };
  const labels: Record<string, [string, Tone]> = {
    draft: ["Draft", "neutral"],
    scheduled: ["Scheduled", "info"],
    published: ["Published", "info"],
    "booking-open": ["Booking open", "ok"],
    "almost-full": ["Almost full", "warn"],
    full: ["Full", "warn"],
    "booking-closed": ["Booking closed", "neutral"],
    "reveal-pending": ["Reveal pending", "warn"],
    revealed: ["Revealed", "brand"],
    "check-in-open": ["Check-in open", "ok"],
    live: ["Ready to start", "info"],
    archived: ["Archived", "neutral"],
  };
  const [label, tone] = labels[session.status] ?? [session.status, "neutral"];
  return { label, tone };
}

export function formatClock(totalSec: number) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Local time for ISO strings; seed labels like "Today, 18:45" pass through. */
export function formatWhen(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(d.getTime())) return value;
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function useOperatorName() {
  const { operators } = useStore();
  return (id?: string) => (id ? operators.find((o) => o.id === id)?.name ?? (id === "system" ? "System" : id) : "—");
}

/* ------------------------------------------------------------------ */
/* Workspace shell: guard, not-found, header, tabs                     */
/* ------------------------------------------------------------------ */

export type MissionTab =
  | "overview"
  | "bookings"
  | "waitlist"
  | "money"
  | "participants"
  | "teams"
  | "reveal"
  | "check-in"
  | "live"
  | "results"
  | "completion"
  | "summary";

interface TabDef {
  id: MissionTab;
  label: string;
  group: "Session" | "Sales" | "Prepare" | "Run the session";
}

export const MISSION_TABS: TabDef[] = [
  { id: "overview", label: "Overview", group: "Session" },
  { id: "bookings", label: "Bookings", group: "Sales" },
  { id: "waitlist", label: "Waitlist", group: "Sales" },
  { id: "money", label: "Money", group: "Sales" },
  { id: "participants", label: "Codes", group: "Prepare" },
  { id: "teams", label: "Teams", group: "Prepare" },
  { id: "reveal", label: "Reveal", group: "Prepare" },
  { id: "check-in", label: "Check-in", group: "Prepare" },
  { id: "live", label: "Run", group: "Run the session" },
  { id: "results", label: "Results", group: "Run the session" },
  { id: "completion", label: "Finish", group: "Run the session" },
  { id: "summary", label: "Report", group: "Run the session" },
];

export function useMissionId(): string {
  const params = useParams();
  return String(params?.id ?? "");
}

/** Friendly card for an unknown id in the URL. */
export function NotFoundCard({ title, line, backHref, backLabel }: { title: string; line: string; backHref: string; backLabel: string }) {
  return (
    <div className="mx-auto w-full max-w-[1440px] px-5 py-7 lg:px-8">
      <div className="mx-auto mt-10 max-w-md rounded-panel border border-edge bg-white p-8 text-center shadow-panel">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-ink-mut">
          <SearchX className="h-5 w-5" />
        </span>
        <p className="mt-4 font-display text-lg font-bold text-ink-lum">{title}</p>
        <p className="mt-1 text-sm text-ink-mut">{line}</p>
        <Link href={backHref} className="mt-5 inline-flex">
          <Button variant="secondary">
            <ArrowLeft className="h-4 w-4" /> {backLabel}
          </Button>
        </Link>
      </div>
    </div>
  );
}

function tabHints(state: PrototypeState, sessionId: string): Partial<Record<MissionTab, { text: string; tone: "warn" | "ok" | "danger" }>> {
  const lss = selectLiveSessionState(state, sessionId);
  const hints: Partial<Record<MissionTab, { text: string; tone: "warn" | "ok" | "danger" }>> = {};
  if (lss.status === "Emergency") hints.live = { text: "!", tone: "danger" };
  else if (lss.status === "Live" || lss.status === "Paused") hints.live = { text: "Live", tone: "ok" };
  const results = selectResultsProgress(state, sessionId);
  if (lss.status !== "Ready" && results.requiredCount - results.confirmedCount > 0) {
    hints.results = { text: String(results.requiredCount - results.confirmedCount), tone: "warn" };
  }
  if (lss.status === "Ended") {
    const blockers = selectCompletionChecklist(state, sessionId).criticalBlockers.length;
    if (blockers) hints.completion = { text: String(blockers), tone: "warn" };
  }
  return hints;
}

/**
 * The session workspace frame used by every /missions/[id]/* page:
 * access guard, not-found state, header with key numbers and the tab bar.
 */
export function MissionShell({
  tab,
  children,
  actions,
  sub,
}: {
  tab: MissionTab;
  children: ReactNode;
  /** Page-level actions shown in the header. */
  actions?: ReactNode;
  /** One line describing what this tab is for. */
  sub?: string;
}) {
  const sessionId = useMissionId();
  const { state, canAccess } = useStore();
  const session = state.sessions.find((s) => s.id === sessionId);

  const data = useMemo(() => {
    if (!session) return null;
    const lss = selectLiveSessionState(state, sessionId);
    const ledger = sessionCapacityLedger(state, sessionId);
    const checkIn = selectCheckInSummary(state, sessionId);
    const finance = selectSessionFinancialSummary(state, sessionId);
    return {
      lss,
      ledger,
      checkIn,
      finance,
      title: sessionTitle(state, sessionId),
      venue: venueName(state, session.venueId),
      area: state.playingAreas.find((p) => p.id === session.playingAreaId)?.name,
      stage: sessionStage(session, lss),
      hints: tabHints(state, sessionId),
    };
  }, [state, session, sessionId]);

  if (!canAccess("/missions")) return <PermissionDenied module="Sessions" />;
  if (!session || !data) {
    return <NotFoundCard title="Session not found" line={`There is no session with the id “${sessionId}”. It may have been removed or the link is wrong.`} backHref="/missions" backLabel="All sessions" />;
  }

  const current = MISSION_TABS.find((t) => t.id === tab)!;
  const joined = data.ledger.confirmedPaidBookings + data.ledger.confirmedComplimentaryBookings;

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 px-5 py-7 lg:px-8">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm text-ink-mut print:hidden">
        <Link href="/missions" className="font-medium hover:text-ink-lum">
          Sessions
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        <Link href={`/missions/${sessionId}/overview`} className="min-w-0 truncate font-medium hover:text-ink-lum">
          {data.title}
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        <span className="shrink-0 whitespace-nowrap text-ink-sec">{current.label}</span>
      </nav>

      <PageHeader
        overline={`Session ${sessionId} · ${current.label}`}
        title={data.title}
        sub={sub ?? `${session.date} at ${session.startTime} · ${data.venue}${data.area ? ` · ${data.area}` : ""}`}
        right={
          <>
            <StatusChip value={data.stage.label} tone={data.stage.tone} />
            {actions}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-edge bg-edge shadow-panel sm:grid-cols-4 print:hidden">
        <HeaderStat label="Booked" value={`${joined} / ${data.ledger.sellableCapacity}`} detail={`${data.ledger.remainingSellableCapacity} left`} />
        <HeaderStat label="Checked in" value={String(data.checkIn.presentCount)} detail={`of ${data.checkIn.expectedCount} expected`} />
        <HeaderStat label="Waitlist" value={String(data.ledger.waitlistCount)} detail={data.ledger.waitlistCount ? "waiting for a place" : "nobody waiting"} />
        <HeaderStat label="Net collected" value={inr(data.finance.netRevenue)} detail={data.finance.totalRefunded ? `${inr(data.finance.totalRefunded)} refunded` : "no refunds"} />
      </div>

      <nav aria-label="Session workspace" className="-mx-5 overflow-x-auto px-5 lg:mx-0 lg:px-0 print:hidden">
        <div className="flex min-w-max items-center gap-1 rounded-panel border border-edge bg-white p-1.5 shadow-lift">
          {MISSION_TABS.map((t, i) => {
            const active = t.id === tab;
            const hint = data.hints[t.id];
            const newGroup = i > 0 && MISSION_TABS[i - 1].group !== t.group;
            return (
              <div key={t.id} className="flex items-center">
                {newGroup && <span aria-hidden className="mx-1.5 h-5 w-px bg-edge" />}
                <Link
                  href={`/missions/${sessionId}/${t.id}`}
                  ref={active ? scrollActiveIntoView : undefined}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 text-sm font-semibold transition-colors",
                    active ? "bg-brand-subtle text-brand-ink" : "text-ink-mut hover:bg-slate-50 hover:text-ink-lum",
                  )}
                >
                  {t.label}
                  {hint && (
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-px text-[10px] font-bold leading-4",
                        hint.tone === "danger" ? "bg-red-100 text-red-700" : hint.tone === "ok" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800",
                      )}
                    >
                      {hint.text}
                    </span>
                  )}
                </Link>
              </div>
            );
          })}
        </div>
      </nav>

      {children}
    </div>
  );
}

/** Keep the current tab visible when the tab bar scrolls horizontally (phones). */
function scrollActiveIntoView(el: HTMLAnchorElement | null) {
  if (!el) return;
  const bar = el.closest("nav");
  if (bar && bar.scrollWidth > bar.clientWidth) bar.scrollLeft = el.offsetLeft - bar.clientWidth / 2 + el.clientWidth / 2;
}

function HeaderStat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="bg-white px-5 py-4">
      <p className="text-xs font-medium text-ink-mut">{label}</p>
      <p className="mt-1 font-display text-xl font-bold tabular text-ink-lum">{value}</p>
      <p className="mt-0.5 text-xs text-ink-mut">{detail}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Run → Results → Finish stepper                                      */
/* ------------------------------------------------------------------ */

export function MissionStageStepper({ current, layout = "row" }: { current?: "live" | "results" | "completion"; layout?: "row" | "column" }) {
  const sessionId = useMissionId();
  const { state } = useStore();
  const lss = selectLiveSessionState(state, sessionId);
  const results = selectResultsProgress(state, sessionId);
  const checklist = selectCompletionChecklist(state, sessionId);

  const started = lss.status !== "Ready" && lss.status !== "Opening";
  const ended = lss.status === "Ended" || lss.status === "Completed";
  const completed = lss.status === "Completed";

  const steps = [
    {
      id: "live" as const,
      n: 1,
      label: "Run the session",
      detail: completed || ended ? "Ended" : started ? getOperationalStatusLabel(lss.status) : "Not started",
      done: ended,
      locked: false,
    },
    {
      id: "results" as const,
      n: 2,
      label: "Record results",
      detail: !started ? "Opens when the session starts" : results.requiredCount === 0 ? "No scored steps yet" : `${results.confirmedCount} of ${results.requiredCount} confirmed`,
      done: started && results.isComplete && ended,
      locked: !started,
    },
    {
      id: "completion" as const,
      n: 3,
      label: "Finish and lock",
      detail: completed ? "Completed" : !ended ? "Opens when the session ends" : checklist.isReadyToComplete ? "Ready to finish" : `${checklist.criticalBlockers.length} item(s) to resolve`,
      done: completed,
      locked: !ended,
    },
  ];

  return (
    <ol className={cn("grid grid-cols-1 gap-2 print:hidden", layout === "row" && "sm:grid-cols-3")} aria-label="Session stages">
      {steps.map((s) => {
        const isCurrent = s.id === current;
        const body = (
          <div
            className={cn(
              "flex h-full items-center gap-3 rounded-2xl border px-4 py-3 transition-colors",
              isCurrent ? "border-brand/40 bg-brand-subtle" : "border-edge bg-white",
              !s.locked && !isCurrent && "hover:border-edge-strong hover:bg-slate-50",
            )}
          >
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                s.done ? "bg-emerald-500 text-white" : isCurrent ? "bg-brand text-white" : s.locked ? "bg-slate-100 text-ink-mut" : "bg-slate-100 text-ink-sec",
              )}
            >
              {s.done ? <Check className="h-4 w-4" /> : s.locked ? <Lock className="h-3.5 w-3.5" /> : s.n}
            </span>
            <span className="min-w-0">
              <span className={cn("block text-sm font-semibold", s.locked ? "text-ink-mut" : "text-ink-lum")}>{s.label}</span>
              <span className="block truncate text-xs text-ink-mut">{s.detail}</span>
            </span>
          </div>
        );
        return (
          <li key={s.id} aria-current={isCurrent ? "step" : undefined}>
            {s.locked || isCurrent ? body : <Link href={`/missions/${sessionId}/${s.id}`}>{body}</Link>}
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ */
/* Building blocks                                                     */
/* ------------------------------------------------------------------ */

export function WorkspaceCard({
  title,
  sub,
  right,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  sub?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("rounded-panel border border-edge bg-white shadow-panel", className)}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-edge px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-ink-lum">{title}</h2>
          {sub && <p className="mt-0.5 text-sm text-ink-mut">{sub}</p>}
        </div>
        {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
      </header>
      <div className={bodyClassName ?? "p-5"}>{children}</div>
    </section>
  );
}

/** Pass/fail line used by readiness checklists. */
export function CheckRow({ passed, warning, label, detail, action }: { passed: boolean; warning?: boolean; label: string; detail?: string; action?: ReactNode }) {
  return (
    <li className="flex flex-wrap items-start gap-3 py-3 first:pt-0 last:pb-0">
      <span
        className={cn(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
          passed ? "bg-emerald-100 text-emerald-700" : warning ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700",
        )}
        aria-label={passed ? "Passed" : warning ? "Warning" : "Blocked"}
      >
        {passed ? <Check className="h-3.5 w-3.5" /> : "!"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink-lum">{label}</p>
        {detail && <p className="mt-0.5 text-xs leading-5 text-ink-mut">{detail}</p>}
      </div>
      {action}
    </li>
  );
}

/**
 * Dialog that collects a required reason. `onConfirm` returns true when the
 * command succeeded; the dialog then closes. Errors are shown inline.
 */
export function ReasonDialog({
  open,
  onClose,
  title,
  description,
  label = "Reason",
  placeholder,
  confirmLabel,
  tone = "primary",
  minLength = 5,
  onConfirm,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  wide?: boolean;
  description?: ReactNode;
  label?: string;
  placeholder?: string;
  confirmLabel: string;
  tone?: "primary" | "danger" | "warning" | "success";
  minLength?: number;
  onConfirm: (reason: string) => { error?: string } | boolean | void;
  children?: ReactNode;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason("");
      setError(null);
    }
  }, [open]);

  const trimmed = reason.trim();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (trimmed.length < minLength) {
      setError(`Write at least ${minLength} characters.`);
      return;
    }
    const out = onConfirm(trimmed);
    if (out === false) return;
    if (out && typeof out === "object" && out.error) {
      setError(out.error);
      return;
    }
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} title={title} wide={wide}>
      <form onSubmit={submit} className="space-y-4">
        {description && <div className="text-sm leading-6 text-ink-sec">{description}</div>}
        {children}
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-ink-sec">{label}</span>
          <textarea
            autoFocus
            rows={3}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setError(null);
            }}
            placeholder={placeholder}
            className="field w-full rounded-xl px-3.5 py-2.5 text-sm text-ink-lum placeholder:text-slate-400"
          />
          <span className="mt-1 flex justify-between text-xs text-ink-mut">
            <span>Kept in the audit record.</span>
            <span className={cn(trimmed.length < minLength && "text-amber-700")}>
              {trimmed.length}/{minLength}+ characters
            </span>
          </span>
        </label>
        {error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant={tone} disabled={trimmed.length < minLength}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Confirmation for a consequential action without a reason. */
export function ConfirmDialog({
  open,
  onClose,
  title,
  children,
  confirmLabel,
  tone = "primary",
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger" | "warning" | "success";
  onConfirm: () => { error?: string } | boolean | void;
}) {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) setError(null);
  }, [open]);
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        <div className="text-sm leading-6 text-ink-sec">{children}</div>
        {error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={tone}
            onClick={() => {
              const out = onConfirm();
              if (out === false) return;
              if (out && typeof out === "object" && out.error) {
                setError(out.error);
                return;
              }
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/** Redirect helper for /missions/[id]. */
export function useRedirectTo(href: string) {
  const router = useRouter();
  useEffect(() => {
    router.replace(href);
  }, [router, href]);
}
