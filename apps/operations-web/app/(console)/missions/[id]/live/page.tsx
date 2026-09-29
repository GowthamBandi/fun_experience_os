"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Flag, Pause, Play, Plus, ShieldAlert, SkipForward, Square, Wrench } from "lucide-react";
import { useStore } from "@/lib/store";
import {
  selectElapsedActiveSeconds,
  selectEquipmentReadiness,
  selectLiveSessionActionAvailability,
  selectLiveSessionState,
  selectSegmentProgress,
} from "@/lib/prototype/selectors/liveSession";
import { selectCheckInSummary, selectSessionOpenReadiness } from "@/lib/prototype/selectors/checkIn";
import { validateEmergencyRolePermission } from "@/lib/prototype/validators/liveSessionValidation";
import type { ActivitySegment, EquipmentCheckItem, LiveNoteSeverity, LiveNoteType } from "@/lib/prototype/entities";
import { cn } from "@/lib/format";
import { Button, FillMeter, StatusChip } from "@/components/ui/primitives";
import { Field, Input, Select } from "@/components/ui/fields";
import { Dialog } from "@/components/ui/overlays";
import { useToast } from "@/components/ui/toast";
import {
  CheckRow,
  ConfirmDialog,
  MissionShell,
  MissionStageStepper,
  ReasonDialog,
  WorkspaceCard,
  formatClock,
  formatWhen,
  getOperationalStatusLabel,
  useMissionId,
  useOperatorName,
} from "@/components/missions/shared";

export default function LivePage() {
  return (
    <MissionShell tab="live" sub="Run the session: the clock, the running order, equipment and notes.">
      <LiveBody />
    </MissionShell>
  );
}

const SEGMENT_TYPES: ActivitySegment["type"][] = ["Match", "Round", "Activity", "Briefing", "Warm-up", "Break", "Cooldown", "Wrap-up"];
const NOTE_TYPES: LiveNoteType[] = ["general", "safety", "equipment", "venue", "participant", "staff", "timing", "rule", "other"];

