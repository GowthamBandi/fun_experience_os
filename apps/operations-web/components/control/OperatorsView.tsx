"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { ShieldCheck, SlidersHorizontal, UserPlus } from "lucide-react";
import { Avatar, Badge, Button, Card, CopyIdPill, DataTable, Drawer, Empty, ErrorState, PageHeader, SkeletonRows, Truncated, type Column } from "@/components/pulse";
import { PageContainer } from "@/components/shell/PageContainer";
import { Age, DecisionSheet, Field, Fields, Gone, Note, SectionTitle, When, type DecisionSpec } from "@/components/money/MoneyBits";
import { ReadOnly } from "@/components/trust/TrustBits";
import { useAdminSession } from "@/lib/firebase/auth";
import { OPERATOR_ROLES, OPERATOR_STATUSES, RequestIdBook, decisionKey, type OperatorRole, type OperatorStatus } from "@/lib/console/actions";
import { CALLABLE_CAPABILITY, ROLE_LABEL, can } from "@/lib/console/capabilities";
import { APPLY_NOTE, ROLE_BLURB, ROLE_TONE, STATUS_TONE, operatorConsequence, operatorCounts, planOperatorChange, toOperatorRow, type OperatorRow } from "@/lib/control";
import { CONFIRM_PHRASES } from "@/lib/console/actions";
import { cn } from "@/lib/format";
import { setOperatorAccess } from "@/lib/governance-api";
import { useNow } from "@/lib/hooks";
import { useGovernanceCollection } from "@/lib/use-governance";
import { useSearchParamSetter } from "@/lib/use-search-param";
import { ControlSuspense, SummaryPill } from "./ControlBits";

const LABEL = "text-[12px] font-semibold text-text-3";
const INPUT = "field mt-1.5 h-11 w-full rounded-control px-3.5 text-[14px] text-text";

const STATUS_LABEL: Record<OperatorStatus, string> = { active: "Active", suspended: "Suspended", disabled: "Disabled" };
const STATUS_BLURB: Record<OperatorStatus, string> = {
  active: "Can sign in with their role.",
  suspended: "Blocked and signed out. Reversible.",
  disabled: "Blocked and signed out. For leavers.",
};

export function OperatorsView() {
  return (
    <ControlSuspense>
      <Operators />
    </ControlSuspense>
  );
}

/**
 * Operator access (setOperatorAccess, Platform Owner only). Super Admins and Auditors with access
 * see the list read-only; the server refuses them too.
 */
