"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { Sheet, useToast } from "@/components/pulse";
import { RequestIdBook, decisionKey } from "@/lib/console/actions";
import { rethrowForSheet } from "@/lib/console/errors";
import { setAnnouncementStatus } from "@/lib/notifications-api";
import { ACTION_META, audienceSummary, type AnnouncementAction, type AnnouncementRow } from "@/lib/notifications";

/** Confirm + reason for one announcement status action (publish / pause / resume / end / duplicate / archive). */
export function AnnouncementActionSheet({ target, onClose, onDone }: { target: { row: AnnouncementRow; action: AnnouncementAction } | null; onClose: () => void; onDone?: (result: { id: string; status: string }, action: AnnouncementAction) => void }) {
  const toast = useToast();
  const router = useRouter();
  const book = useRef(new RequestIdBook("ann"));
  const meta = target ? ACTION_META[target.action] : null;

  const confirm = async (reason: string) => {
    if (!target) return;
    const { row, action } = target;
    try {
      const result = await setAnnouncementStatus({
        requestId: book.current.idFor(decisionKey(action, row.id, row.status, row.updatedAt?.getTime() ?? 0, reason)),
        id: row.id,
        action,
        reason,
      });
      book.current.reset();
      toast.show({ tone: "ok", title: `${ACTION_META[action].done} · ${row.title}`, body: action === "duplicate" ? "A new draft is ready to edit." : `Status is now ${result.status}.` });
      onDone?.(result, action);
      if (action === "duplicate" && result.id) router.push(`/notifications/announcements/${encodeURIComponent(result.id)}/edit`);
    } catch (cause) {
      rethrowForSheet(cause, book.current);
    }
  };

  return (
    <Sheet
      open={!!target}
      title={target && meta ? `${meta.verb} “${target.row.title}”?` : ""}
      description={target && meta ? `${meta.consequence} Audience: ${audienceSummary(target.row.audience)}.` : undefined}
      confirmLabel={meta ? meta.label : ""}
      tone={meta?.tone ?? "volt"}
      requireReason
      minReason={3}
      reasonLabel="Reason (kept in the audit trail)"
      onConfirm={confirm}
      onClose={onClose}
    />
  );
}