function LiveBody() {
  const sessionId = useMissionId();
  const store = useStore();
  const { state, operator, role } = store;
  const toast = useToast();

  const lss = selectLiveSessionState(state, sessionId);
  const actions = useMemo(() => selectLiveSessionActionAvailability(state, sessionId), [state, sessionId]);
  const handover = useMemo(() => selectSessionOpenReadiness(state, sessionId), [state, sessionId]);
  const checkIn = useMemo(() => selectCheckInSummary(state, sessionId), [state, sessionId]);
  const eq = useMemo(() => selectEquipmentReadiness(state, sessionId), [state, sessionId]);
  const progress = useMemo(() => selectSegmentProgress(state, sessionId), [state, sessionId]);
  const segments = useMemo(() => (state.activitySegments ?? []).filter((s) => s.sessionId === sessionId).sort((a, b) => a.sequence - b.sequence), [state.activitySegments, sessionId]);
  const emergencyAllowed = validateEmergencyRolePermission(state, sessionId, operator?.id ?? "", role.id).isValid;

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (lss.status !== "Live") return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [lss.status]);
  const elapsed = selectElapsedActiveSeconds(state, sessionId, now);

  const [dialog, setDialog] = useState<null | "start" | "override" | "pause" | "end" | "emergency" | "exit">(null);
  const close = () => setDialog(null);

  const report = (res: { error?: string }, success: string, detail?: string) => {
    if (res.error) return res;
    toast.success(success, detail);
    return true as const;
  };

  const tone = lss.status === "Emergency" ? "danger" : lss.status === "Live" ? "ok" : lss.status === "Paused" ? "warn" : "neutral";
  const explanation: Record<string, string> = {
    Ready: handover.status === "Ready" ? "All handover checks pass. Start when the group is ready." : "Some handover checks are not met. You can start with an override reason.",
    Opening: "The session is open. Start the clock when play begins.",
    Live: "The clock is running.",
    Paused: `Paused${lss.pauseReason ? `: ${lss.pauseReason}` : ""}.`,
    Emergency: `Emergency: ${lss.emergencyReason ?? ""}${lss.emergencyAction ? ` — ${lss.emergencyAction}` : ""}.`,
    Ended: "The session has ended. Confirm results next.",
    Completed: "This session is completed and read-only.",
  };

  return (
    <div className="space-y-6">
      <MissionStageStepper current="live" />

      {lss.status === "Emergency" && (
        <section role="alert" className="flex flex-wrap items-center justify-between gap-4 rounded-panel border border-red-200 bg-red-50 p-5 shadow-panel">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0 text-red-600" />
            <div>
              <p className="font-display text-lg font-bold text-red-800">Emergency in progress</p>
              <p className="text-sm text-red-800/90">{lss.emergencyReason}</p>
              <p className="text-sm text-red-800/80">Action taken: {lss.emergencyAction}</p>
            </div>
          </div>
          <Button variant="danger" disabled={!emergencyAllowed} onClick={() => setDialog("exit")}>
            Close emergency
          </Button>
        </section>
      )}

      <section className="grid grid-cols-1 gap-5 rounded-panel border border-edge bg-white p-5 shadow-panel lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center">
        <div className="text-center lg:text-left">
          <p className="text-xs font-medium text-ink-mut">Active time</p>
          <p className={cn("font-display text-5xl font-bold tabular tracking-tight", lss.status === "Live" ? "text-ink-lum" : "text-ink-sec")} aria-live="off">
            {formatClock(elapsed)}
          </p>
          <p className="mt-1 text-xs text-ink-mut">Planned {state.sessions.find((s) => s.id === sessionId)?.duration ?? 0} min</p>
        </div>
        <div className="min-w-0 border-edge lg:border-l lg:pl-5">
          <StatusChip value={getOperationalStatusLabel(lss.status)} tone={tone} />
          <p className="mt-2 text-sm text-ink-sec">{explanation[lss.status] ?? ""}</p>
          <p className="mt-1 text-xs text-ink-mut">
            {checkIn.presentCount} present · {progress.completed}/{progress.total} steps done · {eq.criticalMissingCount ? `${eq.criticalMissingCount} critical item(s) missing` : "equipment OK"}
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2 lg:justify-end">
          {lss.status === "Ready" && !actions.isReadOnly && (
            <Button size="lg" disabled={!actions.canOpen} onClick={() => setDialog(handover.status === "Blocked" ? "override" : "start")}>
              <Play className="h-4 w-4" /> Start session
            </Button>
          )}
          {lss.status === "Opening" && (
            <Button size="lg" onClick={() => {
              const res = store.startLiveSession(sessionId);
              if (res.error) toast.error("Clock not started", res.error);
              else toast.success("Clock started");
            }}>
              <Play className="h-4 w-4" /> Start clock
            </Button>
          )}
          {actions.canPause && (
            <Button size="lg" variant="warning" onClick={() => setDialog("pause")}>
              <Pause className="h-4 w-4" /> Pause
            </Button>
          )}
          {actions.canResume && (
            <Button size="lg" variant="success" onClick={() => {
              const res = store.resumeLiveSession(sessionId);
              if (res.error) toast.error("Not resumed", res.error);
              else toast.success("Clock resumed");
            }}>
              <Play className="h-4 w-4" /> Resume
            </Button>
          )}
          {actions.canEndSession && (
            <Button size="lg" variant="secondary" onClick={() => setDialog("end")}>
              <Square className="h-4 w-4" /> End session
            </Button>
          )}
          {actions.canEmergency && (
            <Button size="lg" variant="danger" disabled={!emergencyAllowed} onClick={() => setDialog("emergency")} title={emergencyAllowed ? undefined : "Only owners, super admins, safety, operations managers and this session's lead coordinator"}>
              <ShieldAlert className="h-4 w-4" /> Emergency
            </Button>
          )}
          {actions.isEnded && (
            <Link href={`/missions/${sessionId}/${lss.status === "Completed" ? "summary" : "results"}`}>
              <Button size="lg">
                {lss.status === "Completed" ? "Open report" : "Record results"} <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          )}
        </div>
        {actions.canEmergency && !emergencyAllowed && (
          <p className="text-xs text-ink-mut lg:col-span-3">Emergency controls are limited to platform owners, super admins, safety officers, operations managers and this session&apos;s lead coordinator.</p>
        )}
      </section>

      {lss.status === "Ready" && (
        <WorkspaceCard title="Handover checks" sub={handover.recommendedAction} right={<StatusChip value={handover.status} tone={handover.status === "Ready" ? "ok" : handover.status === "At Risk" ? "warn" : "danger"} />}>
          <ul className="divide-y divide-edge">
            {handover.checks.map((c) => (
              <CheckRow key={c.key} passed={c.passed} warning={!c.blocking} label={c.label} detail={c.detail} />
            ))}
            <CheckRow passed={eq.isReady} label="Critical equipment available" detail={eq.isReady ? "Nothing critical is missing." : `Missing: ${eq.criticalMissingNames.join(", ")} — cannot be overridden.`} />
          </ul>
        </WorkspaceCard>
      )}

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <RunOfShow segments={segments} readOnly={actions.isReadOnly || actions.isEnded} running={lss.status === "Live"} progress={progress.percent} />
        <div className="space-y-6">
          <EquipmentCard items={eq.items} readOnly={actions.isReadOnly} />
          <NotesCard readOnly={actions.isReadOnly} segments={segments} />
        </div>
      </div>

      <ConfirmDialog
        open={dialog === "start"}
        onClose={close}
        title="Start the session?"
        confirmLabel="Start session"
        onConfirm={() => report(store.startLiveSession(sessionId), "Session started", "The clock is running.")}
      >
        The session opens for live operations and the clock starts. {checkIn.presentCount} of {checkIn.expectedCount} participants are present.
      </ConfirmDialog>

      <ReasonDialog
        open={dialog === "override"}
        onClose={close}
        title="Start with override"
        tone="warning"
        description={
          <div>
            <p>These handover checks are not met:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-mut">
              {handover.checks.filter((c) => !c.passed).map((c) => (
                <li key={c.key}>
                  {c.label} — {c.detail}
                </li>
              ))}
            </ul>
          </div>
        }
        placeholder="e.g. Six players present; group agreed to play a shorter format."
        confirmLabel="Start anyway"
        onConfirm={(reason) => report(store.startLiveSession(sessionId, reason), "Session started with override", "The reason is in the audit record.")}
      />

      <ReasonDialog
        open={dialog === "pause"}
        onClose={close}
        title="Pause the session"
        tone="warning"
        description="The clock stops and the current step is paused."
        placeholder="e.g. Court light failure; waiting for maintenance."
        minLength={3}
        confirmLabel="Pause"
        onConfirm={(reason) => report(store.pauseLiveSession(sessionId, reason), "Session paused")}
      />

      <ConfirmDialog open={dialog === "end"} onClose={close} title="End the session?" tone="danger" confirmLabel="End session" onConfirm={() => report(store.endLiveSession(sessionId), "Session ended", "Record and confirm results next.")}>
        <p>The clock stops for good and any running step is closed. After this you can record results and finish the session; the clock cannot be restarted.</p>
      </ConfirmDialog>

      <EmergencyDialog open={dialog === "emergency"} onClose={close} sessionId={sessionId} />

      <ReasonDialog
        open={dialog === "exit"}
        onClose={close}
        title="Close the emergency"
        description="The session returns to paused. Resume the clock when play can continue."
        label="Why is it safe to continue?"
        placeholder="e.g. Participant treated by first aid and left with a friend; court cleared."
        confirmLabel="Close emergency"
        onConfirm={(exitReason) => report(store.exitEmergencyMode({ sessionId, exitReason }), "Emergency closed", "The session is paused.")}
      />
    </div>
  );
}

