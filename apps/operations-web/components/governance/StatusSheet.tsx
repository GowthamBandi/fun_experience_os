"use client";

import { useEffect, useRef, useState } from "react";
import { Sheet, useToast } from "@/components/pulse";
import { PhraseBox } from "@/components/governance/PhraseBox";
import { Field, TextArea } from "@/components/notifications/FormBits";
import { ORGANIZER_MESSAGE_MAX, RequestIdBook, decisionKey, isConfirmed, type EntityStatus, type EntityType } from "@/lib/console/actions";
import { rethrowForSheet } from "@/lib/console/errors";
import { setEntityStatus } from "@/lib/governance-api";
import { entityVersion, type StatusAction } from "@/lib/organizers";

/** A StatusAction, or any status change with optional copy overrides (risk alerts). */
export type SheetStatusAction = Omit<StatusAction, "status"> & {
  status: EntityStatus;
  /** Toast title prefix; defaults from the status. */
  done?: string;
  /** Sheet title; defaults to "{label} {name}?". */
  question?: string;
  /** Confirm button; defaults to "{label} {noun}". */
  confirm?: string;
};

/**
 * The confirm Sheet for a status change on an organizer, arena or risk alert:
 * reason (10+ chars), optional typed phrase, a stable request id per attempt and the
 * live version at confirm time (`getVersion` is read when confirming, not when opened).
 */
export function StatusSheet({
  action,
  entityType,
  entityId,
  noun,
  name,
  getVersion,
  currentMessage,
  onChanged,
  onClose,
}: {
  /** null keeps the sheet closed. */
  action: SheetStatusAction | null;
  entityType: Extract<EntityType, "organizer" | "arena" | "risk-alert">;
  entityId: string;
  /** Lower-case singular used in copy ("organizer", "arena"). */
  noun: string;
  name: string;
  getVersion: () => unknown;
  /** Organizers: the message they currently see (prefilled when the status stays the same). */
  currentMessage?: string | null;
  onChanged: () => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const [typed, setTyped] = useState("");
  const [message, setMessage] = useState("");
  const book = useRef(new RequestIdBook(entityType));
  const asksMessage = entityType === "organizer" && !!action && (action.status === "active" || action.status === "paused" || action.status === "blocked");
  useEffect(() => {
    setTyped("");
    setMessage("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action]);

  const confirm = async (reason: string) => {
    if (!action) return;
    if (action.phrase && !isConfirmed(typed, action.phrase)) throw new Error(`Type ${action.phrase} to confirm.`);
    // The version is part of the command: a repeat after the record moved is a new command.
    const version = entityVersion(getVersion());
    try {
      const result = await setEntityStatus({
        requestId: book.current.idFor(decisionKey(entityType, entityId, action.status, version, asksMessage ? message.trim() : "")),
        entityType,
        entityId,
        expectedVersion: version,
        status: action.status,
        reason,
        ...(asksMessage && message.trim() ? { messageToOrganizer: message.trim() } : {}),
      });
      book.current.reset();
      onChanged();
      toast.show({
        tone: action.tone === "volt" ? "ok" : "info",
        title: `${action.done ?? (action.status === "active" ? "Reactivated" : action.status === "paused" ? "Paused" : "Blocked")} · ${name}`,
        body: result.replayed ? "This request had already been applied." : `Status is now ${result.status} (version ${result.version}).`,
      });
    } catch (cause) {
      rethrowForSheet(cause, book.current);
    }
  };

  return (
    <Sheet
      open={!!action}
      title={action ? action.question ?? `${action.label} ${name}?` : ""}
      description={action && !action.phrase ? action.consequence : undefined}
      confirmLabel={action ? action.confirm ?? `${action.label} ${noun}` : ""}
      tone={action?.tone ?? "danger"}
      requireReason
      minReason={10}
      reasonLabel="Reason (kept in the audit trail)"
      extra={
        action?.phrase || asksMessage ? (
          <div className="flex flex-col gap-4">
            {action?.phrase ? <PhraseBox phrase={action.phrase} consequence={action.consequence} value={typed} onChange={setTyped} /> : null}
            {asksMessage ? (
              <Field
                label="Message to the organizer (optional)"
                count={message.trim().length}
                max={ORGANIZER_MESSAGE_MAX}
                hint={`Sent to the owner and every active member as an inbox message, and shown in their host workspace${currentMessage ? `. Now: “${currentMessage}”` : ""}.`}
              >
                {({ id, describedBy }) => (
                  <TextArea
                    id={id}
                    aria-describedby={describedBy}
                    rows={3}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={action?.status === "active" ? "e.g. Thanks for sending the documents — you can publish again." : "e.g. We're re-checking your KYC documents. Upload a clear PAN photo from Account."}
                  />
                )}
              </Field>
            ) : null}
          </div>
        ) : undefined
      }
      onConfirm={confirm}
      onClose={onClose}
    />
  );
}
