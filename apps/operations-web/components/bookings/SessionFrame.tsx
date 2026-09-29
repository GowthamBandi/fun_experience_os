"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/format";
import { StatusChip } from "@/components/ui/primitives";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { sessionTitle, venueName } from "@/lib/prototype/selectors/lookups";
import { Breadcrumbs, NotFoundCard, PageFrame } from "./shared";

type Tab = "bookings" | "waitlist" | "money";

const TABS: Array<{ id: Tab | "overview"; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "bookings", label: "Bookings" },
  { id: "waitlist", label: "Waitlist" },
  { id: "money", label: "Money" },
];

/**
 * Frame for the session's bookings, waitlist and money tabs: access guard,
 * not-found state, breadcrumb, header and tab links.
 */
export function SessionFrame({ sessionId, current, sub, right, children }: { sessionId: string; current: Tab; sub: string; right?: ReactNode; children: ReactNode }) {
  const { state, canAccess } = useStore();
  const session = state.sessions.find((s) => s.id === sessionId);

  if (!canAccess(`/missions/${sessionId}/${current}`)) return <PermissionDenied module="Sessions" />;
  if (current === "money" && !canAccess("/money") && !canAccess("/bookings")) return <PermissionDenied module="Session money" />;

  if (!session) {
    return (
      <PageFrame narrow>
        <Breadcrumbs items={[{ label: "Sessions", href: "/missions" }, { label: "Not found" }]} />
        <NotFoundCard title="Session not found" line={`There is no session with the id “${sessionId}”.`} backHref="/missions" backLabel="Back to sessions" />
      </PageFrame>
    );
  }

  const title = sessionTitle(state, session.id);
  const label = TABS.find((t) => t.id === current)?.label ?? "";

  return (
    <PageFrame>
      <Breadcrumbs items={[{ label: "Sessions", href: "/missions" }, { label: title, href: `/missions/${session.id}/overview` }, { label }]} />
      <PageHeader
        overline={`${session.date} · ${session.startTime} · ${venueName(state, session.venueId)}`}
        title={`${title} — ${label.toLowerCase()}`}
        sub={sub}
        right={
          <>
            <StatusChip value={session.status} />
            {right}
          </>
        }
      />
      <nav aria-label="Session sections" className="flex gap-1 overflow-x-auto border-b border-edge">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/missions/${session.id}/${t.id}`}
            aria-current={t.id === current ? "page" : undefined}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors",
              t.id === current ? "border-brand text-brand-ink" : "border-transparent text-ink-mut hover:text-ink-lum"
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {children}
    </PageFrame>
  );
}
