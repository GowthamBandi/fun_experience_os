/**
 * Pure helpers for the Control screens (audit, policies, legal holds, system
 * health, operators): grouping, filtering and label mapping. No Firebase or React.
 */

import { filterAudit } from "./console/audit";
import { ROLE_LABEL, toConsoleRole, type ConsoleRole } from "./console/capabilities";
import { CONFIRM_PHRASES, type OperatorRole, type OperatorStatus } from "./console/actions";
import { auditActorRole, formatDateTime, latestJobRuns, text, toDate, type DisplayRecord } from "./console/records";

export type ControlTone = "violet" | "ok" | "warn" | "err" | "info" | "muted";

const DAY_MS = 86_400_000;

/** "refund.decided" / "access.operator-updated" / "releaseExpiredHolds" → "Refund decided" / "Access operator updated" / "Release expired holds". */
export function humanize(value: string): string {
  const words = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[._:\-/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return words ? `${words.charAt(0).toUpperCase()}${words.slice(1)}` : "—";
}

/* ----------------------------------------------------------------- audit */

/** The India calendar day (YYYY-MM-DD) a moment falls on. */
export function istDayKey(date: Date): string {
  return new Date(date.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

/** "Today", "Yesterday", else "Fri, 9 Oct" (with the year when it is not the current one). */
export function istDayLabel(key: string, now: Date): string {
  const today = istDayKey(now);
  if (key === today) return "Today";
  if (key === istDayKey(new Date(now.getTime() - DAY_MS))) return "Yesterday";
  const day = new Date(`${key}T12:00:00Z`);
  const sameYear = key.slice(0, 4) === today.slice(0, 4);
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC" }).format(day);
}

export function auditTone(action: string): ControlTone {
  const a = action.toLowerCase();
  if (/(reject|block|disabl|suspend|cancel|fail|delete|revok|hid)/.test(a)) return "err";
  if (/(release|pause|hold|review|information|changes|escalat)/.test(a)) return "warn";
  if (/(approv|activat|paid|publish|resolv|grant|complet|place|reactivat)/.test(a)) return "ok";
  if (/(propos|request|creat|issue|reissue|build)/.test(a)) return "info";
  return "violet";
}

/** The actor role without the "platform:" prefix, so actorRole and actorRoleId records share one key. */
export function auditRoleKey(raw: Record<string, unknown>): string {
  const role = auditActorRole(raw);
  return role === "—" ? role : role.replace(/^platform:/, "");
}

/** "platform:super-admin" → "Super Admin"; unknown roles keep their recorded text. */
export function auditRoleLabel(raw: Record<string, unknown>, orgNames: Record<string, string | null> = {}): string {
  const role = auditActorRole(raw);
  if (role === "—") return role;
  const known = toConsoleRole(role.replace(/^platform:/, ""));
  if (known) return ROLE_LABEL[known].replace(" (read-only)", "");
  // "org:<orgId>:owner" → "Owner · Clay & Coffee" (the organizer's name when it's loaded).
  const org = /^org:([^:]+):(.+)$/.exec(role);
  if (org) {
    const member = org[2].replace(/[-_]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
    return `${member} · ${orgNames[org[1]] ?? `org ${org[1]}`}`;
  }
  return role.replace(/^\w/, (c) => c.toUpperCase());
}

/** The orgIds inside "org:<orgId>:<role>" actor roles, for a name lookup. */
export function auditRoleOrgIds(records: DisplayRecord[]): string[] {
  const ids = new Set<string>();
  for (const record of records) {
    const m = /^org:([^:]+):/.exec(auditActorRole(record.raw));
    if (m) ids.add(m[1]);
    if (typeof record.raw.orgId === "string" && record.raw.orgId) ids.add(record.raw.orgId);
  }
  return [...ids];
}

export interface AuditView {
  role: string;
  action: string;
  entity: string;
  query: string;
}

export const EMPTY_AUDIT_VIEW: AuditView = { role: "", action: "", entity: "", query: "" };

export const isAuditFiltering = (view: AuditView) => view.role !== "" || view.action !== "" || view.entity !== "" || view.query.trim() !== "";

const str = (value: unknown) => (typeof value === "string" ? value : "");

/** Distinct actor roles (as recorded, labelled for display) with how many loaded events each has. */
export function auditRoleFacets(records: DisplayRecord[], orgNames: Record<string, string | null> = {}): Array<{ value: string; label: string; count: number }> {
  const byRole = new Map<string, { label: string; count: number }>();
  for (const record of records) {
    const value = auditRoleKey(record.raw);
    if (value === "—") continue;
    const entry = byRole.get(value) ?? { label: auditRoleLabel(record.raw, orgNames), count: 0 };
    entry.count += 1;
    byRole.set(value, entry);
  }
  return [...byRole.entries()].map(([value, e]) => ({ value, ...e })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** Count per value of a string field, most common first (for the action and entity chips). */
export function auditFieldFacets(records: DisplayRecord[], field: "action" | "resourceType"): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>();
  for (const record of records) {
    const value = str(record.raw[field]);
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/** Role + action + entity filters, then free text over ids, action, actor, resource and the reason. */
export function applyAuditView(records: DisplayRecord[], view: AuditView): DisplayRecord[] {
  const byRole = view.role ? records.filter((r) => auditRoleKey(r.raw) === view.role) : records;
  const narrowed = filterAudit(byRole, { action: view.action, resourceType: view.entity, subject: "" });
  const q = view.query.trim().toLowerCase();
  if (!q) return narrowed;
  return narrowed.filter((record) => {
    const raw = record.raw;
    const haystack = [record.id, raw.orgId, raw.resourceId, raw.resourceType, raw.actorUid, raw.requestId, raw.action, raw.reason, humanize(str(raw.action))].map(str).join(" ").toLowerCase();
    return haystack.includes(q);
  });
}

export interface AuditDayGroup {
  key: string;
  label: string;
  records: DisplayRecord[];
}

/** Newest-first records split by India day. Events with no usable time go last under "Undated". */
export function groupAuditByDay(records: DisplayRecord[], now: Date): AuditDayGroup[] {
  const groups = new Map<string, DisplayRecord[]>();
  const undated: DisplayRecord[] = [];
  for (const record of records) {
    const at = toDate(record.raw.at);
    if (!at) {
      undated.push(record);
      continue;
    }
    const key = istDayKey(at);
    const list = groups.get(key);
    if (list) list.push(record);
    else groups.set(key, [record]);
  }
  const out = [...groups.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([key, list]) => ({ key, label: istDayLabel(key, now), records: list }));
  if (undated.length) out.push({ key: "undated", label: "Undated", records: undated });
  return out;
}

/* ----------------------------------------------------------- system health */

const JOB_INFO: Record<string, { label: string; cadence: string; blurb: string }> = {
  releaseExpiredHolds: { label: "Seat-hold release", cadence: "Every 5 min", blurb: "Frees seats held at checkout that were never paid for, and retries stuck refunds." },
  sendEventReminders: { label: "Event reminders", cadence: "Every 15 min", blurb: "Sends the reminder notifications for events that are about to start." },
  dataRetention: { label: "Data retention", cadence: "Daily", blurb: "Deletes documents past their retention period; skips anyone under a legal hold." },
};

export function jobInfo(job: string): { label: string; cadence: string | null; blurb: string | null } {
  const known = JOB_INFO[job];
  return known ?? { label: humanize(job), cadence: null, blurb: null };
}

export function jobHealth(raw: Record<string, unknown>): { tone: "ok" | "err" | "muted"; label: string } {
  const last = typeof raw.lastStatus === "string" ? raw.lastStatus : "";
  if (!last) return { tone: "muted", label: "No result" };
  return last === "ok" ? { tone: "ok", label: "Healthy" } : { tone: "err", label: "Failed" };
}

export interface JobCard {
  job: string;
  recordId: string;
  date: string;
  health: { tone: "ok" | "err" | "muted"; label: string };
  lastRun: Date | null;
  runs: number | null;
  failures: number | null;
  durationMs: number | null;
  /** Older days for the same job (newest first, up to six) for the history strip. */
  history: Array<{ date: string; tone: "ok" | "err" | "muted" }>;
  raw: Record<string, unknown>;
}

const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

/** One card per job from its newest day; failing jobs first, then by name. */
export function jobCards(records: DisplayRecord[]): JobCard[] {
  const history = new Map<string, DisplayRecord[]>();
  for (const record of records) {
    const job = String(record.raw.job ?? record.id);
    history.set(job, [...(history.get(job) ?? []), record]);
  }
  return latestJobRuns(records)
    .map((record): JobCard => {
      const job = String(record.raw.job ?? record.id);
      const older = (history.get(job) ?? [])
        .filter((r) => r.id !== record.id)
        .sort((a, b) => String(b.raw.date ?? "").localeCompare(String(a.raw.date ?? "")))
        .slice(0, 6)
        .map((r) => ({ date: String(r.raw.date ?? "—"), tone: jobHealth(r.raw).tone }));
      return {
        job,
        recordId: record.id,
        date: String(record.raw.date ?? "—"),
        health: jobHealth(record.raw),
        lastRun: toDate(record.raw.lastStartedAt) ?? toDate(record.raw.updatedAt),
        runs: num(record.raw.runs),
        failures: num(record.raw.failures),
        durationMs: num(record.raw.lastDurationMs),
        history: older,
        raw: record.raw,
      };
    })
    .sort((a, b) => Number(b.health.tone === "err") - Number(a.health.tone === "err") || jobInfo(a.job).label.localeCompare(jobInfo(b.job).label));
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(s < 10 ? 1 : 0)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
}

/* -------------------------------------------------------------- operators */

export interface OperatorRow {
  id: string;
  name: string;
  email: string | null;
  role: ConsoleRole | null;
  roleRaw: string;
  status: OperatorStatus;
  updatedAt: Date | null;
  updatedBy: string | null;
  createdBy: string | null;
}

const opt = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);

export function toOperatorRow(record: DisplayRecord): OperatorRow {
  const raw = record.raw;
  const status = raw.status === "suspended" || raw.status === "disabled" ? raw.status : "active";
  return {
    id: record.id,
    name: opt(raw.displayName) ?? opt(raw.email) ?? record.id,
    email: opt(raw.email),
    role: toConsoleRole(raw.roleId),
    roleRaw: text(raw, "roleId"),
    status,
    updatedAt: toDate(raw.updatedAt),
    updatedBy: opt(raw.updatedBy),
    createdBy: opt(raw.createdBy),
  };
}

export function operatorCounts(rows: OperatorRow[]): { active: number; suspended: number; disabled: number } {
  const counts = { active: 0, suspended: 0, disabled: 0 };
  for (const row of rows) counts[row.status] += 1;
  return counts;
}

export const STATUS_TONE: Record<OperatorStatus, "ok" | "warn" | "err"> = { active: "ok", suspended: "warn", disabled: "err" };

export const ROLE_TONE: Record<OperatorRole, "violet" | "info" | "muted"> = { "platform-owner": "violet", "super-admin": "info", auditor: "muted" };

export const ROLE_BLURB: Record<OperatorRole, string> = {
  "platform-owner": "Full governance access and can grant, suspend and disable every operator, including other Platform Owners.",
  "super-admin": "Full governance access: approvals, refunds, settlements, commercials, cancellations and moderation. Cannot manage operator access.",
  auditor: "Read-only access to the audit trail and settlements. No actions.",
};

export const APPLY_NOTE = "The change applies on the operator's next token refresh (sign out/in, or “Check again”). Suspending or disabling also revokes their sessions.";

export interface OperatorPlan {
  /** Why the change cannot be sent (null when it can). */
  blocked: string | null;
  /** The typed phrase the server contract expects for a high-risk change. */
  phrase: string | null;
  roleId: OperatorRole | null;
  status: OperatorStatus;
}

/**
 * The rules the old per-button actions enforced, for a role + status picked together:
 * no self role change, no self suspend/disable, a console role must exist before a
 * status-only change, nothing to send when nothing changed. Suspend/disable need their
 * phrase; making someone Platform Owner, or restoring a suspended or disabled one
 * to active, needs the grant phrase.
 */
export function planOperatorChange(input: { currentRole: ConsoleRole | null; currentStatus: OperatorStatus; self: boolean; nextRole: OperatorRole | null; nextStatus: OperatorStatus }): OperatorPlan {
  const { currentRole, currentStatus, self, nextStatus } = input;
  const roleId = input.nextRole ?? currentRole;
  const base = { roleId, status: nextStatus };
  if (!roleId) return { ...base, blocked: "The current role is not a console role; choose a role first.", phrase: null };
  const roleChanged = roleId !== currentRole;
  const statusChanged = nextStatus !== currentStatus;
  if (self && roleChanged) return { ...base, blocked: "Ask another Platform Owner to change your own role (prevents locking yourself out).", phrase: null };
  if (self && nextStatus !== "active") return { ...base, blocked: "You cannot suspend or disable your own account.", phrase: null };
  if (!roleChanged && !statusChanged) return { ...base, blocked: "Nothing to change: pick a different role or status.", phrase: null };
  const statusPhrase = statusChanged ? (nextStatus === "suspended" ? CONFIRM_PHRASES.suspendOperator : nextStatus === "disabled" ? CONFIRM_PHRASES.disableOperator : null) : null;
  // One typed phrase per submission: a role change and a phrased status change are separate steps.
  if (roleChanged && statusPhrase) return { ...base, blocked: "Change the role and suspend or disable in separate steps, so each gets its own confirmation.", phrase: null };
  const grantsOwner = roleId === "platform-owner" && (roleChanged || (statusChanged && nextStatus === "active"));
  const phrase = statusPhrase ?? (grantsOwner ? CONFIRM_PHRASES.grantPlatformOwner : null);
  return { ...base, blocked: null, phrase };
}

/** One sentence on what the change does, shown in the Sheet. */
export function operatorConsequence(plan: OperatorPlan, input: { currentRole: ConsoleRole | null; currentStatus: OperatorStatus }): string {
  const parts: string[] = [];
  if (plan.roleId && plan.roleId !== input.currentRole) parts.push(ROLE_BLURB[plan.roleId]);
  if (plan.status !== input.currentStatus) {
    parts.push(
      plan.status === "suspended"
        ? "Blocks console access and revokes current sessions. Reversible by setting the status back to active."
        : plan.status === "disabled"
          ? "Disables console access and revokes current sessions (for leavers)."
          : "Restores console access with the chosen role.",
    );
  }
  return `${parts.join(" ") || "No change."} ${APPLY_NOTE}`;
}

/* ------------------------------------------------------------ legal holds */

export type HoldTab = "active" | "released" | "all";

export const HOLD_TABS: Array<{ id: HoldTab; label: string }> = [
  { id: "active", label: "Active" },
  { id: "released", label: "Released" },
  { id: "all", label: "All" },
];

export interface HoldRow {
  id: string;
  subjectType: string | null;
  subjectId: string | null;
  active: boolean;
  status: string;
  reference: string | null;
  reason: string | null;
  placedBy: string | null;
  placedAt: Date | null;
  releasedBy: string | null;
  releasedAt: Date | null;
  releaseReason: string | null;
  version: number;
}

export function toHoldRow(record: DisplayRecord): HoldRow {
  const raw = record.raw;
  return {
    id: record.id,
    subjectType: opt(raw.subjectType),
    subjectId: opt(raw.subjectId),
    active: raw.status === "active",
    status: opt(raw.status) ?? "—",
    reference: opt(raw.reference),
    reason: opt(raw.reason),
    placedBy: opt(raw.placedBy),
    placedAt: toDate(raw.placedAt),
    releasedBy: opt(raw.releasedBy),
    releasedAt: toDate(raw.releasedAt),
    releaseReason: opt(raw.releaseReason),
    version: record.version,
  };
}

/** Active holds first, then newest placed. */
export function sortHolds(rows: HoldRow[]): HoldRow[] {
  return [...rows].sort((a, b) => Number(b.active) - Number(a.active) || (b.placedAt?.getTime() ?? 0) - (a.placedAt?.getTime() ?? 0));
}

export function filterHolds(rows: HoldRow[], tab: HoldTab): HoldRow[] {
  return tab === "all" ? rows : rows.filter((r) => (tab === "active" ? r.active : !r.active));
}

export function holdCounts(rows: HoldRow[]): Record<HoldTab, number> {
  const active = rows.filter((r) => r.active).length;
  return { active, released: rows.length - active, all: rows.length };
}

/* --------------------------------------------------------------- policies */

export interface PolicyCard {
  id: string;
  title: string;
  version: string | null;
  status: string | null;
  tone: ControlTone;
  summary: string | null;
  effectiveFrom: string | null;
  facts: Array<{ label: string; value: string }>;
  /** Nested rule objects, shown pretty-printed on demand. */
  rules: unknown | null;
}

const POLICY_HANDLED = new Set(["title", "name", "policy", "subject", "kind", "policyVersion", "versionLabel", "semver", "version", "status", "summary", "description", "effectiveFrom", "effectiveAt", "rules", "updatedAt", "createdAt"]);

function scalar(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const date = toDate(value);
  return date && typeof value === "object" ? formatDateTime(date) : null;
}

export function policyTone(status: string | null): ControlTone {
  switch (status) {
    case "active": case "published": case "current": return "ok";
    case "draft": case "scheduled": case "pending": return "info";
    case "retired": case "superseded": case "archived": case "deprecated": return "muted";
    default: return status ? "violet" : "muted";
  }
}

export function toPolicyCard(record: DisplayRecord): PolicyCard {
  const raw = record.raw;
  const title = opt(raw.title) ?? opt(raw.name) ?? opt(raw.policy) ?? opt(raw.subject) ?? opt(raw.kind) ?? humanize(record.id);
  const versionRaw = raw.policyVersion ?? raw.versionLabel ?? raw.semver ?? raw.version;
  const status = opt(raw.status);
  const effective = raw.effectiveFrom ?? raw.effectiveAt;
  const facts: Array<{ label: string; value: string }> = [];
  for (const [key, value] of Object.entries(raw)) {
    if (POLICY_HANDLED.has(key)) continue;
    const shown = scalar(value);
    if (shown !== null) facts.push({ label: humanize(key), value: shown });
  }
  const nested = Object.fromEntries(Object.entries(raw).filter(([key, value]) => !POLICY_HANDLED.has(key) && scalar(value) === null && value !== null && value !== undefined && typeof value === "object"));
  const rules = raw.rules !== undefined && raw.rules !== null ? (Object.keys(nested).length ? { rules: raw.rules, ...nested } : raw.rules) : Object.keys(nested).length ? nested : null;
  return {
    id: record.id,
    title,
    version: scalar(versionRaw),
    status,
    tone: policyTone(status),
    summary: opt(raw.summary) ?? opt(raw.description),
    effectiveFrom: effective === undefined ? null : scalar(effective),
    facts,
    rules,
  };
}

/** By title, then newest version first. */
export function sortPolicies(cards: PolicyCard[]): PolicyCard[] {
  return [...cards].sort((a, b) => a.title.localeCompare(b.title) || (b.version ?? "").localeCompare(a.version ?? "", undefined, { numeric: true }));
}
