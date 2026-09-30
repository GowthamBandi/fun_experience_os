"use client";

import { useState } from "react";
import { GovernanceModulePage } from "./GovernanceModulePage";
import { Drawer, FieldList, InfoNote } from "./controls";
import type { LiveGovernanceRecord } from "@/lib/governance-api";
import { useGovernanceCollection } from "@/lib/use-governance";
import { formatDateTime, jobErrorLines, latestJobRuns, text } from "@/lib/console/records";

/**
 * Read-only view of scheduled-job summaries (jobRuns: one document per job per
 * IST day, written by platform/jobs.ts). Alerts on these jobs are configured in
 * Cloud Monitoring (docs/runbooks/OBSERVABILITY.md); this page is where an
 * operator looks first.
 */
export function SystemHealthWorkspace() {
  const { records, loading, error, truncated, refresh } = useGovernanceCollection("jobRuns");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId ? records.find((record) => record.id === selectedId) ?? null : null;
  const failing = latestJobRuns(records).filter((record) => record.raw.lastStatus && record.raw.lastStatus !== "ok").length;
  return <>
    <GovernanceModulePage
      eyebrow="Control"
      title="System health"
      description="Daily summaries of the scheduled jobs: seat-hold release and refund retries (every 5 min), event reminders (every 15 min) and data retention (daily). A job whose last run failed is counted below; open it to read the errors."
      metricLabel="Jobs whose last run failed"
      metricValue={loading ? "…" : String(failing)}
      records={records}
      loading={loading}
      error={error}
      truncated={truncated}
      onRetry={refresh}
      primaryAction="Open"
      actionLabel={() => "Open"}
      onAction={(record) => setSelectedId(record.id)}
      emptyMessage="No job runs recorded yet. They appear within minutes of the first deploy."
    />
    {selectedId && <JobDrawer record={selected} onClose={() => setSelectedId(null)} />}
  </>;
}

function JobDrawer({ record, onClose }: { record: LiveGovernanceRecord | null; onClose: () => void }) {
  if (!record) return <Drawer label="Job run unavailable" eyebrow="Job run" title="Job run unavailable" onClose={onClose}><InfoNote tone="warn">This job run is no longer in the live list.</InfoNote></Drawer>;
  const raw = record.raw;
  const errors = jobErrorLines(raw.lastErrors);
  const steps = raw.lastSteps && typeof raw.lastSteps === "object" ? JSON.stringify(raw.lastSteps, null, 2) : "—";
  return (
    <Drawer label={`Job run ${record.id}`} eyebrow={`Job run · ${record.id}`} title={`${text(raw, "job")} · ${text(raw, "date")}`} subtitle={`Last status ${String(raw.lastStatus ?? "—")}`} onClose={onClose}>
      {Boolean(raw.lastStatus) && raw.lastStatus !== "ok" && <InfoNote tone="warn">The last run did not finish cleanly. See docs/runbooks/OBSERVABILITY.md for this job.</InfoNote>}
      <FieldList fields={[
        { label: "Runs today", value: String(raw.runs ?? "—") },
        { label: "Failures today", value: String(raw.failures ?? "—") },
        { label: "Last started", value: text(raw, "lastStartedAt") },
        { label: "Last duration (ms)", value: String(raw.lastDurationMs ?? "—") },
        { label: "Updated", value: formatDateTime(raw.updatedAt) },
        { label: "Last errors", value: errors.length ? errors.join("\n") : "none" },
      ]} />
      <pre className="mt-4 overflow-x-auto rounded-xl bg-black/30 p-3 text-xs text-slate-300">{steps}</pre>
    </Drawer>
  );
}
