import { collection, count, getAggregateFromServer, query, sum, Timestamp, where, type QueryConstraint } from "firebase/firestore";
import { getFirebaseClient } from "./firebase/client";
import { METRIC_SPECS, readNumber, type MetricKey, type MetricSpec, type TimeRange } from "./metrics";

/** One server-side aggregation. A sum skips docs missing the field; a non-finite result throws. */
export async function runMetric(spec: MetricSpec, range?: TimeRange): Promise<number> {
  const constraints: QueryConstraint[] = spec.where.map(([field, op, value]) => where(field, op, value));
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

/** A metric by key, with any `minus` spec subtracted (net commission, customers excluding operators). */
export async function runMetricKey(key: MetricKey, range?: TimeRange): Promise<number> {
  const spec = METRIC_SPECS[key];
  if (spec.available === false) throw new Error(spec.reason ?? "Not recorded");
  const [gross, minus] = await Promise.all([runMetric(spec, range), spec.minus ? runMetricKey(spec.minus, range) : Promise.resolve(0)]);
  return gross - minus;
}
