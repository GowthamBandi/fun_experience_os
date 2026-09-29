"use client";

import { useMemo } from "react";
import { Printer } from "lucide-react";
import { useStore } from "@/lib/store";
import { selectSessionSummary, formatDuration } from "@/lib/prototype/selectors/completion";
import { sessionTitle, venueName } from "@/lib/prototype/selectors/lookups";
import type { SegmentResult } from "@/lib/prototype/entities";
import { inr } from "@/lib/format";
import { Button } from "@/components/ui/primitives";
import { MissionShell, formatWhen, useMissionId, useOperatorName } from "@/components/missions/shared";

/** Hide the console chrome and let the report flow across pages when printed. */
const PRINT_CSS = `
@media print {
  @page { margin: 14mm; }
  html, body { height: auto !important; overflow: visible !important; }
  .dusk-field { display: block !important; height: auto !important; overflow: visible !important; }
  #main { overflow: visible !important; }
  body * { visibility: hidden; }
  #session-report, #session-report * { visibility: visible; }
  #session-report { position: absolute; inset: 0 auto auto 0; width: 100%; box-shadow: none !important; border: 0 !important; }
}
`;

export default function SummaryPage() {
  return (
    <MissionShell
      tab="summary"
      sub="The session report: attendance, results, money, staff, equipment and safety."
      actions={
        <Button variant="secondary" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Print or save as PDF
        </Button>
      }
    >
      <ReportBody />
    </MissionShell>
  );
}

