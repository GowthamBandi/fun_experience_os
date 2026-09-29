"use client";

import { useMemo, useState } from "react";
import { Ban, CheckCircle2, ShieldCheck, ShieldX, UserSearch } from "lucide-react";
import { useStore } from "@/lib/store";
import type { ModerationActionType, ModerationScope } from "@/lib/prototype/entities";
import {
  moderationCaseDetail,
  moderationCaseRows,
  moderationActionRows,
  subjectEligibility,
  type ModerationActionRow,
} from "@/lib/prototype/selectors/moderation";
import { EXPIRING_ACTIONS, FOUR_EYES_ACTIONS } from "@/lib/prototype/validators/moderationValidation";
import { formatDay, formatWhen, toDateInput } from "@/lib/safety/time";
import { Badge, StatusChip, type Tone } from "@/components/ui/primitives";
import { Drawer } from "@/components/ui/overlays";
import { Field, Input, Select } from "@/components/ui/fields";
import { EmptyState } from "@/components/ui/panels";
import { cn } from "@/lib/format";
import { CommandDialog, DetailRow, DrawerSection, GatedButton, PermissionNote, ReasonDialog, SeverityBadge, TextArea, useSafetyGate } from "./shared";
import { OpenCaseDialog } from "./IncidentsTab";

const label = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, " ");
const STATE_TONE: Record<ModerationActionRow["effectiveState"], Tone> = {
  proposed: "warn",
  scheduled: "info",
  "in-force": "danger",
  expired: "neutral",
  ended: "neutral",
};
const STATE_LABEL: Record<ModerationActionRow["effectiveState"], string> = {
  proposed: "proposed",
  scheduled: "scheduled",
  "in-force": "in force",
  expired: "expired",
  ended: "ended",
};

