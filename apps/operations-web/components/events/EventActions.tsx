"use client";

import { useEffect, useRef, useState } from "react";
import { Ban, Lock } from "lucide-react";
import { Button, Sheet, Tooltip, useToast } from "@/components/pulse";
import { PhraseBox } from "@/components/governance/PhraseBox";
import { CONFIRM_PHRASES, RequestIdBook, isConfirmed } from "@/lib/console/actions";
import { ROLE_LABEL, can, type ConsoleRole } from "@/lib/console/capabilities";
import { rethrowForSheet } from "@/lib/console/errors";
import { cancelEventKey, cancelEventToast, isCancellable } from "@/lib/events";
import { eventBadge } from "@/lib/organizers";
import { adminCancelEvent } from "@/lib/governance-api";

const CONSEQUENCE =
  "Emergency intervention: cancels this organizer's event, voids every ticket and issues a 100% refund to every attendee with a confirmed booking. Attendees are notified. This cannot be undone.";

/**
 * Event 360 actions. Only the emergency cancellation is offered: setMarketplaceEntityStatus would
 * overwrite the event's lifecycle status with "paused"/"blocked", which the booking, phase and
 * cancel commands don't understand (see the task 12 report), so Pause/Block are left out.
 */
export function EventActions({
  eventId,
  title,
  status,
  role,
  onChanged,
}: {
  eventId: string;
  title: string;
  status: string | null;
  role: ConsoleRole | null;
  /** Called after a successful cancel so one-shot lists (bookings, audit) re-read. */
  onChanged: () => void;
}) {
  const toast = useToast();
  const permitted = can(role, "governance.decide");
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const book = useRef(new RequestIdBook("event"));

  useEffect(() => {
    if (open) setTyped("");
  }, [open]);

  if (!permitted) {
    return (
      <Tooltip label={`${role ? ROLE_LABEL[role] : "Your role"} can view events but not cancel them.`} side="bottom">
        <span tabIndex={0} className="focus-ring inline-flex h-10 items-center gap-2 rounded-pill border border-line px-4 text-[13px] font-semibold text-text-3" data-testid="actions-read-only">
          <Lock aria-hidden className="h-4 w-4" />
          Read-only
        </span>
      </Tooltip>
    );
  }

  const cancellable = isCancellable(status);
  const why = cancellable ? null : status === "cancelled" ? "This event is already cancelled." : `The event is ${eventBadge(status).label.toLowerCase()}, so it can't be cancelled.`;

  const confirm = async (reason: string) => {
    if (!isConfirmed(typed, CONFIRM_PHRASES.cancelEvent)) throw new Error(`Type ${CONFIRM_PHRASES.cancelEvent} to confirm.`);
    try {
      const result = await adminCancelEvent({ requestId: book.current.idFor(cancelEventKey(eventId, status)), eventId, reason });
      book.current.reset();
      onChanged();
      toast.show(cancelEventToast(result, title));
    } catch (cause) {
      rethrowForSheet(cause, book.current);
    }
  };

  const button = (
    <Button
      variant="danger"
      icon={<Ban />}
      aria-disabled={!cancellable || undefined}
      className={cancellable ? undefined : "cursor-not-allowed opacity-50"}
      onClick={() => cancellable && setOpen(true)}
      data-testid="cancel-event"
    >
      Cancel event
    </Button>
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-2" data-testid="event-actions">
        {why ? <Tooltip label={why} side="bottom">{button}</Tooltip> : button}
      </div>
      <Sheet
        open={open}
        title={`Cancel ${title}?`}
        confirmLabel="Cancel event"
        tone="danger"
        requireReason
        minReason={10}
        reasonLabel="Reason (kept on the event and in the audit trail)"
        extra={<PhraseBox phrase={CONFIRM_PHRASES.cancelEvent} consequence={CONSEQUENCE} value={typed} onChange={setTyped} />}
        onConfirm={confirm}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