function ReportBody() {
  const sessionId = useMissionId();
  const { state } = useStore();
  const opName = useOperatorName();
  const s = useMemo(() => selectSessionSummary(state, sessionId), [state, sessionId]);
  const session = s.session!;
  const snap = s.snapshot;
  const teams = (state.teams ?? []).filter((t) => t.sessionId === sessionId);
  const segments = (state.activitySegments ?? []).filter((x) => x.sessionId === sessionId).sort((a, b) => a.sequence - b.sequence);
  const notes = (state.liveOperationalNotes ?? []).filter((n) => n.sessionId === sessionId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const teamName = (id?: string) => teams.find((t) => t.id === id)?.name ?? "—";

  // A completed session reports its saved snapshot; otherwise the report is interim and live.
  const attendance = snap?.attendanceTotals ?? {
    expected: s.checkIn.expectedCount,
    checkedIn: s.checkIn.checkedInCount,
    late: s.checkIn.lateCount,
    missing: s.checkIn.missingCount,
    noShow: s.checkIn.noShowCount,
    denied: s.checkIn.deniedCount,
    fillRate: s.checkIn.checkInRate,
  };
  const money = snap?.financialSummary ?? { grossRevenue: s.money.grossCollected, refundsTotal: s.money.totalRefunded, netTake: s.money.netRevenue };
  const results: SegmentResult[] = snap?.finalResults ?? s.results;
  const duration = snap?.durationSeconds ?? s.durationSeconds;
  const exceptions = snap?.equipmentExceptions ?? s.eq.items.filter((e) => e.missingCount > 0 || e.damagedCount > 0);
  const followUps = snap?.followUpItems ?? notes.filter((n) => n.followUpRequired).map((n) => n.note);
  const safety = notes.filter((n) => n.type === "safety" || n.severity === "critical");

  const describe = (r: SegmentResult) =>
    r.resultType === "score" || r.resultType === "draw"
      ? `${(r.teamScores ?? []).map((t) => `${teamName(t.teamId)} ${t.score}`).join(" – ")}${r.resultType === "draw" ? " (draw)" : r.winnerTeamId ? ` · winner ${teamName(r.winnerTeamId)}` : ""}`
      : `${r.resultType}: ${r.outcome ?? "—"}`;

  return (
    <article id="session-report" className="rounded-panel border border-edge bg-white shadow-panel">
      <style>{PRINT_CSS}</style>
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-edge px-6 py-5">
        <div>
          <p className="eyebrow text-brand">Session report</p>
          <h2 className="mt-1 font-display text-2xl font-bold text-ink-lum">{sessionTitle(state, sessionId)}</h2>
          <p className="mt-1 text-sm text-ink-sec">
            {session.date} at {session.startTime} · {venueName(state, session.venueId)} · session {sessionId}
          </p>
        </div>
        <div className="text-right text-sm">
          {snap ? (
            <>
              <p className="font-semibold text-emerald-700">Final</p>
              <p className="text-ink-mut">
                Completed by {opName(snap.completedBy)}
                <br />
                {formatWhen(snap.completedAt)}
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold text-amber-700">Interim — session not completed</p>
              <p className="text-ink-mut">Figures are live and may change.</p>
            </>
          )}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-px bg-edge sm:grid-cols-4">
        <Figure label="Present" value={`${attendance.checkedIn + attendance.late} / ${attendance.expected}`} detail={`${attendance.fillRate}% attendance`} />
        <Figure label="Active time" value={formatDuration(duration)} detail={`${session.duration} min planned`} />
        <Figure label="Results recorded" value={String(results.length)} detail={`${segments.length} planned steps`} />
        <Figure label="Net collected" value={inr(money.netTake)} detail={`${inr(money.refundsTotal)} refunded`} />
      </div>

      <div className="grid grid-cols-1 gap-x-8 gap-y-6 px-6 py-6 md:grid-cols-2">
        <Section title="Attendance">
          <Rows
            rows={[
              ["Expected", attendance.expected],
              ["Checked in on time", attendance.checkedIn],
              ["Arrived late", attendance.late],
              ["No-show", attendance.noShow],
              ["Denied entry", attendance.denied],
              ["Not marked", attendance.missing],
            ]}
          />
        </Section>

        <Section title="Money">
          <Rows
            rows={[
              ["Gross collected", inr(money.grossRevenue)],
              ["Refunded", inr(money.refundsTotal)],
              ["Net collected", inr(money.netTake)],
              ["Break-even target", inr(s.money.breakEvenRevenue)],
            ]}
          />
        </Section>

        <Section title="Results" className="md:col-span-2">
          {results.length === 0 ? (
            <p className="text-sm text-ink-mut">No results recorded.</p>
          ) : (
            <ul className="divide-y divide-edge text-sm">
              {results.map((r) => {
                const seg = segments.find((x) => x.id === r.segmentId);
                return (
                  <li key={r.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <span className="font-medium text-ink-lum">{seg ? `${seg.sequence}. ${seg.name}` : r.segmentId}</span>
                    <span className="text-ink-sec">
                      {describe(r)} <span className="text-xs text-ink-mut">({r.status.toLowerCase()}{r.correctionReason ? `: ${r.correctionReason}` : ""})</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <Section title="Staff">
          <Rows
            rows={[
              ["Lead coordinator", snap?.staffSummary.leadCoordinator ?? s.staff.leadCoordinator?.name ?? "Not assigned"],
              ["Safety contact", snap?.staffSummary.safetyContact ?? s.staff.safetyContact?.name ?? "Not assigned"],
              ["Checked in", `${snap?.staffSummary.staffCheckedIn ?? s.staff.presentCount} of 2`],
            ]}
          />
        </Section>

        <Section title="Equipment exceptions">
          {exceptions.length === 0 ? (
            <p className="text-sm text-ink-mut">All equipment returned.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {exceptions.map((e) => (
                <li key={e.id} className="text-ink-lum">
                  {e.equipmentName}: {e.missingCount} missing, {e.damagedCount} damaged{e.note ? ` — ${e.note}` : ""}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Safety" className="md:col-span-2">
          {safety.length === 0 ? (
            <p className="text-sm text-ink-mut">No safety events recorded.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {safety.map((n) => (
                <li key={n.id} className="text-ink-lum">
                  <span className="text-ink-mut">{n.time}</span> — {n.note}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Follow-ups">
          {followUps.length === 0 ? (
            <p className="text-sm text-ink-mut">None.</p>
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-sm text-ink-lum">
              {followUps.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Closing">
          <p className="text-sm text-ink-lum">{snap?.closingNote ?? (snap ? "No closing note." : "Not completed yet.")}</p>
          {snap?.overrideReason && <p className="mt-2 text-sm text-amber-800">Completed with override: {snap.overrideReason}</p>}
        </Section>
      </div>
    </article>
  );
}

function Figure({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="bg-white px-6 py-4">
      <p className="text-xs text-ink-mut">{label}</p>
      <p className="mt-1 font-display text-xl font-bold tabular text-ink-lum">{value}</p>
      <p className="text-xs text-ink-mut">{detail}</p>
    </div>
  );
}

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={className} style={{ breakInside: "avoid" }}>
      <h3 className="mb-2 border-b border-edge pb-1.5 text-sm font-semibold text-ink-lum">{title}</h3>
      {children}
    </section>
  );
}

function Rows({ rows }: { rows: Array<[string, string | number]> }) {
  return (
    <dl className="divide-y divide-edge text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 py-1.5">
          <dt className="text-ink-sec">{k}</dt>
          <dd className="font-medium tabular text-ink-lum">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