export function ModerationTab() {
  const { state } = useStore();
  const gate = useSafetyGate();
  const [selected, setSelected] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const cases = useMemo(() => moderationCaseRows(state), [state]);
  const inForce = useMemo(() => moderationActionRows(state).filter((a) => a.effectiveState === "in-force" || a.effectiveState === "scheduled"), [state]);
  const openGate = gate("moderation.open-case");

  return (
    <div className="grid grid-cols-1 gap-0 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 border-edge xl:border-r">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge p-4">
          <p className="text-sm text-ink-mut">Cases about a participant&apos;s behaviour. Proposals need approval before they take effect.</p>
          <GatedButton gate={openGate} size="sm" onClick={() => setOpening(true)}>
            Open case
          </GatedButton>
        </div>
        {cases.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No moderation cases" line="Open a case from an incident or here when a participant's behaviour needs a decision." />
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {cases.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => setSelected(c.id)}
                  className="flex w-full flex-col gap-2 px-5 py-4 text-left hover:bg-brand-subtle/30 focus:outline-none focus-visible:bg-brand-subtle/40 md:flex-row md:items-center md:gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-ink-lum">{c.subject}</span>
                      <SeverityBadge severity={c.severity} />
                      <span className="text-sm capitalize text-ink-sec">{c.category.replace(/-/g, " ")}</span>
                    </div>
                    <p className="mt-1 line-clamp-1 text-xs text-ink-mut">{c.notes}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 md:justify-end">
                    {c.pending && <Badge className="border border-amber-200 bg-amber-50 text-amber-700">Awaiting approval: {label(c.pending.type)}</Badge>}
                    {c.inForce.length > 0 && <Badge className="border border-red-200 bg-red-50 text-red-700">{c.inForce.length} in force</Badge>}
                    <StatusChip value={c.status} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <aside className="space-y-5 border-t border-edge p-4 xl:border-t-0">
        <EligibilityCheck />
        <div>
          <h3 className="eyebrow mb-2">Restrictions in force ({inForce.length})</h3>
          {inForce.length === 0 ? (
            <p className="rounded-xl border border-dashed border-edge-strong px-3 py-4 text-center text-sm text-ink-mut">
              No suspensions or restrictions are in force.
            </p>
          ) : (
            <ul className="space-y-2">
              {inForce.map((a) => (
                <li key={a.id}>
                  <button onClick={() => setSelected(a.caseId)} className="w-full rounded-xl border border-edge bg-white p-3 text-left hover:border-brand/40">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm font-semibold text-ink-lum">{a.subjectTemporaryId ?? a.subjectPersonId}</span>
                      <StatusChip value={STATE_LABEL[a.effectiveState]} tone={STATE_TONE[a.effectiveState]} />
                    </div>
                    <p className="mt-1 text-xs text-ink-sec">
                      {label(a.type)} · {a.scopeLabel}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-mut">{a.expiryDate ? `Until ${formatDay(a.expiryDate)}` : "No expiry"}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
      <CaseDrawer id={selected} onClose={() => setSelected(null)} />
      <OpenCaseDialog open={opening} onClose={() => setOpening(false)} />
    </div>
  );
}

function EligibilityCheck() {
  const { state } = useStore();
  const [subject, setSubject] = useState("");
  const [venueId, setVenueId] = useState("");
  const venue = state.venues.find((v) => v.id === venueId);
  const result =
    subject.trim().length >= 2
      ? subjectEligibility(state, subject.trim().toUpperCase(), { venueId: venueId || undefined, territoryId: venue?.territoryId })
      : undefined;
  return (
    <div className="rounded-2xl border border-edge bg-bg-sunken/60 p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-lum">
        <UserSearch className="h-4 w-4 text-brand" /> Check a participant
      </h3>
      <p className="mt-1 text-xs text-ink-mut">Expired and future-dated actions are ignored.</p>
      <div className="mt-3 grid grid-cols-1 gap-2">
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Temporary ID, e.g. CR-22"
          aria-label="Participant temporary ID"
          className="h-10"
        />
        <Select value={venueId} onChange={(e) => setVenueId(e.target.value)} aria-label="Venue">
          <option value="">Any venue</option>
          {state.venues.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </Select>
      </div>
      {result && (
        <p
          className={cn(
            "mt-3 flex items-start gap-2 rounded-xl px-3 py-2 text-sm",
            result.isEligible ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800",
          )}
        >
          {result.isEligible ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <Ban className="mt-0.5 h-4 w-4 shrink-0" />}
          {result.isEligible ? "Can book and take part." : result.blockReason}
        </p>
      )}
    </div>
  );
}

type DialogKind = null | "propose" | "reject" | "revoke" | "close" | "approve";

function CaseDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { state, operator, approveModerationAction, rejectModerationAction, revokeModerationAction, closeModerationCase } = useStore();
  const gate = useSafetyGate();
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [target, setTarget] = useState<ModerationActionRow | null>(null);
  const c = useMemo(() => (id ? moderationCaseDetail(state, id) : undefined), [state, id]);
  if (!id)
    return (
      <Drawer open={false} onClose={onClose} title="">
        {null}
      </Drawer>
    );
  if (!c) {
    return (
      <Drawer open onClose={onClose} title="Case not found">
        <p className="text-sm text-ink-mut">This moderation case no longer exists.</p>
      </Drawer>
    );
  }
  const pending = c.pending;
  const approveGate = pending ? gate(pending.type === "permanent-ban" ? "moderation.approve-ban" : "moderation.approve") : { allowed: false };
  const selfApproval = pending && operator && FOUR_EYES_ACTIONS.includes(pending.type) && pending.createdBy === operator.id;
  const approve = selfApproval
    ? { allowed: false, reason: "Suspensions and bans need a second person: someone other than the proposer must approve." }
    : approveGate;
  const relatedIncidents = state.incidents.filter((i) => c.relatedIncidentIds?.includes(i.id));

  return (
    <Drawer open onClose={onClose} title={`Case ${c.id}`} sub={`Participant ${c.subject}`} width="max-w-xl">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip value={c.status} />
          <SeverityBadge severity={c.severity} />
          <Badge className="border border-slate-200 bg-slate-50 capitalize text-ink-sec">{c.category.replace(/-/g, " ")}</Badge>
        </div>

        {pending && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
            <p className="eyebrow text-amber-700">Awaiting approval</p>
            <p className="mt-1 font-display text-lg font-bold text-ink-lum">{label(pending.type)}</p>
            <p className="mt-1 text-sm text-ink-sec">{pending.reason}</p>
            <dl className="mt-2 divide-y divide-amber-100">
              <DetailRow label="Applies to">{pending.scopeLabel}</DetailRow>
              <DetailRow label="Effective">{formatDay(pending.effectiveDate)}</DetailRow>
              <DetailRow label="Expires">{pending.expiryDate ? formatDay(pending.expiryDate) : pending.type === "permanent-ban" ? "Never" : "—"}</DetailRow>
              <DetailRow label="Proposed by">
                {pending.proposerName}, {formatWhen(pending.createdAt)}
              </DetailRow>
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              <GatedButton gate={approve} size="sm" variant={pending.type === "permanent-ban" ? "danger" : "success"} onClick={() => setDialog("approve")}>
                <ShieldCheck className="h-3.5 w-3.5" /> Approve
              </GatedButton>
              <GatedButton gate={gate("moderation.reject")} size="sm" variant="secondary" onClick={() => setDialog("reject")}>
                <ShieldX className="h-3.5 w-3.5" /> Reject
              </GatedButton>
            </div>
            <div className="mt-3">
              <PermissionNote reason={approve.allowed ? undefined : approve.reason} />
            </div>
          </div>
        )}

        {c.status !== "closed" && (
          <DrawerSection title="Case actions">
            <div className="flex flex-wrap gap-2">
              {!pending && (
                <GatedButton gate={gate("moderation.propose")} size="sm" onClick={() => setDialog("propose")}>
                  Propose action
                </GatedButton>
              )}
              <GatedButton gate={gate("moderation.propose")} size="sm" variant="secondary" onClick={() => setDialog("close")} disabled={!!pending}>
                Close case
              </GatedButton>
            </div>
            <div className="mt-3">
              <PermissionNote reason={gate("moderation.propose").reason} />
            </div>
          </DrawerSection>
        )}

        <DrawerSection title="Case">
          <p className="whitespace-pre-line text-sm leading-6 text-ink-lum">{c.notes}</p>
          <dl className="mt-2 divide-y divide-slate-100">
            <DetailRow label="Reviewer">{c.reviewerName ?? "—"}</DetailRow>
            <DetailRow label="Opened">{formatWhen(c.createdAt)}</DetailRow>
            <DetailRow label="Origin">
              {c.originType.replace(/-/g, " ")} <span className="font-mono text-xs">{c.originId}</span>
            </DetailRow>
            {relatedIncidents.length > 0 && <DetailRow label="Incidents">{relatedIncidents.map((i) => i.incidentCode ?? i.id).join(", ")}</DetailRow>}
            {c.decision && <DetailRow label="Decision">{c.decision}</DetailRow>}
          </dl>
        </DrawerSection>

        <DrawerSection title={`Action history (${c.history.length})`}>
          {c.history.length === 0 ? (
            <p className="text-sm text-ink-mut">No actions proposed yet.</p>
          ) : (
            <ul className="space-y-2">
              {c.history.map((a) => (
                <li key={a.id} className="rounded-xl border border-edge p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-ink-lum">{label(a.type)}</span>
                    <StatusChip
                      value={a.effectiveState === "ended" ? a.status : STATE_LABEL[a.effectiveState]}
                      tone={a.effectiveState === "ended" ? undefined : STATE_TONE[a.effectiveState]}
                    />
                  </div>
                  <p className="mt-1 text-xs text-ink-sec">
                    {a.scopeLabel} · {formatDay(a.effectiveDate)}
                    {a.expiryDate ? ` → ${formatDay(a.expiryDate)}` : ""}
                  </p>
                  {a.rejectionReason && <p className="mt-1 text-xs text-ink-mut">Rejected: {a.rejectionReason}</p>}
                  {a.revocationReason && <p className="mt-1 text-xs text-ink-mut">Revoked: {a.revocationReason}</p>}
                  {(a.effectiveState === "in-force" || a.effectiveState === "scheduled") && (
                    <div className="mt-2">
                      <GatedButton
                        gate={gate(a.type === "permanent-ban" ? "moderation.revoke-ban" : "moderation.revoke")}
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setTarget(a);
                          setDialog("revoke");
                        }}
                      >
                        Revoke
                      </GatedButton>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </DrawerSection>
      </div>

      <ProposeDialog open={dialog === "propose"} onClose={() => setDialog(null)} caseId={c.id} />
      {pending && (
        <CommandDialog
          open={dialog === "approve"}
          onClose={() => setDialog(null)}
          title={`Approve ${label(pending.type).toLowerCase()}?`}
          confirmLabel="Approve"
          variant={pending.type === "permanent-ban" ? "danger" : "success"}
          success="Moderation action approved"
          onSubmit={() => approveModerationAction(pending.id)}
        >
          <p className="text-sm leading-6 text-ink-sec">
            {pending.type === "permanent-ban"
              ? `${c.subject} will be barred from every session and tournament on the platform until an owner revokes the ban.`
              : pending.type === "temporary-suspension"
                ? `${c.subject} will not be able to book or take part (${pending.scopeLabel}) until ${formatDay(pending.expiryDate)}.`
                : pending.type === "formal-warning" || pending.type === "informal-note"
                  ? `A ${label(pending.type).toLowerCase()} is added to ${c.subject}'s record. It does not block bookings.`
                  : `${c.subject} will be restricted from ${pending.scopeLabel} until ${formatDay(pending.expiryDate)}.`}
          </p>
        </CommandDialog>
      )}
      <ReasonDialog
        open={dialog === "reject"}
        onClose={() => setDialog(null)}
        title="Reject proposal"
        consequence="The case goes back to review so a different action can be proposed."
        confirmLabel="Reject proposal"
        variant="danger"
        success="Proposal rejected"
        onSubmit={(r) => rejectModerationAction(pending!.id, r)}
      />
      <ReasonDialog
        open={dialog === "revoke" && !!target}
        onClose={() => {
          setDialog(null);
          setTarget(null);
        }}
        title="Revoke action"
        consequence={target ? `${label(target.type)} on ${target.subjectTemporaryId ?? target.subjectPersonId} stops applying immediately.` : undefined}
        confirmLabel="Revoke"
        variant="danger"
        success="Action revoked"
        onSubmit={(r) => revokeModerationAction(target!.id, r)}
      />
      <ReasonDialog
        open={dialog === "close"}
        onClose={() => setDialog(null)}
        title="Close case"
        label="Case outcome"
        consequence="Closed cases are read-only. Actions already in force keep applying until they expire or are revoked."
        confirmLabel="Close case"
        success="Case closed"
        onSubmit={(r) => closeModerationCase(c.id, r)}
      />
    </Drawer>
  );
}

const ACTION_TYPES: Array<[ModerationActionType, string]> = [
  ["informal-note", "Informal note"],
  ["formal-warning", "Formal warning"],
  ["activity-restriction", "Tournament restriction"],
  ["venue-restriction", "Venue restriction"],
  ["temporary-suspension", "Temporary suspension"],
  ["permanent-ban", "Permanent platform ban"],
];

function ProposeDialog({ open, onClose, caseId }: { open: boolean; onClose: () => void; caseId: string }) {
  const { state, proposeModerationAction } = useStore();
  const [type, setType] = useState<ModerationActionType>("formal-warning");
  const [scope, setScope] = useState<ModerationScope>("platform");
  const [entity, setEntity] = useState("");
  const [effective, setEffective] = useState(toDateInput(new Date()));
  const [expiry, setExpiry] = useState(toDateInput(new Date(Date.now() + 7 * 86400000)));
  const [reason, setReason] = useState("");

  const scopes: ModerationScope[] =
    type === "permanent-ban"
      ? ["platform"]
      : type === "venue-restriction"
        ? ["venue"]
        : type === "activity-restriction"
          ? ["tournament"]
          : ["platform", "territory", "venue", "tournament"];
  const effectiveScope = scopes.includes(scope) ? scope : scopes[0];
  const entities =
    effectiveScope === "venue"
      ? state.venues.map((v) => ({ id: v.id, name: v.name }))
      : effectiveScope === "territory"
        ? state.territories.map((t) => ({ id: t.id, name: t.name }))
        : effectiveScope === "tournament"
          ? state.tournaments.map((t) => ({ id: t.id, name: t.name }))
          : [];
  const needsExpiry = EXPIRING_ACTIONS.includes(type);

  return (
    <CommandDialog
      open={open}
      onClose={() => {
        setReason("");
        setEntity("");
        onClose();
      }}
      wide
      title="Propose a moderation action"
      confirmLabel="Send for approval"
      canSubmit={reason.trim().length >= 10 && (effectiveScope === "platform" || !!entity)}
      success="Proposal sent for approval"
      onSubmit={() =>
        proposeModerationAction({
          caseId,
          type,
          scope: effectiveScope,
          scopeEntityId: effectiveScope === "platform" ? undefined : entity,
          effectiveDate: effective,
          expiryDate: needsExpiry ? expiry : undefined,
          reason,
        })
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Action">
          <Select
            value={type}
            onChange={(e) => {
              setType(e.target.value as ModerationActionType);
              setEntity("");
            }}
          >
            {ACTION_TYPES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Applies to">
          <Select
            value={effectiveScope}
            onChange={(e) => {
              setScope(e.target.value as ModerationScope);
              setEntity("");
            }}
            disabled={scopes.length === 1}
          >
            {scopes.map((s) => (
              <option key={s} value={s}>
                {s === "platform" ? "Whole platform" : label(s)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {effectiveScope !== "platform" && (
        <Field label={label(effectiveScope)}>
          <Select value={entity} onChange={(e) => setEntity(e.target.value)} required>
            <option value="">Choose…</option>
            {entities.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Takes effect">
          <Input type="date" value={effective} onChange={(e) => setEffective(e.target.value)} />
        </Field>
        {needsExpiry ? (
          <Field label="Expires">
            <Input type="date" value={expiry} min={effective} onChange={(e) => setExpiry(e.target.value)} />
          </Field>
        ) : (
          <p className="self-end pb-2 text-xs text-ink-mut">
            {type === "permanent-ban" ? "A permanent ban has no expiry." : "Warnings and notes stay on record and do not block bookings."}
          </p>
        )}
      </div>
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-ink-sec">Reason</span>
        <TextArea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="The behaviour, the evidence, and why this action is proportionate." />
      </label>
      {(type === "permanent-ban" || type === "temporary-suspension") && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
          {type === "permanent-ban"
            ? "Permanent bans are approved by a Platform Owner or Super Admin."
            : "Suspensions need a second person: someone other than you must approve."}
        </p>
      )}
    </CommandDialog>
  );
}
