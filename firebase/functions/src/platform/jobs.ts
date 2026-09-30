/**
 * Background-job bookkeeping (docs/runbooks/OBSERVABILITY.md, DATA_RETENTION.md).
 *
 * Every scheduled job runs through `runJob()`, which:
 *   - runs each named step in isolation, so one failing step never stops the
 *     others (holds still expire when the refund retry is broken);
 *   - writes ONE summary document per job per day, `jobRuns/{job}_{YYYY-MM-DD}`
 *     (India date), merged on every run: run/failure counters plus the last
 *     run's counts and errors. Operators read it from the console; rules make
 *     it admin/auditor read-only;
 *   - logs `job.completed` (INFO) or `job.failed` (ERROR) with the same
 *     summary, which is what the `job_failures` log-based metric alerts on;
 *   - rethrows when any step failed, so the Cloud Functions run itself is
 *     marked failed too (Error Reporting / execution metrics).
 *
 * Errors recorded here are messages only (truncated), never documents or PII.
 */

import { FieldValue } from "firebase-admin/firestore";
import { db, serverNow } from "./firestore";
import { log, redactPhones } from "./log";

export const JOB_RUNS = "jobRuns";

export type StepCounts = Record<string, number | boolean | string | null>;
export type JobSteps = Record<string, () => Promise<StepCounts | number | void>>;

export interface JobSummary {
  job: string;
  status: "ok" | "failed";
  steps: Record<string, StepCounts>;
  errors: { step: string; message: string }[];
  startedAt: string;
  durationMs: number;
}

/** YYYY-MM-DD in Asia/Kolkata (all schedules run on India time). */
export function istDate(at: Date = new Date()): string {
  return new Date(at.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

export const jobRunId = (job: string, at: Date = new Date()) => `${job}_${istDate(at)}`;

/** Error text safe for jobRuns and logs (phone-shaped runs redacted, truncated). Exported for tests. */
export function errorMessage(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return redactPhones(m).slice(0, 300);
}

/**
 * Runs the steps in order and records the outcome. Returns the summary; throws
 * (after recording) if any step failed and `throwOnFailure` is not false.
 */
export async function runJob(job: string, steps: JobSteps, opts: { throwOnFailure?: boolean } = {}): Promise<JobSummary> {
  const started = new Date();
  const summary: JobSummary = { job, status: "ok", steps: {}, errors: [], startedAt: started.toISOString(), durationMs: 0 };
  for (const [name, step] of Object.entries(steps)) {
    try {
      const out = await step();
      summary.steps[name] = typeof out === "number" ? { count: out } : (out ?? {});
    } catch (e) {
      summary.status = "failed";
      summary.errors.push({ step: name, message: errorMessage(e) });
      summary.steps[name] = { failed: true };
    }
  }
  summary.durationMs = Date.now() - started.getTime();

  try {
    await db()
      .collection(JOB_RUNS)
      .doc(jobRunId(job, started))
      .set(
        {
          job,
          date: istDate(started),
          runs: FieldValue.increment(1),
          failures: FieldValue.increment(summary.status === "ok" ? 0 : 1),
          lastStatus: summary.status,
          lastSteps: summary.steps,
          lastErrors: summary.errors,
          lastStartedAt: summary.startedAt,
          lastDurationMs: summary.durationMs,
          updatedAt: serverNow(),
        },
        // mergeFields (not merge: true): replace lastSteps/lastErrors wholesale
        // instead of deep-merging them with the previous run's keys.
        { mergeFields: ["job", "date", "runs", "failures", "lastStatus", "lastSteps", "lastErrors", "lastStartedAt", "lastDurationMs", "updatedAt"] }
      );
  } catch (e) {
    // The summary doc is visibility, not correctness: never mask the job's
    // own outcome, but make the bookkeeping failure itself visible.
    summary.errors.push({ step: "jobRuns", message: errorMessage(e) });
    summary.status = "failed";
  }

  log(summary.status === "ok" ? "INFO" : "ERROR", {
    event: summary.status === "ok" ? "job.completed" : "job.failed",
    job,
    steps: summary.steps,
    errors: summary.errors,
    durationMs: summary.durationMs,
  });
  if (summary.status !== "ok" && opts.throwOnFailure !== false) {
    throw new Error(`${job} failed: ${summary.errors.map((e) => `${e.step}: ${e.message}`).join("; ")}`);
  }
  return summary;
}

/**
 * Guard for retried event triggers: an event older than `maxAgeMs` is dropped
 * (logged at ERROR) instead of retried forever. Returns true when stale.
 */
export function isStaleEvent(eventTimestamp: string, maxAgeMs: number, fields: { job: string; [k: string]: unknown }): boolean {
  const age = Date.now() - Date.parse(eventTimestamp);
  if (Number.isFinite(age) && age > maxAgeMs) {
    log("ERROR", { event: "job.failed", reason: "stale-event-dropped", ageMs: age, ...fields });
    return true;
  }
  return false;
}
