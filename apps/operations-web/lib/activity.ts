/**
 * Activity record helpers: turn a store command invocation into a readable,
 * immutable ActivityRecord. Every console command passes through `describeCommand`.
 */
import type { ActivityRecord } from "@/lib/prototype/entities";

const MODULE_RULES: Array<[RegExp, string]> = [
  [/governance|intake/i, "Marketplace governance"],
  [/operator|signIn|signOut|role/i, "Access"],
  [/workspace|backup|scenario|reset|startFresh/i, "Workspace"],
  [/franchise|territor|city|venue|playingArea|operationalNote/i, "Setup"],
  [/category|template|catalog/i, "Catalog"],
  [/refund|payment|reconcile|transaction/i, "Money"],
  [/booking|reservation|waitlist|strike/i, "Bookings"],
  [/tournament|match|walkover|disqualify|bracket|winner/i, "Tournaments"],
  [/incident|investigat|evidence|followUp|dispute|moderation/i, "Safety & disputes"],
  [/crew|staff/i, "Staffing"],
  [/identity|pattern|temporary/i, "Identity"],
  [/team/i, "Teams"],
  [/reveal/i, "Reveal"],
  [/checkIn/i, "Check-in"],
  [/segment|result|equipment|live|emergency|openSession/i, "Live session"],
  [/session/i, "Sessions"],
  [/signal|audit/i, "Notifications"],
];

export function moduleForCommand(command: string): string {
  for (const [re, label] of MODULE_RULES) if (re.test(command)) return label;
  return "Console";
}

export function humanizeCommand(command: string): string {
  const words = command.replace(/Cb$/, "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const TARGET_KEYS = ["bookingId", "sessionId", "caseId", "entityId", "tournamentId", "incidentId", "disputeId", "actionId", "exceptionId", "refundId", "paymentId", "segmentId", "matchId", "identityId", "id", "name"];
const DETAIL_KEYS = ["reason", "note", "overrideReason", "auditOverrideReason", "denialReason", "exitReason", "resolution", "notes", "summary", "outcome", "status", "targetStatus"];

function firstString(value: unknown, keys: string[]): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const obj = value as Record<string, unknown>;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return undefined;
}

export function describeCommand(command: string, args: unknown[]): { summary: string; target?: string; detail?: string } {
  let target: string | undefined;
  let detail: string | undefined;
  for (const a of args) {
    if (!target && typeof a === "string") target = a;
    if (!target) target = firstString(a, TARGET_KEYS);
    if (!detail) detail = firstString(a, DETAIL_KEYS);
  }
  // Positional reason: a later string argument that reads like a sentence.
  if (!detail) {
    const sentence = args.slice(1).find((a) => typeof a === "string" && /\s/.test(a));
    if (typeof sentence === "string") detail = sentence;
  }
  const summary = humanizeCommand(command) + (target ? ` · ${target}` : "");
  return { summary, target, detail: detail?.slice(0, 500) };
}

let seq = 0;
export function newActivityId(): string {
  seq = (seq + 1) % 1_000_000;
  return `act-${Date.now().toString(36)}-${seq.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function buildActivityRecord(input: {
  command: string;
  args: unknown[];
  actorId: string;
  actorName: string;
  roleId: string;
  outcome: ActivityRecord["outcome"];
  error?: string;
}): ActivityRecord {
  const { summary, target, detail } = describeCommand(input.command, input.args);
  return {
    id: newActivityId(),
    at: new Date().toISOString(),
    actorId: input.actorId,
    actorName: input.actorName,
    roleId: input.roleId,
    command: input.command,
    module: moduleForCommand(input.command),
    summary,
    target,
    outcome: input.outcome,
    detail: input.error ?? detail,
  };
}

const CSV_COLUMNS: Array<keyof ActivityRecord> = ["at", "actorName", "roleId", "module", "command", "summary", "target", "outcome", "detail", "id"];

export function activityToCsv(rows: ActivityRecord[]): string {
  const esc = (v: unknown) => {
    const s = v === undefined || v === null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [CSV_COLUMNS.join(","), ...rows.map((r) => CSV_COLUMNS.map((c) => esc(r[c])).join(","))].join("\n");
}
