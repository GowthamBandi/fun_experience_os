import { Receipt } from "lucide-react";
import { Badge, Card } from "@/components/pulse";
import { cancellationView } from "@/lib/cancellation";

/**
 * Event 360: the event's cancellation rules (copied from its experience) in the words customers
 * read, flagged when cancelling isn't allowed or closes more than 48 hours before the start.
 */
export function CancellationPanel({ event }: { event: Record<string, unknown> }) {
  const v = cancellationView(event);
  return (
    <Card as="section" aria-label="Cancellation rules" data-testid="event-cancellation">
      <div className="flex flex-wrap items-center gap-2">
        <Receipt aria-hidden className="h-4 w-4 text-text-3" />
        <h2 className="mr-1 font-display text-[15px] font-bold tracking-[-0.01em] text-text">Cancellation rules</h2>
        <Badge tone={v.flags.length ? "warn" : "muted"}>{v.label}</Badge>
        {v.flags.map((f) => (
          <Badge key={f.key} tone="warn">{f.label}</Badge>
        ))}
      </div>
      <p className="mt-2.5 text-[13.5px] leading-[1.5] text-text">{v.summary}</p>
      <p className="mt-1.5 text-[12px] leading-[1.45] text-text-3">
        New bookings agree to these rules; each booking keeps the rules it was made under. If the organizer or PULSE cancels the event, everyone gets a full refund.
      </p>
    </Card>
  );
}
