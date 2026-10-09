import { collection, count, getAggregateFromServer, query, sum, Timestamp, where, type QueryConstraint } from "firebase/firestore";
import { getFirebaseClient } from "./firebase/client";
import { readNumber, resolveMetric, type MetricKey, type MetricSpec, type TimeRange } from "./metrics";

/** Narrows a metric to one organizer or one event (ledgerEntries and tickets carry orgId and eventId). */
export interface MetricScope {
  orgId?: string;
  eventId?: string;
}

/** One server-side aggregation. A sum skips docs missing the field; a non-finite result throws. */
export async function runMetric(spec: MetricSpec, range?: TimeRange, scope?: MetricScope): Promise<number> {
  const constraints: QueryConstraint[] = spec.where.map(([field, op, value]) => where(field, op, value));
  const orgId = scope?.orgId;
  if (orgId) constraints.push(where("orgId", "==", orgId));
  const eventId = scope?.eventId;
  if (eventId) constraints.push(where("eventId", "==", eventId));
  if (spec.dateField && range) {
    constraints.push(where(spec.dateField, ">=", Timestamp.fromDate(range.start)));
    constraints.push(where(spec.dateField, "<", Timestamp.fromDate(range.end)));
  }
  const q = query(collection(getFirebaseClient().firestore, spec.collection), ...constraints);
  const snap = await getAggregateFromServer(q, { v: spec.agg.kind === "count" ? count() : sum(spec.agg.field) });
  const value = readNumber(snap.data().v);
  if (value === null) throw new Error(`Metric on ${spec.collection} returned no number`);
  return value;
}

/** A metric by key, with any `minus` spec subtracted. */
export function runMetricKey(key: MetricKey, range?: TimeRange, scope?: MetricScope): Promise<number> {
  return resolveMetric(key, (spec) => runMetric(spec, range, scope));
}
