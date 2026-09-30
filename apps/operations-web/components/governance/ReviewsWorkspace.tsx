"use client";

import { useState } from "react";
import { GovernanceModulePage } from "./GovernanceModulePage";
import { ActionPanel, type PrivilegedAction } from "./ActionPanel";
import { Drawer, FieldList, InfoNote } from "./controls";
import { moderateReview, type LiveGovernanceRecord } from "@/lib/governance-api";
import { useGovernanceCollection } from "@/lib/use-governance";
import { formatDateTime, text } from "@/lib/console/records";

export function ReviewsWorkspace() {
  const { records, loading, error, truncated, refresh } = useGovernanceCollection("reviews");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId ? records.find((record) => record.id === selectedId) ?? null : null;
  const hidden = records.filter((record) => record.raw.status === "hidden").length;
  return <>
    <GovernanceModulePage
      eyebrow="Trust"
      title="Reviews"
      description="Verified-attendee reviews of organizer events. Hide reviews that break policy (abuse, personal data, off-topic) or restore them. Ratings aggregates update server-side; every decision is audited."
      metricLabel="Hidden reviews"
      metricValue={loading ? "…" : String(hidden)}
      records={records}
      loading={loading}
      error={error}
      truncated={truncated}
      onRetry={refresh}
      primaryAction="Moderate"
      onAction={(record) => setSelectedId(record.id)}
      emptyMessage="No reviews yet. Reviews appear after attendees who checked in rate an event."
    />
    {selectedId && <ReviewDrawer record={selected} onRefresh={refresh} onClose={() => setSelectedId(null)} />}
  </>;
}

function ReviewDrawer({ record, onClose, onRefresh }: { record: LiveGovernanceRecord | null; onClose: () => void; onRefresh: () => void }) {
  if (!record) return <Drawer label="Review unavailable" eyebrow="Review" title="Review unavailable" onClose={onClose}><InfoNote tone="warn">This review is no longer in the live list.</InfoNote></Drawer>;
  const raw = record.raw;
  const status = String(raw.status ?? "published");
  const moderation = raw.moderation && typeof raw.moderation === "object" ? (raw.moderation as Record<string, unknown>) : null;
  const make = (next: "published" | "hidden"): PrivilegedAction => ({
    key: next,
    label: next === "hidden" ? "Hide review" : "Publish review",
    variant: next === "hidden" ? "danger" : "primary",
    reasonMin: 10,
    consequence: next === "hidden"
      ? "Removes the review from PULSE and from the organizer's and experience's rating aggregates."
      : "Makes the review visible again and restores it to the rating aggregates.",
    disabledReason: status === next ? `Already ${next}.` : null,
    execute: async ({ requestId, reason }) => {
      const result = await moderateReview({ requestId, reviewId: record.id, status: next, reason });
      return { message: `Review ${result.status === "hidden" ? "hidden" : "published"}.` };
    },
  });
  return (
    <Drawer label={`Review ${record.id}`} eyebrow={`Review · ${record.id}`} title={record.primary} subtitle={`Status ${status}`} onClose={onClose}>
      <blockquote className="rounded-xl border border-white/8 bg-[#111b28] p-4 text-sm leading-6 text-slate-200">{typeof raw.comment === "string" && raw.comment.trim() ? raw.comment : <span className="text-slate-500">(no comment)</span>}</blockquote>
      <FieldList fields={[
        { label: "Rating", value: typeof raw.rating === "number" ? `${raw.rating} / 5` : "—" },
        { label: "Author", value: text(raw, "authorName") },
        { label: "Event", value: text(raw, "eventId") },
        { label: "Experience", value: text(raw, "experienceId") },
        { label: "Organizer", value: text(raw, "orgId") },
        { label: "Status", value: status },
        { label: "Last moderation", value: moderation ? `${text(moderation, "reason")} · ${formatDateTime(moderation.at)}` : "—" },
        { label: "Updated", value: formatDateTime(raw.updatedAt) },
      ]} />
      <ActionPanel actions={[make("hidden"), make("published")]} commandPrefix="review" onRefresh={onRefresh} />
    </Drawer>
  );
}