function EmergencyDialog({ open, onClose, sessionId }: { open: boolean; onClose: () => void; sessionId: string }) {
  const { enterEmergencyMode } = useStore();
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [action, setAction] = useState("");
  const [informed, setInformed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason("");
      setAction("");
      setInformed(false);
      setError(null);
    }
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} title="Declare an emergency">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const res = enterEmergencyMode({ sessionId, reason, immediateAction: action, safetyContactConfirmed: informed });
          if (res.error) return setError(res.error);
          toast.warning("Emergency declared", "The clock is stopped and the safety team has been alerted.");
          onClose();
        }}
      >
        <p className="text-sm leading-6 text-ink-sec">The clock stops, the running step pauses and a critical safety note is recorded. Call emergency services first if anyone is at risk.</p>
        <Field label="What happened?">
          <textarea autoFocus rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className="field w-full rounded-xl px-3.5 py-2.5 text-sm" placeholder="e.g. Player collapsed on court 2." />
        </Field>
        <Field label="Immediate action taken">
          <Input value={action} onChange={(e) => setAction(e.target.value)} placeholder="e.g. Play stopped, first aid called." />
        </Field>
        <label className="flex items-center gap-2.5 text-sm text-ink-sec">
          <input type="checkbox" checked={informed} onChange={(e) => setInformed(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
          The safety contact has been informed
        </label>
        {error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" disabled={reason.trim().length < 5 || action.trim().length < 3}>
            Declare emergency
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/* ------------------------------ running order ------------------------------ */

function RunOfShow({ segments, readOnly, running, progress }: { segments: ActivitySegment[]; readOnly: boolean; running: boolean; progress: number }) {
  const sessionId = useMissionId();
  const { startActivitySegment, completeActivitySegment, skipActivitySegment, createActivitySegment } = useStore();
  const toast = useToast();
  const [skipping, setSkipping] = useState<ActivitySegment | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<ActivitySegment["type"]>("Match");

  const act = (res: { error?: string }, ok: string) => (res.error ? toast.error("Step not updated", res.error) : toast.success(ok));

  return (
    <WorkspaceCard
      title="Running order"
      sub={running ? "One step runs at a time." : "Steps can be started once the clock is running."}
      right={
        <div className="flex w-28 items-center gap-2">
          <FillMeter value={progress} />
          <span className="text-xs tabular text-ink-mut">{progress}%</span>
        </div>
      }
      bodyClassName="p-0"
    >
      <ol className="divide-y divide-edge">
        {segments.length === 0 && <li className="px-5 py-8 text-center text-sm text-ink-mut">No steps planned yet. Add the first one below.</li>}
        {segments.map((seg) => {
          const active = seg.status === "Active";
          const paused = seg.status === "Paused";
          const done = seg.status === "Completed";
          const skipped = seg.status === "Skipped" || seg.status === "Cancelled";
          return (
            <li key={seg.id} className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3", active && "bg-brand-subtle/60")}>
              <div className="flex min-w-0 flex-1 basis-[15rem] items-center gap-3">
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                  done ? "bg-emerald-100 text-emerald-700" : active ? "bg-brand text-white" : paused ? "bg-amber-100 text-amber-800" : skipped ? "bg-slate-100 text-ink-mut" : "bg-slate-100 text-ink-sec",
                )}
              >
                {done ? <CheckCircle2 className="h-4 w-4" /> : skipped ? <SkipForward className="h-3.5 w-3.5" /> : seg.sequence}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm font-semibold", skipped ? "text-ink-mut line-through" : "text-ink-lum")}>{seg.name}</p>
                <p className="text-xs text-ink-mut">
                  {seg.type}
                  {seg.actualStart ? ` · started ${formatWhen(seg.actualStart)}` : ""}
                  {seg.actualEnd ? ` · finished ${formatWhen(seg.actualEnd)}` : ""}
                  {seg.skipReason ? ` · skipped: ${seg.skipReason}` : ""}
                </p>
              </div>
              </div>
              <div className="ml-auto flex items-center gap-2">
              <StatusChip value={seg.status === "Active" ? "live" : seg.status.toLowerCase()} />
              {!readOnly && !done && !skipped && (
                <div className="flex gap-1">
                  {active || paused ? (
                    <Button size="sm" onClick={() => act(completeActivitySegment(sessionId, seg.id), `${seg.name} finished`)}>
                      <Flag className="h-3.5 w-3.5" /> Finish
                    </Button>
                  ) : (
                    <>
                      <Button size="sm" variant="secondary" disabled={!running} onClick={() => act(startActivitySegment(sessionId, seg.id), `${seg.name} started`)}>
                        <Play className="h-3.5 w-3.5" /> Start
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setSkipping(seg)} aria-label={`Skip ${seg.name}`}>
                        Skip
                      </Button>
                    </>
                  )}
                </div>
              )}
              </div>
            </li>
          );
        })}
      </ol>
      {!readOnly && (
        <form
          className="flex flex-wrap items-end gap-2 border-t border-edge px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            const res = createActivitySegment({ sessionId, name, type });
            if (res.error) return toast.error("Step not added", res.error);
            toast.success("Step added", name);
            setName("");
          }}
        >
          <div className="min-w-[180px] flex-1">
            <Field label="New step">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Match 3: Final" />
            </Field>
          </div>
          <div className="w-36">
            <Field label="Type">
              <Select value={type} onChange={(e) => setType(e.target.value as ActivitySegment["type"])}>
                {SEGMENT_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Button type="submit" variant="secondary" disabled={name.trim().length < 2}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </form>
      )}
      <ReasonDialog
        open={!!skipping}
        onClose={() => setSkipping(null)}
        title={`Skip “${skipping?.name ?? ""}”`}
        description="Skipped steps need no result."
        placeholder="e.g. Running late; warm-up dropped."
        confirmLabel="Skip step"
        onConfirm={(reason) => {
          const res = skipActivitySegment(sessionId, skipping!.id, reason);
          if (res.error) return res;
          toast.success("Step skipped");
          return true;
        }}
      />
    </WorkspaceCard>
  );
}