function Operators() {
  const { user, consoleRole: role } = useAdminSession();
  const canManage = can(role, CALLABLE_CAPABILITY.setOperatorAccess);
  const { records, loading, error, truncated, refresh } = useGovernanceCollection("operators");
  const params = useSearchParams();
  const setParam = useSearchParamSetter();
  const now = useNow();
  const rows = useMemo(() => records.map(toOperatorRow), [records]);
  const counts = useMemo(() => operatorCounts(rows), [rows]);
  const activeAdmins = rows.filter((r) => r.status === "active" && (r.role === "platform-owner" || r.role === "super-admin")).length;
  const ready = !loading && !error;
  const selectedId = params.get("operator");
  const selected = selectedId ? rows.find((r) => r.id === selectedId) ?? null : null;

  const book = useRef(new RequestIdBook("access"));
  const [granting, setGranting] = useState(false);
  const [grantUid, setGrantUid] = useState("");
  const [grantRole, setGrantRole] = useState<OperatorRole>("super-admin");
  const closeGrant = () => {
    setGranting(false);
    setGrantUid("");
    setGrantRole("super-admin");
  };

  const grantSpec: DecisionSpec | null = granting
    ? {
        idKey: decisionKey("operator", "grant", grantUid, grantRole),
        title: "Grant console access",
        consequence: `${ROLE_BLURB[grantRole]} ${APPLY_NOTE}`,
        confirmLabel: grantRole === "platform-owner" ? "Grant Platform Owner" : "Grant access",
        tone: grantRole === "platform-owner" ? "danger" : "volt",
        phrase: grantRole === "platform-owner" ? CONFIRM_PHRASES.grantPlatformOwner : null,
        reasonMin: 10,
        validate: () => (!grantUid.trim() ? "Enter the operator's Firebase Auth UID." : user?.uid && grantUid.trim() === user.uid ? "That is your own account. Ask another Platform Owner to change your role." : null),
        fields: (
          <div className="flex flex-col gap-4">
            <label className="block">
              <span className={LABEL}>Firebase Auth UID</span>
              <input value={grantUid} onChange={(e) => setGrantUid(e.target.value)} placeholder="Copy from Firebase Console → Authentication" autoComplete="off" spellCheck={false} className={cn(INPUT, "font-mono")} />
              {user?.uid && grantUid.trim() === user.uid ? <span role="status" className="mt-1.5 block text-[12px] text-warn">That is your own account. Ask another Platform Owner to change your role.</span> : null}
              <span className="mt-1.5 block text-[12px] text-text-3">The account must already exist in Firebase Auth. It must verify its email before it can sign in.</span>
            </label>
            <RolePicker label="Role" value={grantRole} onChange={setGrantRole} />
          </div>
        ),
        execute: async (_requestId, reason) => {
          const result = await setOperatorAccess({ uid: grantUid, roleId: grantRole, status: "active", reason, actorUid: user?.uid });
          return { tone: "ok", title: `${ROLE_LABEL[result.roleId as OperatorRole] ?? result.roleId} granted`, body: `${result.uid} is now ${result.status}. ${APPLY_NOTE}` };
        },
      }
    : null;

  const columns: Array<Column<OperatorRow>> = [
    {
      key: "operator",
      header: "Operator",
      sort: (a, b) => a.name.localeCompare(b.name),
      cell: (r) => (
        <div className="flex items-center gap-3">
          <Avatar name={r.name} size={36} />
          <div className="min-w-0 max-w-[280px]">
            <div className="flex items-center gap-2">
              <span className="truncate text-[14px] font-semibold text-text">{r.name}</span>
              {r.id === user?.uid ? <Badge tone="violet">You</Badge> : null}
            </div>
            {r.email && r.email !== r.name ? <div className="truncate text-[12px] text-text-3">{r.email}</div> : null}
          </div>
        </div>
      ),
    },
    { key: "role", header: "Role", sort: (a, b) => a.roleRaw.localeCompare(b.roleRaw), cell: (r) => <RoleBadge row={r} /> },
    { key: "status", header: "Status", sort: (a, b) => a.status.localeCompare(b.status), cell: (r) => <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge> },
    { key: "updated", header: "Updated", sort: (a, b) => (a.updatedAt?.getTime() ?? 0) - (b.updatedAt?.getTime() ?? 0), cell: (r) => <Age at={r.updatedAt} now={now} /> },
  ];

  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader
        overline="Control"
        title={
          <>
            Operator <em className="hl">access</em>
          </>
        }
        subtitle="Console accounts and their roles. Platform Owners grant, change, suspend or disable access; every change is audited and dual-control actions need two different admins, so keep at least two active admins."
        actions={
          canManage ? (
            <Button variant="volt" size="lg" icon={<UserPlus />} onClick={() => setGranting(true)}>
              Grant access
            </Button>
          ) : undefined
        }
      />

      {ready ? (
        <ul aria-label="Operator summary" className="flex flex-wrap gap-2 text-[12px]">
          <SummaryPill label="Active" value={counts.active} tone="ok" />
          <SummaryPill label="Suspended" value={counts.suspended} tone={counts.suspended > 0 ? "warn" : "default"} />
          <SummaryPill label="Disabled" value={counts.disabled} />
        </ul>
      ) : null}

      {ready && rows.length > 0 && activeAdmins < 2 ? (
        <Note tone="warn">
          Only {activeAdmins} active admin{activeAdmins === 1 ? "" : "s"} (Platform Owner or Super Admin). Dual-control actions need two different admins, so grant access to a second one.
        </Note>
      ) : null}
      {!canManage ? <Note>Read-only: only a Platform Owner can change operator access.</Note> : null}

      {error ? (
        <Card>
          <ErrorState message={error} onRetry={refresh} />
        </Card>
      ) : (
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(r) => r.id}
          loading={loading}
          onRowClick={(r) => setParam("operator", r.id)}
          caption="Console operators"
          className="max-h-[70vh]"
          empty={<Empty emoji="🛡️" title="No operator records yet" body="The first Platform Owner is created with the bootstrap script (docs/runbooks/ENVIRONMENTS_AND_DEPLOYMENT.md)." />}
        />
      )}
      {ready && truncated ? <Truncated shown={records.length} /> : null}

      <OperatorDrawer open={!!selectedId} loading={loading} row={selected} canManage={canManage} role={role} selfUid={user?.uid ?? null} actorUid={user?.uid} now={now} book={book.current} onClose={() => setParam("operator", null)} />
      <DecisionSheet spec={grantSpec} book={book.current} onClose={closeGrant} />
    </PageContainer>
  );
}

