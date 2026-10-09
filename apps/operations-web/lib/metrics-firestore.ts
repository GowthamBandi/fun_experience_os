import { collection, count, getAggregateFromServer, query, sum, Timestamp, where, type QueryConstraint } from "firebase/firestore";
import { getFirebaseClient } from "./firebase/client";
import { readNumber, resolveMetric, scopeWhere, type MetricKey, type MetricScope, type MetricSpec, type TimeRange } from "./metrics";

export type { MetricScope };

/** One server-side aggregation. A sum skips docs missing the field; a non-finite result throws. */
export async function runMetric(spec: MetricSpec, range?: TimeRange, scope?: MetricScope): Promise<number> {
  // ledgerEntries and tickets carry orgId and eventId; customer specs name their own uid field.
  const constraints: QueryConstraint[] = [...spec.where, ...scopeWhere(spec, scope)].map(([field, op, value]) => where(field, op, value));
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
