"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock, DoorOpen, Search, UserCheck, UserX, Users, XCircle } from "lucide-react";
import { useStore } from "@/lib/store";
import { selectCheckInSummary, selectSessionOpenReadiness, selectStaffReadiness } from "@/lib/prototype/selectors/checkIn";
import { selectSessionParticipantPool, type ParticipantPoolItem } from "@/lib/prototype/selectors/identity";
import type { CheckInStatus } from "@/lib/prototype/entities";
import { cn } from "@/lib/format";
import { Button, StatusChip } from "@/components/ui/primitives";
import { MetricTile } from "@/components/ui/panels";
import { useToast } from "@/components/ui/toast";
import { CheckRow, ConfirmDialog, MissionShell, ReasonDialog, WorkspaceCard, useMissionId } from "@/components/missions/shared";

export default function CheckInPage() {
  return (
    <MissionShell tab="check-in" sub="Record arrivals at the door. Type the participant's code and press Enter.">
      <CheckInBody />
    </MissionShell>
  );
}

type Lookup = { kind: "ok" | "info" | "error"; title: string; line?: string; item?: ParticipantPoolItem };

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "");

function CheckInBody() {
  const sessionId = useMissionId();
  const { state, createCheckInRecords, updateCheckInStatus, checkInStaff } = useStore();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const session = state.sessions.find((s) => s.id === sessionId)!;
  const pool = useMemo(() => selectSessionParticipantPool(state, sessionId), [state, sessionId]);
  const eligible = pool.filter((p) => p.isEligible);
  const summary = useMemo(() => selectCheckInSummary(state, sessionId), [state, sessionId]);
  const staff = useMemo(() => selectStaffReadiness(state, sessionId), [state, sessionId]);
  const handover = useMemo(() => selectSessionOpenReadiness(state, sessionId), [state, sessionId]);

  const isOpen = ["check-in-open", "live"].includes(session.status);
  const canOpen = session.status === "revealed";
  const closed = session.status === "completed" || session.status === "cancelled";

  const [code, setCode] = useState("");
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "waiting" | "present" | "absent">("all");
  const [denying, setDenying] = useState<ParticipantPoolItem | null>(null);
  const [correcting, setCorrecting] = useState<{ item: ParticipantPoolItem; target: CheckInStatus } | null>(null);
  const [confirmNoShows, setConfirmNoShows] = useState(false);

  const find = (raw: string) => {
    const q = norm(raw);
    if (!q) return undefined;
    return pool.find(
      (p) => norm(p.temporaryIdentity?.temporaryCode ?? "") === q || norm(p.booking.bookingCode ?? "") === q || norm(p.booking.id) === q,
    );
  };

  const setStatus = (item: ParticipantPoolItem, target: CheckInStatus, extra?: { denialReason?: string; auditOverrideReason?: string }) =>
    updateCheckInStatus({ sessionId, bookingId: item.booking.id, targetStatus: target, method: "temp-id-search", ...extra });

  const submitCode = (e: React.FormEvent) => {
    e.preventDefault();
    const item = find(code);
    if (!code.trim()) return;
    if (!item) {
      setLookup({ kind: "error", title: `No participant with “${code.trim()}”`, line: "Check the code on the participant's phone, or search the list below." });
    } else if (!item.isEligible) {
      setLookup({ kind: "error", title: `${item.booking.alias} cannot be admitted`, line: `${item.blockedReason}. Send them to the help desk.`, item });
    } else if (item.checkInStatus === "checked-in" || item.checkInStatus === "late") {
      setLookup({ kind: "info", title: `${item.booking.alias} is already in`, line: `Marked ${item.checkInStatus.replace("-", " ")}${item.teamName ? ` · ${item.teamName}` : ""}.`, item });
    } else if (item.checkInStatus === "no-show" || item.checkInStatus === "denied") {
      setLookup({ kind: "error", title: `${item.booking.alias} was marked ${item.checkInStatus.replace("-", " ")}`, line: "Admitting them needs a correction reason.", item });
      setCorrecting({ item, target: "checked-in" });
    } else {
      const res = setStatus(item, "checked-in");
      if (res.error) setLookup({ kind: "error", title: "Not checked in", line: res.error, item });
      else setLookup({ kind: "ok", title: `${item.booking.alias} checked in`, line: item.teamName ? `Team: ${item.teamName}` : "No team assigned", item });
    }
    setCode("");
    inputRef.current?.focus();
  };

  const rowAction = (item: ParticipantPoolItem, target: CheckInStatus) => {
    if (target === "denied") return setDenying(item);
    if ((item.checkInStatus === "no-show" || item.checkInStatus === "denied") && (target === "checked-in" || target === "late")) {
      return setCorrecting({ item, target });
    }
    const res = setStatus(item, target);
    if (res.error) toast.error("Attendance not updated", res.error);
    else toast.success(`${item.booking.alias}: ${target.replace("-", " ")}`);
  };

  const rows = useMemo(() => {
    const q = norm(query);
    return pool.filter((p) => {
      if (q && !norm(`${p.booking.alias}${p.temporaryIdentity?.temporaryCode ?? ""}${p.teamName ?? ""}`).includes(q)) return false;
      if (filter === "waiting") return p.isEligible && p.checkInStatus === "expected";
      if (filter === "present") return p.checkInStatus === "checked-in" || p.checkInStatus === "late";
      if (filter === "absent") return p.checkInStatus === "no-show" || p.checkInStatus === "denied";
      return true;
    });
  }, [pool, query, filter]);

  const waiting = eligible.filter((p) => p.checkInStatus === "expected");

  return (
    <div className="space-y-6">
      {!isOpen && (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-panel border border-amber-200 bg-amber-50/60 p-5 shadow-panel">
          <div>
            <p className="font-display text-lg font-bold text-ink-lum">{closed ? "Check-in is closed" : canOpen ? "Door check-in is not open yet" : "Check-in opens after the reveal"}</p>
            <p className="mt-1 text-sm text-ink-sec">
              {closed ? "This session is finished; attendance is read-only." : canOpen ? `Opening adds all ${eligible.length} confirmed participants to the door list.` : "Send the reveal first so participants know their team and code."}
            </p>
          </div>
          {canOpen ? (
            <Button
              onClick={() => {
                const res = createCheckInRecords(sessionId);
                if (res.error) toast.error("Check-in not opened", res.error);
                else toast.success("Door check-in open", `${eligible.length} participants expected.`);
              }}
            >
              <DoorOpen className="h-4 w-4" /> Open door check-in
            </Button>
          ) : (
            !closed && (
              <Link href={`/missions/${sessionId}/reveal`}>
                <Button variant="secondary">
                  Go to Reveal <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            )
          )}
        </section>
      )}

      {isOpen && (
        <section className="rounded-panel border border-edge bg-white p-5 shadow-panel sm:p-7">
          <form onSubmit={submitCode} className="flex flex-col gap-3 sm:flex-row">
            <label htmlFor="door-code" className="sr-only">
              Participant code
            </label>
            <input
              id="door-code"
              ref={inputRef}
              autoFocus
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Type code, e.g. CR-04"
              className="field h-16 w-full rounded-2xl px-5 font-mono text-2xl font-semibold uppercase tracking-wider text-ink-lum placeholder:font-sans placeholder:text-lg placeholder:font-normal placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-400 sm:text-3xl"
            />
            <Button type="submit" size="lg" className="h-16 px-8 text-base">
              <UserCheck className="h-5 w-5" /> Check in
            </Button>
          </form>
          <p className="mt-2 text-xs text-ink-mut">Camera scanning is not connected — type the code shown on the participant&apos;s phone. Booking references also work.</p>

          {lookup && (
            <div
              role="status"
              aria-live="polite"
              className={cn(
                "mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5",
                lookup.kind === "ok" ? "border-emerald-200 bg-emerald-50" : lookup.kind === "info" ? "border-sky-200 bg-sky-50" : "border-red-200 bg-red-50",
              )}
            >
              <div className="flex items-center gap-4">
                {lookup.kind === "ok" ? <CheckCircle2 className="h-10 w-10 text-emerald-600" /> : lookup.kind === "info" ? <Clock className="h-10 w-10 text-sky-600" /> : <XCircle className="h-10 w-10 text-red-600" />}
                <div>
                  {lookup.item?.temporaryIdentity && <p className="font-mono text-sm font-semibold text-ink-sec">{lookup.item.temporaryIdentity.temporaryCode}</p>}
                  <p className="font-display text-2xl font-bold text-ink-lum">{lookup.title}</p>
                  {lookup.line && <p className="text-sm text-ink-sec">{lookup.line}</p>}
                </div>
              </div>
              {lookup.kind === "ok" && lookup.item && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const res = updateCheckInStatus({ sessionId, bookingId: lookup.item!.booking.id, targetStatus: "late", method: "temp-id-search" });
                    if (res.error) toast.error("Not updated", res.error);
                    else setLookup({ ...lookup, title: `${lookup.item!.booking.alias} checked in late` });
                  }}
                >
                  Mark as late instead
                </Button>
              )}
            </div>
          )}
        </section>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <MetricTile label="Expected" value={summary.expectedCount} detail="confirmed places" icon={<Users className="h-4 w-4" />} tone="violet" />
        <MetricTile label="Present" value={summary.presentCount} detail={`${summary.lateCount} arrived late`} icon={<UserCheck className="h-4 w-4" />} tone="emerald" />
        <MetricTile label="Not arrived" value={summary.awaitingCount} detail={isOpen ? "still to be marked" : "check-in not open"} icon={<Clock className="h-4 w-4" />} tone="amber" />
        <MetricTile label="No-show or denied" value={summary.noShowCount + summary.deniedCount} detail={`${summary.deniedCount} denied entry`} icon={<UserX className="h-4 w-4" />} tone="rose" />
      </div>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <WorkspaceCard title="Staff on site" sub="The lead coordinator and safety contact check in here too.">
          <ul className="divide-y divide-edge">
            {[
              { role: "Lead coordinator", p: staff.leadCoordinator, present: staff.isLeadPresent },
              { role: "Safety contact", p: staff.safetyContact, present: staff.isSafetyPresent },
            ].map(({ role, p, present }) => (
              <li key={role} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-ink-mut">{role}</p>
                  <p className="text-sm font-semibold text-ink-lum">{p?.name ?? "Not assigned"}</p>
                  {p && !p.crewId && <p className="text-xs text-amber-700">No staff record — assign a crew member in Staffing to check them in.</p>}
                </div>
                {p ? (
                  present ? (
                    <StatusChip value="checked-in" />
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!p.crewId || closed}
                      onClick={() => {
                        const res = checkInStaff(sessionId, p.ref);
                        if (res.error) toast.error("Staff not checked in", res.error);
                        else toast.success(`${p.name} checked in`);
                      }}
                    >
                      <UserCheck className="h-3.5 w-3.5" /> Check in
                    </Button>
                  )
                ) : (
                  <Link href="/staffing" className="text-sm font-semibold text-brand hover:text-brand-hover">
                    Assign in Staffing
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </WorkspaceCard>

        <WorkspaceCard
          title="Ready to start?"
          sub={handover.recommendedAction}
          right={
            <Link href={`/missions/${sessionId}/live`}>
              <Button size="sm" variant={handover.status === "Ready" ? "primary" : "secondary"}>
                Go to Run <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          }
        >
          <ul className="divide-y divide-edge">
            {handover.checks.map((c) => (
              <CheckRow key={c.key} passed={c.passed} warning={!c.blocking} label={c.label} detail={c.detail} />
            ))}
          </ul>
        </WorkspaceCard>
      </div>

      <WorkspaceCard
        title="Door list"
        sub={`${pool.length} bookings · ${waiting.length} confirmed participants not yet marked`}
        right={
          <>
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mut" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or code" aria-label="Search door list" className="field h-9 w-52 rounded-xl pl-9 pr-3 text-sm" />
            </label>
            <div className="inline-flex rounded-xl border border-edge bg-bg-sunken p-1">
              {(["all", "waiting", "present", "absent"] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f} className={cn("rounded-lg px-2.5 py-1 text-xs font-semibold capitalize", filter === f ? "bg-white text-brand-ink shadow-lift ring-1 ring-edge" : "text-ink-mut hover:text-ink-lum")}>
                  {f}
                </button>
              ))}
            </div>
            {isOpen && waiting.length > 0 && (
              <Button size="sm" variant="secondary" onClick={() => setConfirmNoShows(true)}>
                Mark {waiting.length} as no-show
              </Button>
            )}
          </>
        }
        bodyClassName="p-0"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-edge bg-bg-sunken/80 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-mut">
                <th className="px-5 py-2.5">Code</th>
                <th className="px-5 py-2.5">Participant</th>
                <th className="px-5 py-2.5">Team</th>
                <th className="px-5 py-2.5">Door</th>
                <th className="px-5 py-2.5 text-right">Mark</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.booking.id} className="border-b border-slate-100 last:border-0">
                  <td className="whitespace-nowrap px-5 py-2.5 font-mono font-semibold text-ink-lum">{p.temporaryIdentity?.temporaryCode ?? "—"}</td>
                  <td className="px-5 py-2.5">
                    <p className="font-medium text-ink-lum">{p.booking.alias}</p>
                    {!p.isEligible && <p className="text-xs text-ink-mut">{p.blockedReason}</p>}
                  </td>
                  <td className="px-5 py-2.5 text-ink-sec">{p.teamName ?? "—"}</td>
                  <td className="px-5 py-2.5">
                    <StatusChip value={p.checkInStatus} />
                  </td>
                  <td className="px-5 py-2.5">
                    {p.isEligible && !closed && (
                      <div className="flex justify-end gap-1">
                        {(["checked-in", "late", "no-show", "denied"] as const).map((t) => {
                          const current = t === p.checkInStatus;
                          return (
                            <Button
                              key={t}
                              size="sm"
                              variant={current ? "lamp" : t === "checked-in" ? "success" : t === "denied" ? "ghost" : "secondary"}
                              disabled={current}
                              aria-label={`${t.replace("-", " ")}: ${p.booking.alias}`}
                              onClick={() => rowAction(p, t)}
                            >
                              {t === "checked-in" ? "In" : t === "late" ? "Late" : t === "no-show" ? "No-show" : "Deny"}
                            </Button>
                          );
                        })}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm text-ink-mut">
                    {pool.length === 0 ? "No bookings on this session yet." : "Nobody matches this search."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </WorkspaceCard>

      <ReasonDialog
        open={!!denying}
        onClose={() => setDenying(null)}
        title={`Deny entry to ${denying?.booking.alias ?? ""}`}
        tone="danger"
        description="They will not be admitted. Refunds, if any, are handled from Bookings."
        placeholder="e.g. Not wearing the required non-marking shoes."
        confirmLabel="Deny entry"
        onConfirm={(reason) => {
          const res = setStatus(denying!, "denied", { denialReason: reason });
          if (res.error) return res;
          toast.success(`${denying!.booking.alias} denied entry`);
          return true;
        }}
      />

      <ReasonDialog
        open={!!correcting}
        onClose={() => setCorrecting(null)}
        title={`Admit ${correcting?.item.booking.alias ?? ""}`}
        tone="warning"
        description={`They were marked ${correcting?.item.checkInStatus.replace("-", " ")}. Say why they are being admitted now.`}
        placeholder="e.g. Arrived after roll call; lead coordinator approved."
        confirmLabel={correcting?.target === "late" ? "Admit as late" : "Admit"}
        onConfirm={(reason) => {
          const res = setStatus(correcting!.item, correcting!.target, { auditOverrideReason: reason });
          if (res.error) return res;
          toast.success(`${correcting!.item.booking.alias} admitted`, "The correction is in the audit record.");
          setLookup(null);
          return true;
        }}
      />

      <ConfirmDialog
        open={confirmNoShows}
        onClose={() => setConfirmNoShows(false)}
        title={`Mark ${waiting.length} participant(s) as no-show?`}
        confirmLabel="Mark as no-show"
        tone="warning"
        onConfirm={() => {
          let failed = 0;
          for (const p of waiting) if (setStatus(p, "no-show").error) failed++;
          if (failed) toast.warning("Some were not updated", `${failed} participant(s) could not be marked.`);
          else toast.success("No-shows recorded", `${waiting.length} participant(s) marked.`);
          return true;
        }}
      >
        Everyone not yet marked will be recorded as a no-show. Anyone who turns up later can still be admitted with a correction reason.
      </ConfirmDialog>
    </div>
  );
}