function RoleBadge({ row }: { row: OperatorRow }) {
  if (!row.role) return <Badge tone="muted">{row.roleRaw}</Badge>;
  return <Badge tone={ROLE_TONE[row.role]}>{ROLE_LABEL[row.role].replace(" (read-only)", "")}</Badge>;
}

function OperatorDrawer({
  open,
  loading,
  row,
  canManage,
  role,
  selfUid,
  actorUid,
  now,
  book,
  onClose,
}: {
  open: boolean;
  loading: boolean;
  row: OperatorRow | null;
  canManage: boolean;
  role: ReturnType<typeof useAdminSession>["consoleRole"];
  selfUid: string | null;
  actorUid: string | undefined;
  now: Date | null;
  book: RequestIdBook;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [nextRole, setNextRole] = useState<OperatorRole | null>(null);
  const [nextStatus, setNextStatus] = useState<OperatorStatus>("active");
  const self = !!row && !!selfUid && row.id === selfUid;

  const startEdit = () => {
    if (!row) return;
    setNextRole(row.role);
    setNextStatus(row.status);
    setEditing(true);
  };

  const plan = row ? planOperatorChange({ currentRole: row.role, currentStatus: row.status, self, nextRole, nextStatus }) : null;

  const spec: DecisionSpec | null =
    row && plan && editing
      ? {
          // The record's current role and status are part of the command: a repeat after it moved is a new command.
          idKey: decisionKey("operator", "update", row.id, row.roleRaw, row.status, plan.roleId, plan.status),
          title: `Change access for ${row.name}?`,
          consequence: operatorConsequence(plan, { currentRole: row.role, currentStatus: row.status }),
          confirmLabel: plan.status === "suspended" ? "Suspend operator" : plan.status === "disabled" ? "Disable operator" : "Apply change",
          tone: plan.status !== "active" || plan.phrase ? "danger" : "volt",
          phrase: plan.phrase,
          reasonMin: 10,
          validate: () => plan.blocked,
          fields: (
            <div className="flex flex-col gap-4">
              <RolePicker label="Role" value={nextRole} onChange={setNextRole} disabled={self} />
              <StatusPicker value={nextStatus} onChange={setNextStatus} disabledStatuses={self ? ["suspended", "disabled"] : []} />
              {plan.blocked ? (
                <p role="status" className="rounded-control border border-dashed border-[rgba(255,184,77,0.35)] px-3.5 py-2.5 text-[13px] text-warn">
                  {plan.blocked}
                </p>
              ) : null}
            </div>
          ),
          execute: async (_requestId, reason) => {
            const result = await setOperatorAccess({ uid: row.id, roleId: plan.roleId ?? "", status: plan.status, reason, actorUid });
            return { tone: "ok", title: `Access updated · ${row.name}`, body: `${ROLE_LABEL[result.roleId as OperatorRole] ?? result.roleId}, ${result.status}. ${APPLY_NOTE}` };
          },
        }
      : null;

  return (
    <>
      <Drawer open={open} title={row ? row.name : loading ? "Loading operator…" : "Operator unavailable"} onClose={onClose}>
        {!row && loading ? (
          <SkeletonRows rows={4} />
        ) : !row ? (
          <Gone noun="operator" />
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-4">
              <Avatar name={row.name} size={56} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <RoleBadge row={row} />
                  <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>
                  {self ? <Badge tone="violet">You</Badge> : null}
                </div>
                {row.email ? <p className="mt-1.5 truncate text-[13px] text-text-2">{row.email}</p> : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <CopyIdPill id={row.id} noun="operator" />
            </div>
            {row.role ? <Note>{ROLE_BLURB[row.role]}</Note> : <Note tone="warn">This account&rsquo;s role ({row.roleRaw}) is not a console role. Choose a role to restore access.</Note>}
            <Fields label="Operator details">
              <Field label="UID" mono>{row.id}</Field>
              <Field label="Email">{row.email ?? "—"}</Field>
              <Field label="Role">{row.role ? ROLE_LABEL[row.role] : row.roleRaw}</Field>
              <Field label="Status">{STATUS_LABEL[row.status]}</Field>
              <Field label="Updated"><When at={row.updatedAt} now={now} /></Field>
              <Field label="Updated by" mono>{row.updatedBy ?? "—"}</Field>
              <Field label="Created by" mono>{row.createdBy ?? "—"}</Field>
            </Fields>
            <section aria-label="Access change" className="flex flex-col gap-3">
              <SectionTitle>Access</SectionTitle>
              {!canManage ? (
                <ReadOnly role={role} what="operator access" />
              ) : self ? null : (
                <div>
                  <Button variant="primary" icon={<SlidersHorizontal />} onClick={startEdit}>
                    Change role or status
                  </Button>
                </div>
              )}
              {self && canManage ? <p className="text-[12px] text-text-3">You can&rsquo;t change your own role or suspend or disable yourself. Ask another Platform Owner.</p> : null}
            </section>
          </div>
        )}
      </Drawer>
      <DecisionSheet spec={spec} book={book} onClose={() => setEditing(false)} />
    </>
  );
}

/** Three role cards as one radio group (native radios: arrow keys and focus come for free). */
function RolePicker({ label, value, onChange, disabled = false }: { label: string; value: OperatorRole | null; onChange: (role: OperatorRole) => void; disabled?: boolean }) {
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className={LABEL}>{label}</legend>
      <div className="mt-1.5 flex flex-col gap-2">
        {OPERATOR_ROLES.map((r) => (
          <PickCard key={r} name="operator-role" checked={value === r} onChange={() => onChange(r)} title={ROLE_LABEL[r]} body={ROLE_BLURB[r]} danger={r === "platform-owner"} />
        ))}
      </div>
    </fieldset>
  );
}

function StatusPicker({ value, onChange, disabledStatuses }: { value: OperatorStatus; onChange: (status: OperatorStatus) => void; disabledStatuses: OperatorStatus[] }) {
  return (
    <fieldset className="min-w-0">
      <legend className={LABEL}>Status</legend>
      <div className="mt-1.5 grid grid-cols-3 gap-2">
        {OPERATOR_STATUSES.map((s) => (
          <PickCard key={s} name="operator-status" compact checked={value === s} disabled={disabledStatuses.includes(s)} onChange={() => onChange(s)} title={STATUS_LABEL[s]} body={STATUS_BLURB[s]} danger={s !== "active"} />
        ))}
      </div>
    </fieldset>
  );
}

function PickCard({ name, checked, disabled, onChange, title, body, danger, compact }: { name: string; checked: boolean; disabled?: boolean; onChange: () => void; title: string; body: ReactNode; danger?: boolean; compact?: boolean }) {
  return (
    <label className={cn("relative block", disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer")}>
      <input type="radio" name={name} checked={checked} disabled={disabled} onChange={onChange} className="peer sr-only" />
      <span
        className={cn(
          "block rounded-control border border-line px-3.5 py-3 transition-[border-color,background-color,box-shadow] duration-150 ease-pulse",
          "hover:border-[rgba(255,255,255,0.22)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary",
          danger
            ? "peer-checked:border-[rgba(255,97,120,0.55)] peer-checked:bg-[rgba(255,97,120,0.08)]"
            : "peer-checked:border-primary peer-checked:bg-[rgba(142,114,255,0.12)] peer-checked:shadow-[0_0_0_3px_rgba(142,114,255,0.18)]",
        )}
      >
        <span className="flex items-center gap-2 font-display text-[14px] font-bold text-text">
          {checked ? <ShieldCheck aria-hidden className={cn("h-4 w-4 shrink-0", danger ? "text-err" : "text-primary")} /> : null}
          {title}
        </span>
        <span className={cn("mt-1 block text-text-3", compact ? "text-[11.5px] leading-4" : "text-[12.5px] leading-[1.45]")}>{body}</span>
      </span>
    </label>
  );
}
