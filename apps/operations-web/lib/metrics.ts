export type RangeKey = "today" | "7d" | "30d";

export interface TimeRange {
  start: Date;
  end: Date;
}

const IST = 330 * 60_000;
const DAY = 86_400_000;
const DAYS: Record<RangeKey, number> = { today: 1, "7d": 7, "30d": 30 };

/** Start of the IST (UTC+5:30) day containing `t`, in epoch ms. */
const dayStart = (t: number) => Math.floor((t + IST) / DAY) * DAY - IST;

/** IST days ending with today; the end is the next IST midnight. */
export function rangeFor(key: RangeKey, now: Date): TimeRange {
  const end = dayStart(now.getTime()) + DAY;
  return { start: new Date(end - DAYS[key] * DAY), end: new Date(end) };
}

export function previousRange(r: TimeRange): TimeRange {
  const length = r.end.getTime() - r.start.getTime();
  return { start: new Date(r.start.getTime() - length), end: new Date(r.start.getTime()) };
}

/** One range per IST day, oldest first, ending with today. */
export function dailyBuckets(days: number, now: Date): TimeRange[] {
  const end = dayStart(now.getTime()) + DAY;
  return Array.from({ length: days }, (_, i) => {
    const start = end - (days - i) * DAY;
    return { start: new Date(start), end: new Date(start + DAY) };
  });
}

export function readNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function ratio(n: number | null, d: number | null): number | null {
  if (n === null || d === null || d === 0) return null;
  return n / d;
}

export function metricErrorMessage(err: unknown): string {
  const code = typeof err === "object" && err !== null ? (err as { code?: unknown }).code : undefined;
  switch (code) {
    case "failed-precondition":
      return "This number needs a Firestore index that isn't deployed yet.";
    case "permission-denied":
      return "Your role can't read this.";
    case "unavailable":
      return "Can't reach Firestore. Check your connection.";
    default:
      return "This number couldn't load.";
  }
}

/** Payment statuses that hold captured money (commerce/types.ts PaymentStatus). */
export const CAPTURED_PAYMENT_STATUSES = ["captured", "refunded", "partially-refunded"] as const;

export type WhereOp = "==" | "in";
export type MetricWhere = [field: string, op: WhereOp, value: string | string[]];

export interface MetricSpec {
  collection: string;
  where: MetricWhere[];
  /** The timestamp the range applies to; null for point-in-time counts. */
  dateField: string | null;
  agg: { kind: "count" } | { kind: "sum"; field: string };
  /** Another spec subtracted from this one (net figures). */
  minus?: MetricKey;
  /** The field that carries the customer's uid; only specs with one accept a customer scope. */
  customerField?: string;
  /** False when the backend does not record this; the UI shows an em dash. */
  available?: false;
  reason?: string;
}

export type MetricKey =
  | "grossBookings"
  | "confirmedBookings"
  | "refundsAmount"
  | "newCustomers"
  | "operatorsCreated"
  | "ticketsIssued"
  | "ticketsCheckedIn"
  | "activeOrganizers"
  | "commission"
  | "commissionReversed"
  | "customerBookings"
  | "customerSpent"
  | "customerRefunded"
  | "customerReviews";

