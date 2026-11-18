"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { CheckCircle2, FileSignature, Megaphone, ShieldAlert, Users } from "lucide-react";
import { Badge, Card, Empty } from "@/components/pulse";
import { formatDateTime } from "@/lib/console/records";
import { getFirebaseClient } from "@/lib/firebase/client";
import { useLiveDocument } from "@/lib/use-governance";

type Raw = Record<string, unknown>;

/** The safety checklist the app shows on event day (EventDay → Safety). */
const CHECKS: Record<string, string> = {
  firstAid: "First-aid kit on site and checked",
  briefing: "Safety briefing given to everyone",
  exits: "Exits and meeting point identified",
  contacts: "Emergency contacts ready",
};

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2 text-text">
        <span aria-hidden className="text-text-3 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        <h3 className="font-display text-[15px] font-bold">{title}</h3>
      </div>
      {children}
    </Card>
  );
}

/**
 * What the organizer agreed to and did for this event: the Organizer Event
 * Agreement accepted at submission, the event-day record (teams, safety
 * checklist, incidents) and the messages sent to attendees.
 */
export function SafetyTab({ eventId, event }: { eventId: string; event: Raw | null }) {
  const day = useLiveDocument("eventDays", eventId);
  const [messages, setMessages] = useState<Raw[] | null>(null);
  const [msgError, setMsgError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(getFirebaseClient().firestore, "eventMessages"), where("eventId", "==", eventId));
    return onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Raw);
        rows.sort((a, b) => millis(b.createdAt) - millis(a.createdAt));
        setMessages(rows);
      },
      (e) => setMsgError(e.message),
    );
  }, [eventId]);

  const agreement = event?.organizerAgreement && typeof event.organizerAgreement === "object" ? (event.organizerAgreement as Raw) : null;
  const d = day.data;
  const checks = Array.isArray(d?.safetyChecks) ? (d!.safetyChecks as string[]) : [];
  const incidents = Array.isArray(d?.incidents) ? (d!.incidents as Raw[]) : [];

  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="safety-tab">
      <Section icon={<FileSignature />} title="Organizer Event Agreement">
        {agreement ? (
          <p className="text-[13.5px] text-text-2">
            <Badge tone="ok">Accepted</Badge>{" "}
            Version <strong className="text-text">{String(agreement.version ?? "—")}</strong> on {formatDateTime(agreement.acceptedAt)} by {String(agreement.acceptedBy ?? "—")}.
            The organizer took full responsibility for running this event safely and lawfully.
          </p>
        ) : (
          <p className="text-[13.5px] text-text-2">
            <Badge tone="warn">Not recorded</Badge> Submitted before agreements were required. Ask the organizer to resubmit before the next date.
          </p>
        )}
      </Section>

      <Section icon={<Users />} title="Teams">
        {d?.teamsRevealed ? (
          <p className="text-[13.5px] text-text-2"><Badge tone="ok">Revealed</Badge> {String(d.teamCount ?? "—")} teams, revealed {formatDateTime(d.revealedAt)}.</p>
        ) : d?.teamsLocked ? (
          <p className="text-[13.5px] text-text-2"><Badge tone="info">Locked</Badge> Teams drawn and locked, not revealed yet.</p>
        ) : (
          <p className="text-[13.5px] text-text-3">No teams drawn.</p>
        )}
      </Section>

      <Section icon={<CheckCircle2 />} title={`Safety checklist · ${checks.length} of ${Object.keys(CHECKS).length}`}>
        <ul className="flex flex-col gap-1.5 text-[13.5px]">
          {Object.entries(CHECKS).map(([key, label]) => (
            <li key={key} className={checks.includes(key) ? "text-text" : "text-text-3"}>
              {checks.includes(key) ? "✓" : "○"} {label}
            </li>
          ))}
        </ul>
      </Section>

      <Section icon={<ShieldAlert />} title={`Incidents · ${incidents.length}`}>
        {incidents.length === 0 ? (
          <p className="text-[13.5px] text-text-3">None logged.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {incidents.map((i, n) => (
              <li key={n} className="rounded-control border border-line-soft px-3 py-2 text-[13.5px]">
                <Badge tone={i.severity === "high" ? "err" : i.severity === "medium" ? "warn" : "info"}>{String(i.severity ?? "low")}</Badge>{" "}
                <span className="text-text">{String(i.note ?? i.text ?? "")}</span>
                <p className="mt-1 text-[11.5px] text-text-3">{formatDateTime(i.at)}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="lg:col-span-2">
        <Section icon={<Megaphone />} title={`Messages to attendees · ${messages?.length ?? "…"}`}>
          {msgError ? (
            <p className="text-[13px] text-err">{msgError}</p>
          ) : messages && messages.length === 0 ? (
            <Empty emoji="📭" title="No messages" body="Messages the organizer sends to everyone booked appear here." />
          ) : (
            <ul className="flex flex-col gap-2.5">
              {(messages ?? []).map((m) => (
                <li key={String(m.id)} className="rounded-control border border-line-soft px-3 py-2 text-[13.5px] text-text">
                  <p className="whitespace-pre-wrap">{String(m.text ?? "")}</p>
                  <p className="mt-1 text-[11.5px] text-text-3">{formatDateTime(m.createdAt)} · {String(m.recipients ?? 0)} people · by {String(m.createdBy ?? "—")}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

function millis(t: unknown): number {
  const o = t as { toMillis?: () => number; seconds?: number } | null;
  return o?.toMillis?.() ?? (typeof o?.seconds === "number" ? o.seconds * 1000 : 0);
}