/* -------------------------------- equipment -------------------------------- */

function EquipmentCard({ items, readOnly }: { items: EquipmentCheckItem[]; readOnly: boolean }) {
  const [editing, setEditing] = useState<EquipmentCheckItem | null>(null);
  return (
    <WorkspaceCard title="Equipment" sub="Issued, returned, missing and damaged counts." bodyClassName="p-0">
      {items.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-ink-mut">No equipment is tracked for this session.</p>
      ) : (
        <ul className="divide-y divide-edge">
          {items.map((e) => {
            const exception = e.missingCount > 0 || e.damagedCount > 0;
            return (
              <li key={e.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1 basis-[12rem]">
                  <p className="text-sm font-medium text-ink-lum">
                    {e.equipmentName} {e.isCritical && <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-ink-sec">Critical</span>}
                  </p>
                  <p className="text-xs tabular text-ink-mut">
                    Issued {e.issuedCount}/{e.requiredCount} · returned {e.returnedCount}
                    {e.missingCount ? ` · missing ${e.missingCount}` : ""}
                    {e.damagedCount ? ` · damaged ${e.damagedCount}` : ""}
                  </p>
                  {e.note && <p className="text-xs text-ink-mut">{e.note}</p>}
                </div>
                <StatusChip value={exception ? (e.isCritical && e.missingCount ? "critical" : "exception") : e.status} tone={exception ? (e.isCritical && e.missingCount ? "danger" : "warn") : undefined} />
                {!readOnly && (
                  <Button size="sm" variant="ghost" onClick={() => setEditing(e)} aria-label={`Update ${e.equipmentName}`}>
                    <Wrench className="h-3.5 w-3.5" /> Update
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <EquipmentDialog item={editing} onClose={() => setEditing(null)} />
    </WorkspaceCard>
  );
}

function EquipmentDialog({ item, onClose }: { item: EquipmentCheckItem | null; onClose: () => void }) {
  const sessionId = useMissionId();
  const { updateEquipmentStatus } = useStore();
  const toast = useToast();
  const [v, setV] = useState({ issued: "0", returned: "0", missing: "0", damaged: "0", note: "" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (item) {
      setV({ issued: String(item.issuedCount), returned: String(item.returnedCount), missing: String(item.missingCount), damaged: String(item.damagedCount), note: item.note ?? "" });
      setError(null);
    }
  }, [item]);

  if (!item) return null;
  const n = (s: string) => (s.trim() === "" ? NaN : Number(s));
  const issued = n(v.issued);
  const returned = n(v.returned);
  const missing = n(v.missing);
  const damaged = n(v.damaged);
  const status = missing > 0 ? "missing" : damaged > 0 ? "damaged" : issued > 0 && returned === issued ? "returned" : issued > 0 ? "in-use" : "available";

  return (
    <Dialog open={!!item} onClose={onClose} title={item.equipmentName}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const res = updateEquipmentStatus({ sessionId, equipmentId: item.id, issuedCount: issued, returnedCount: returned, missingCount: missing, damagedCount: damaged, note: v.note.trim() || undefined, status });
          if (res.error) return setError(res.error);
          toast.success("Equipment updated", item.equipmentName);
          onClose();
        }}
      >
        <p className="text-sm text-ink-mut">
          {item.availableCount} available · {item.requiredCount} required{item.isCritical ? " · critical: missing items block the session from opening" : ""}
        </p>
        <div className="grid grid-cols-2 gap-3">
          {(["issued", "returned", "missing", "damaged"] as const).map((k) => (
            <Field key={k} label={k[0].toUpperCase() + k.slice(1)}>
              <Input type="number" min={0} inputMode="numeric" value={v[k]} onChange={(e) => { setV({ ...v, [k]: e.target.value }); setError(null); }} />
            </Field>
          ))}
        </div>
        <Field label="Note (optional)">
          <Input value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} placeholder="e.g. One bat cracked during match 2." />
        </Field>
        {error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Save counts</Button>
        </div>
      </form>
    </Dialog>
  );
}

/* ---------------------------------- notes ---------------------------------- */

function NotesCard({ readOnly, segments }: { readOnly: boolean; segments: ActivitySegment[] }) {
  const sessionId = useMissionId();
  const { state, addLiveOperationalNote } = useStore();
  const toast = useToast();
  const opName = useOperatorName();
  const notes = useMemo(
    () => (state.liveOperationalNotes ?? []).filter((n) => n.sessionId === sessionId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [state.liveOperationalNotes, sessionId],
  );
  const [text, setText] = useState("");
  const [type, setType] = useState<LiveNoteType>("general");
  const [severity, setSeverity] = useState<LiveNoteSeverity>("info");
  const [followUp, setFollowUp] = useState(false);

  return (
    <WorkspaceCard title="Notes" sub="Observations and follow-ups. Safety notes appear in the final report." bodyClassName="p-0">
      {!readOnly && (
        <form
          className="space-y-3 border-b border-edge px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            const active = segments.find((s) => s.status === "Active");
            const res = addLiveOperationalNote({ sessionId, type, severity, note: text, followUpRequired: followUp, relatedSegmentId: active?.id });
            if (res.error) return toast.error("Note not saved", res.error);
            toast.success("Note saved");
            setText("");
            setFollowUp(false);
            setSeverity("info");
          }}
        >
          <label className="block">
            <span className="sr-only">Note</span>
            <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="What happened? e.g. Net on court 2 re-tensioned." className="field w-full rounded-xl px-3.5 py-2.5 text-sm" />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-36">
              <Select aria-label="Note type" value={type} onChange={(e) => setType(e.target.value as LiveNoteType)}>
                {NOTE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t[0].toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-32">
              <Select aria-label="Severity" value={severity} onChange={(e) => setSeverity(e.target.value as LiveNoteSeverity)}>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm text-ink-sec">
              <input type="checkbox" checked={followUp} onChange={(e) => setFollowUp(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" /> Needs follow-up
            </label>
            <Button type="submit" size="sm" className="ml-auto" disabled={text.trim().length < 3}>
              Add note
            </Button>
          </div>
        </form>
      )}
      <ul className="max-h-[360px] divide-y divide-edge overflow-y-auto">
        {notes.length === 0 && <li className="px-5 py-8 text-center text-sm text-ink-mut">No notes yet.</li>}
        {notes.map((n) => (
          <li key={n.id} className="px-5 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip value={n.severity === "critical" ? "critical" : n.severity === "warning" ? "warning" : "info"} tone={n.severity === "critical" ? "danger" : n.severity === "warning" ? "warn" : "info"} />
              <span className="text-xs font-medium capitalize text-ink-sec">{n.type}</span>
              {n.followUpRequired && <span className="text-xs font-semibold text-amber-700">Follow-up</span>}
              <span className="ml-auto text-xs text-ink-mut">
                {n.time} · {opName(n.operatorId)}
              </span>
            </div>
            <p className="mt-1 text-sm text-ink-lum">{n.note}</p>
          </li>
        ))}
      </ul>
    </WorkspaceCard>
  );
}