// Field names verified against firebase/functions/src (see the task 7 report).
export const METRIC_SPECS: Record<MetricKey, MetricSpec> = {
  // Money metrics share one basis, the ledger, so gross and refunds line up per period.
  grossBookings: {
    collection: "ledgerEntries",
    where: [["account", "==", "customer_payments"], ["kind", "==", "capture"], ["direction", "==", "debit"]],
    dateField: "createdAt",
    agg: { kind: "sum", field: "amountMinor" },
  },
  confirmedBookings: {
    collection: "ledgerEntries",
    where: [["account", "==", "customer_payments"], ["kind", "==", "capture"], ["direction", "==", "debit"]],
    dateField: "createdAt",
    agg: { kind: "count" },
  },
  refundsAmount: {
    collection: "ledgerEntries",
    where: [["account", "==", "customer_refunds"], ["kind", "==", "refund"], ["direction", "==", "credit"]],
    dateField: "createdAt",
    agg: { kind: "sum", field: "amountMinor" },
  },
  // users carries no customer marker; operators are subtracted via scope == "platform".
  newCustomers: {
    collection: "users",
    where: [],
    dateField: "createdAt",
    agg: { kind: "count" },
    minus: "operatorsCreated",
  },
  operatorsCreated: {
    collection: "users",
    where: [["scope", "==", "platform"]],
    dateField: "createdAt",
    agg: { kind: "count" },
  },
  ticketsIssued: {
    collection: "tickets",
    where: [],
    dateField: "issuedAt",
    agg: { kind: "count" },
  },
  // Check-in is status "used" with checkedInAt (commerce/checkin.ts), not a boolean.
  ticketsCheckedIn: {
    collection: "tickets",
    where: [["status", "==", "used"]],
    dateField: "checkedInAt",
    agg: { kind: "count" },
  },
  activeOrganizers: {
    collection: "organizers",
    where: [["status", "==", "active"]],
    dateField: null,
    agg: { kind: "count" },
  },
  // Commission is a credit to platform_commission on capture; refunds reverse it with a debit.
  commission: {
    collection: "ledgerEntries",
    where: [["account", "==", "platform_commission"], ["kind", "==", "capture"], ["direction", "==", "credit"]],
    dateField: "createdAt",
    agg: { kind: "sum", field: "amountMinor" },
    minus: "commissionReversed",
  },
  commissionReversed: {
    collection: "ledgerEntries",
    where: [["account", "==", "platform_commission"], ["kind", "==", "refund"], ["direction", "==", "debit"]],
    dateField: "createdAt",
    agg: { kind: "sum", field: "amountMinor" },
  },
  // Customer 360. Ledger lines carry no customerUid (commerce/ledger.ts), so these read the
  // customer-keyed docs: bookings, payments and refunds (customerUid) and reviews (authorUid).
  customerBookings: { collection: "bookings", where: [], dateField: null, agg: { kind: "count" }, customerField: "customerUid" },
  // A captured payment keeps counting after refunds (status moves to refunded / partially-refunded),
  // unlike its booking, which a refunded cancellation turns "cancelled".
  customerSpent: {
    collection: "payments",
    where: [["status", "in", [...CAPTURED_PAYMENT_STATUSES]]],
    dateField: null,
    agg: { kind: "sum", field: "amountMinor" },
    customerField: "customerUid",
  },
  customerRefunded: {
    collection: "refunds",
    where: [["status", "==", "completed"]],
    dateField: null,
    agg: { kind: "sum", field: "amountMinor" },
    customerField: "customerUid",
  },
  customerReviews: { collection: "reviews", where: [], dateField: null, agg: { kind: "count" }, customerField: "authorUid" },
};

/** Narrows a metric to one organizer, one event or one customer. */
export interface MetricScope {
  orgId?: string;
  eventId?: string;
  customerUid?: string;
}

/** The equality filters a scope adds to a spec. A customer scope on a spec without a customer field throws rather than count everyone. */
export function scopeWhere(spec: MetricSpec, scope?: MetricScope): MetricWhere[] {
  const out: MetricWhere[] = [];
  if (scope?.orgId) out.push(["orgId", "==", scope.orgId]);
  if (scope?.eventId) out.push(["eventId", "==", scope.eventId]);
  if (scope?.customerUid) {
    if (!spec.customerField) throw new Error(`${spec.collection} can't be narrowed to one customer`);
    out.push([spec.customerField, "==", scope.customerUid]);
  }
  return out;
}

/** Resolves a metric through `run`, subtracting its `minus` spec (net commission, customers excluding operators). */
export async function resolveMetric(key: MetricKey, run: (spec: MetricSpec) => Promise<number>): Promise<number> {
  const spec = METRIC_SPECS[key];
  if (spec.available === false) throw new Error(spec.reason ?? "Not recorded");
  const [value, minus] = await Promise.all([run(spec), spec.minus ? resolveMetric(spec.minus, run) : Promise.resolve(0)]);
  return value - minus;
}
