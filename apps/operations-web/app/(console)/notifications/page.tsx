"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, BellRing, CheckCheck, Info, LogIn, MailOpen, Mail, SquareX, Zap } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { Button, IconButton } from "@/components/ui/primitives";
import { SearchInput } from "@/components/ui/fields";
import { useToast } from "@/components/ui/toast";
import { EmptyPanel, PageShell, Tabs } from "@/components/setup/kit";
import type { Signal } from "@/lib/prototype/entities";

const KINDS = ["alert", "join", "strike", "close", "system"] as const;
const KIND_META: Record<Signal["kind"], { label: string; icon: typeof Info; tone: string }> = {
  alert: { label: "Alert", icon: AlertTriangle, tone: "bg-red-50 text-red-600" },
  join: { label: "Booking", icon: LogIn, tone: "bg-emerald-50 text-emerald-600" },
  strike: { label: "Strike", icon: Zap, tone: "bg-violet-50 text-violet-600" },
  close: { label: "Closed", icon: SquareX, tone: "bg-slate-100 text-slate-600" },
  system: { label: "System", icon: Info, tone: "bg-sky-50 text-sky-600" },
};

const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function dayKey(s: Signal): string {
  if (s.atIso) return localDay(new Date(s.atIso));
  const head = s.at.split(",")[0].trim().toLowerCase();
  const d = new Date();
  if (head === "yesterday") d.setDate(d.getDate() - 1);
  else if (head !== "today" && !/^\d{1,2}:\d{2}$/.test(head)) return "earlier";
  return localDay(d);
}

function dayLabel(key: string): string {
  if (key === "earlier") return "Earlier";
  const now = new Date();
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (key === localDay(now)) return "Today";
  if (key === localDay(y)) return "Yesterday";
  return new Date(`${key}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

const timeOf = (s: Signal) => (s.atIso ? new Date(s.atIso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : s.at.includes(",") ? s.at.split(",")[1].trim() : /^\d{1,2}:\d{2}$/.test(s.at) ? s.at : "");

export default function NotificationsPage() {
  const { canAccess, state, markAllRead, markSignalRead, markSignalUnread } = useStore();
  const toast = useToast();
  const [view, setView] = useState<"all" | "unread">("all");
  const [kind, setKind] = useState<(typeof KINDS)[number] | "all">("all");
  const [query, setQuery] = useState("");

  const signals = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.signals.filter((s) => (view === "all" || !s.read) && (kind === "all" || s.kind === kind) && (!q || `${s.message} ${s.sessionId ?? ""}`.toLowerCase().includes(q)));
  }, [state.signals, view, kind, query]);

  const groups = useMemo(() => {
    const out = new Map<string, Signal[]>();
    for (const s of signals) {
      const k = dayKey(s);
      out.set(k, [...(out.get(k) ?? []), s]);
    }
    return [...out.entries()].sort((a, b) => (a[0] === "earlier" ? 1 : b[0] === "earlier" ? -1 : b[0].localeCompare(a[0])));
  }, [signals]);

  if (!canAccess("/notifications")) return <PermissionDenied module="Notifications" />;
  const unread = state.signals.filter((s) => !s.read).length;
  const sessionHref = (id?: string) => (id && canAccess("/missions") && state.sessions.some((x) => x.id === id) ? `/missions/${id}` : undefined);
  const sessionName = (id: string) => {
    const s = state.sessions.find((x) => x.id === id);
    return s ? `${state.templates.find((t) => t.id === s.templateId)?.name ?? "Session"} · ${s.date} ${s.startTime}` : id;
  };

  return (
    <PageShell narrow>
      <PageHeader
        overline="Control"
        title="Notifications"
        sub="Alerts and updates raised by bookings, sessions, setup and safety changes. Newest first."
        right={
          <Button
            variant="secondary"
            disabled={unread === 0}
            onClick={() => {
              markAllRead();
              toast.success("All notifications marked as read");
            }}
          >
            <CheckCheck className="h-4 w-4" /> Mark all read
          </Button>
        }
      />

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Tabs tabs={[{ id: "all" as const, label: "All", count: state.signals.length }, { id: "unread" as const, label: "Unread", count: unread }]} value={view} onChange={setView} />
          <div className="sm:w-72"><SearchInput value={query} onChange={setQuery} placeholder="Search notifications" /></div>
        </div>
        <Tabs tabs={[{ id: "all" as const, label: "All types" }, ...KINDS.map((k) => ({ id: k, label: KIND_META[k].label, count: state.signals.filter((x) => x.kind === k).length }))]} value={kind} onChange={setKind} />
      </div>

      {state.signals.length === 0 ? (
        <EmptyPanel icon={<BellRing className="h-5 w-5" />} title="No notifications yet" line="You will see alerts here when bookings, sessions, setup or safety records change." />
      ) : signals.length === 0 ? (
        <EmptyPanel icon={<MailOpen className="h-5 w-5" />} title={view === "unread" ? "You're all caught up" : "Nothing matches"} line={view === "unread" ? "Every notification has been read." : "Clear the search or choose another type."} />
      ) : (
        <div className="space-y-6">
          {groups.map(([key, items]) => (
            <section key={key}>
              <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.06em] text-ink-mut">{dayLabel(key)}</h2>
              <ul className="overflow-hidden rounded-panel border border-edge bg-white shadow-panel">
                {items.map((s) => {
                  const meta = KIND_META[s.kind] ?? KIND_META.system;
                  const href = sessionHref(s.sessionId);
                  return (
                    <li key={s.id} className={cn("flex items-start gap-3 border-b border-slate-100 px-4 py-3.5 last:border-0", !s.read && "bg-brand-subtle/30")}>
                      <span className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", meta.tone)} aria-hidden>
                        <meta.icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={cn("text-sm leading-6", s.read ? "text-ink-sec" : "font-semibold text-ink-lum")}>{s.message}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-mut">
                          <span>{meta.label}</span>
                          {timeOf(s) && (
                            <>
                              <span aria-hidden>·</span>
                              <span>{timeOf(s)}</span>
                            </>
                          )}
                          {s.sessionId && (
                            <>
                              <span aria-hidden>·</span>
                              {href ? (
                                <Link href={href} onClick={() => !s.read && markSignalRead(s.id)} className="font-semibold text-brand hover:underline">
                                  {sessionName(s.sessionId)}
                                </Link>
                              ) : (
                                <span>{sessionName(s.sessionId)}</span>
                              )}
                            </>
                          )}
                        </p>
                      </div>
                      {!s.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand" aria-label="Unread" />}
                      <IconButton label={s.read ? "Mark as unread" : "Mark as read"} onClick={() => (s.read ? markSignalUnread(s.id) : markSignalRead(s.id))}>
                        {s.read ? <Mail className="h-4 w-4" /> : <MailOpen className="h-4 w-4" />}
                      </IconButton>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </PageShell>
  );
}
