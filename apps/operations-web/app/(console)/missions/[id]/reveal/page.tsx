"use client";

import { useMemo, useState } from "react";
import { CalendarClock, Eye, EyeOff, Send, Undo2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { calculateRevealReadiness, selectPostRevealPreview, selectPreRevealPreview } from "@/lib/prototype/selectors/reveal";
import { selectLiveSessionState } from "@/lib/prototype/selectors/liveSession";
import { cn } from "@/lib/format";
import { Button, StatusChip } from "@/components/ui/primitives";
import { Field, Input, Select } from "@/components/ui/fields";
import { useToast } from "@/components/ui/toast";
import { CheckRow, ConfirmDialog, MissionShell, ReasonDialog, WorkspaceCard, formatWhen, useMissionId } from "@/components/missions/shared";

export default function RevealPage() {
  return (
    <MissionShell tab="reveal" sub="The reveal tells each participant their team, code and teammates' codes. Check readiness, then send it.">
      <RevealBody />
    </MissionShell>
  );
}

const REVEALED = new Set(["revealed", "check-in-open", "live", "completed"]);

function RevealBody() {
  const sessionId = useMissionId();
  const { state, triggerReveal, delayReveal, cancelReveal } = useStore();
  const toast = useToast();

  const session = state.sessions.find((s) => s.id === sessionId)!;
  const readiness = useMemo(() => calculateRevealReadiness(state, sessionId), [state, sessionId]);
  const lss = selectLiveSessionState(state, sessionId);
  const revealed = REVEALED.has(session.status);
  const canCancel = revealed && session.status !== "live" && session.status !== "completed" && lss.status === "Ready";

  const eligible = readiness.participantStatuses.filter((p) => p.isEligible);
  const [previewId, setPreviewId] = useState(eligible[0]?.bookingId ?? "");
  const [view, setView] = useState<"before" | "after">(revealed ? "after" : "before");
  const pre = useMemo(() => selectPreRevealPreview(state, sessionId), [state, sessionId]);
  const post = useMemo(() => (previewId ? selectPostRevealPreview(state, sessionId, previewId) : null), [state, sessionId, previewId]);

  const [sendOpen, setSendOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [newTime, setNewTime] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);

  const blockers = readiness.checks.filter((c) => !c.passed && c.blocking);
  const ready = readiness.isReadyToReveal;

  return (
    <div className="space-y-6">
      <section
        className={cn(
          "flex flex-wrap items-center justify-between gap-4 rounded-panel border p-5 shadow-panel",
          revealed ? "border-violet-200 bg-violet-50/60" : ready ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50/60",
        )}
      >
        <div>
          <p className="font-display text-xl font-bold text-ink-lum">
            {revealed ? "Reveal sent" : ready ? "Ready to reveal" : `${blockers.length} item(s) block the reveal`}
          </p>
          <p className="mt-1 text-sm text-ink-sec">
            {revealed
              ? canCancel
                ? "Participants can see their teams. You can still cancel the reveal until the session is opened."
                : "The session has been opened, so the reveal is final."
              : `Scheduled for ${formatWhen(session.revealAt)}. Sending early is allowed.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!revealed && (
            <>
              <Button variant="secondary" onClick={() => { setNewTime(""); setRescheduleOpen(true); }}>
                <CalendarClock className="h-4 w-4" /> Reschedule
              </Button>
              {ready ? (
                <Button onClick={() => setSendOpen(true)}>
                  <Send className="h-4 w-4" /> Send reveal
                </Button>
              ) : (
                <Button variant="warning" disabled={readiness.checks.some((c) => !c.passed && (c.key === "session-open" || c.key === "not-revealed"))} onClick={() => setOverrideOpen(true)}>
                  <Send className="h-4 w-4" /> Reveal with override
                </Button>
              )}
            </>
          )}
          {canCancel && (
            <Button variant="danger" onClick={() => setCancelOpen(true)}>
              <Undo2 className="h-4 w-4" /> Cancel reveal
            </Button>
          )}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <WorkspaceCard title="Reveal checklist" sub="Blocking items need fixing or an override reason.">
          <ul className="divide-y divide-edge">
            {readiness.checks.map((c) => (
              <CheckRow key={c.key} passed={c.passed} warning={!c.blocking} label={c.label} detail={c.detail} />
            ))}
          </ul>
        </WorkspaceCard>

        <WorkspaceCard
          title="What participants see"
          sub="Preview of the participant app. Names and contact details are never shown."
          right={
            <div className="inline-flex rounded-xl border border-edge bg-bg-sunken p-1" role="tablist" aria-label="Preview">
              {(["before", "after"] as const).map((v) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => setView(v)}
                  className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold", view === v ? "bg-white text-brand-ink shadow-lift ring-1 ring-edge" : "text-ink-mut hover:text-ink-lum")}
                >
                  {v === "before" ? "Before reveal" : "After reveal"}
                </button>
              ))}
            </div>
          }
        >
          {view === "before" ? (
            <div className="rounded-2xl border border-edge bg-bg-sunken p-5">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-mut">
                <EyeOff className="h-3.5 w-3.5" /> Hidden until the reveal
              </p>
              <p className="mt-2 font-display text-lg font-bold text-ink-lum">{pre.sessionTitle}</p>
              <p className="text-sm text-ink-sec">
                {pre.date} at {pre.startTime}
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-ink-mut">Players joined</dt>
                  <dd className="font-semibold text-ink-lum">
                    {pre.joinedCount} of {pre.maxCapacity}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-mut">Reveal</dt>
                  <dd className="font-semibold text-ink-lum">{formatWhen(pre.revealTime)}</dd>
                </div>
              </dl>
              <p className="mt-4 text-xs text-ink-mut">Team, code, teammates and exact court stay hidden until the reveal.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <Field label="Preview as">
                <Select value={previewId} onChange={(e) => setPreviewId(e.target.value)}>
                  {eligible.length === 0 && <option value="">No confirmed participants</option>}
                  {eligible.map((p) => (
                    <option key={p.bookingId} value={p.bookingId}>
                      {p.alias}
                    </option>
                  ))}
                </Select>
              </Field>
              {post ? (
                <div className="rounded-2xl border border-violet-200 bg-white p-5">
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-violet-700">
                    <Eye className="h-3.5 w-3.5" /> Revealed
                  </p>
                  <div className="mt-2 flex flex-wrap items-baseline gap-3">
                    <p className="font-mono text-2xl font-bold text-ink-lum">{post.temporaryCode || "No code yet"}</p>
                    <p className="text-sm text-ink-sec">{post.teamName || "No team yet"}</p>
                  </div>
                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-ink-mut">Where</dt>
                      <dd className="text-ink-lum">
                        {post.venueName}
                        {post.playingAreaName ? ` · ${post.playingAreaName}` : ""}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-mut">Check-in opens</dt>
                      <dd className="text-ink-lum">{formatWhen(post.reportingTime)}</dd>
                    </div>
                  </dl>
                  <p className="mt-4 text-xs font-semibold text-ink-mut">Teammates</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {post.teammates.length === 0 && <span className="text-sm text-ink-mut">None yet</span>}
                    {post.teammates.map((t) => (
                      <span key={t.temporaryCode + t.alias} className="rounded-lg border border-edge bg-bg-sunken px-2 py-1 text-xs">
                        <span className="font-mono font-semibold text-ink-lum">{t.temporaryCode || "—"}</span> <span className="text-ink-mut">{t.alias}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-ink-mut">Choose a confirmed participant to preview.</p>
              )}
            </div>
          )}
        </WorkspaceCard>
      </div>

      <WorkspaceCard title="Participants" sub={`${readiness.participantStatuses.filter((p) => p.isRevealEligible).length} of ${eligible.length} confirmed participants are ready.`} bodyClassName="p-0">
        {readiness.participantStatuses.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-mut">No bookings on this session yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-edge bg-bg-sunken/80 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-mut">
                  <th className="px-5 py-2.5">Participant</th>
                  <th className="px-5 py-2.5">Code</th>
                  <th className="px-5 py-2.5">Team</th>
                  <th className="px-5 py-2.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {readiness.participantStatuses.map((p) => (
                  <tr key={p.bookingId} className="border-b border-slate-100 last:border-0">
                    <td className="px-5 py-2.5 font-medium text-ink-lum">{p.alias}</td>
                    <td className="px-5 py-2.5 text-ink-sec">{!p.isEligible ? "—" : p.isIdentityLocked ? "Locked" : p.hasTempIdentity ? "Not locked" : "Missing"}</td>
                    <td className="px-5 py-2.5 text-ink-sec">{!p.isEligible ? "—" : p.isTeamLocked ? "Locked" : p.hasTeamAssigned ? "Not locked" : "None"}</td>
                    <td className="px-5 py-2.5 text-right">
                      {p.isRevealEligible ? <StatusChip value="ready" /> : <StatusChip value={p.blockedReason ?? "blocked"} tone={p.isEligible ? "warn" : "neutral"} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </WorkspaceCard>

      <ConfirmDialog
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        title="Send the reveal now?"
        confirmLabel="Send reveal"
        onConfirm={() => {
          const res = triggerReveal(sessionId);
          if (res.error) return res;
          toast.success("Reveal sent", "Next: open door check-in.");
          return true;
        }}
      >
        {eligible.length} participants will see their team, code and teammates&apos; codes. Until the session is opened you can still cancel the reveal.
      </ConfirmDialog>

      <ReasonDialog
        open={overrideOpen}
        onClose={() => setOverrideOpen(false)}
        title="Reveal with override"
        tone="warning"
        description={
          <div>
            <p>These items are not ready:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-mut">
              {blockers.map((b) => (
                <li key={b.key}>
                  {b.label} — {b.detail}
                </li>
              ))}
            </ul>
          </div>
        }
        placeholder="e.g. Lead coordinator confirmed teams on site; late joiner will be added at the door."
        confirmLabel="Reveal anyway"
        onConfirm={(reason) => {
          const res = triggerReveal(sessionId, reason);
          if (res.error) return res;
          toast.warning("Reveal sent with override", "The override reason is in the audit record.");
          return true;
        }}
      />

      <ReasonDialog
        open={rescheduleOpen}
        onClose={() => setRescheduleOpen(false)}
        title="Reschedule the reveal"
        placeholder="e.g. Waiting for two late payments to clear."
        confirmLabel="Save new time"
        onConfirm={(reason) => {
          if (!newTime) return { error: "Choose the new reveal time." };
          const res = delayReveal(sessionId, newTime, reason);
          if (res.error) return res;
          toast.success("Reveal rescheduled", `Now ${formatWhen(newTime)}.`);
          return true;
        }}
      >
        <Field label="New reveal time">
          <Input type="datetime-local" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
        </Field>
      </ReasonDialog>

      <ReasonDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel the reveal"
        tone="danger"
        description={`The session returns to “${(session.statusBeforeReveal ?? "booking-closed").replace(/-/g, " ")}”, codes and teams go back to locked, and participants lose sight of their team until you reveal again.`}
        placeholder="e.g. Venue changed; teams will be rebuilt."
        confirmLabel="Cancel reveal"
        onConfirm={(reason) => {
          const res = cancelReveal(sessionId, reason);
          if (res.error) return res;
          toast.success("Reveal cancelled", "Teams and codes are locked again.");
          return true;
        }}
      />
    </div>
  );
}
