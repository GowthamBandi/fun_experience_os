"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Flag, LifeBuoy, Send } from "lucide-react";
import { Badge, Button, Card, Empty, ErrorState, PageHeader, SkeletonRows, useToast, type BadgeTone } from "@/components/pulse";
import { PageContainer } from "@/components/shell/PageContainer";
import { useAdminSession } from "@/lib/firebase/auth";
import { can } from "@/lib/console/capabilities";
import { newRequestId } from "@/lib/console/actions";
import { formatDateTime } from "@/lib/console/records";
import { isOverdue } from "@/lib/console/support";
import { cn } from "@/lib/format";
import { respondSupportRequest, subscribeSupportRequests, type SupportStatus } from "@/lib/governance-api";

type Raw = Record<string, unknown>;
interface Message { from: "customer" | "pulse"; body: string; at: unknown; auto?: boolean }
interface Row {
  id: string;
  uid: string;
  audience: string;
  orgId: string | null;
  kind: "help" | "report";
  subject: string;
  status: SupportStatus;
  priority: "normal" | "high";
  lastFrom: string;
  context: { type: string; id: string | null };
  messages: Message[];
  updatedAt: unknown;
  /** Resolve-by date (one month from arrival, E-Commerce Rules 2020). */
  resolveBy: unknown;
}



const STATUS: Record<SupportStatus, { label: string; tone: BadgeTone }> = {
  open: { label: "Needs reply", tone: "warn" },
  "waiting-on-customer": { label: "Waiting on them", tone: "info" },
  resolved: { label: "Resolved", tone: "ok" },
};

const FILTERS = [
  { key: "open", label: "Needs reply" },
  { key: "waiting-on-customer", label: "Waiting" },
  { key: "resolved", label: "Resolved" },
  { key: "all", label: "All" },
] as const;
type Filter = (typeof FILTERS)[number]["key"];

function toRow(id: string, r: Raw): Row {
  const c = (r.context && typeof r.context === "object" ? r.context : {}) as Raw;
  return {
    id,
    uid: String(r.uid ?? ""),
    audience: String(r.audience ?? "customer"),
    orgId: typeof r.orgId === "string" ? r.orgId : null,
    kind: r.kind === "report" ? "report" : "help",
    subject: String(r.subject ?? "Support"),
    status: (["open", "waiting-on-customer", "resolved"].includes(String(r.status)) ? r.status : "open") as SupportStatus,
    priority: r.priority === "high" ? "high" : "normal",
    lastFrom: String(r.lastFrom ?? "customer"),
    context: { type: String(c.type ?? "none"), id: typeof c.id === "string" ? c.id : null },
    messages: Array.isArray(r.messages) ? (r.messages as Message[]) : [],
    updatedAt: r.updatedAt,
    resolveBy: r.resolveBy,
  };
}

/**
 * Support inbox: help requests and problem reports from customers and
 * organizers (backend: support/requests.ts). High-priority (safety) reports
 * sort first; every reply notifies the person in the PULSE app.
 */
export function SupportView() {
  const { consoleRole } = useAdminSession();
  const toast = useToast();
  const canReply = can(consoleRole, "governance.decide");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("open");
  const [selected, setSelected] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setError(null);
    try {
      return subscribeSupportRequests(
        (r, t) => {
          setRows(r.map((x) => toRow(x.id, x.raw)));
          setTruncated(t);
        },
        (m) => setError(m),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return undefined;
    }
  }, [attempt]);

  const shown = useMemo(() => {
    const list = (rows ?? []).filter((r) => filter === "all" || r.status === filter);
    const rank = (r: Row) => (isOverdue(r) ? 0 : r.priority === "high" ? 1 : 2);
    return [...list].sort((a, b) => rank(a) - rank(b));
  }, [rows, filter]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows?.length ?? 0 };
    for (const r of rows ?? []) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);
  const current = shown.find((r) => r.id === selected) ?? (rows ?? []).find((r) => r.id === selected) ?? null;

  const act = async (status: SupportStatus, message: string | null) => {
    if (!current) return;
    setBusy(true);
    try {
      await respondSupportRequest({ requestId: newRequestId("support"), id: current.id, message, status });
      setReply("");
      toast.show({ tone: "ok", title: message ? "Reply sent" : `Marked ${STATUS[status].label.toLowerCase()}`, body: "The person is notified in the PULSE app." });
    } catch (e) {
      toast.show({ tone: "err", title: "That didn’t go through", body: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader overline="Trust" title="Support" subtitle="Help requests and problem reports from customers and organizers. Safety reports sort first." />
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter support requests">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            role="tab"
            aria-selected={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "focus-ring inline-flex h-9 items-center gap-2 rounded-pill border px-3.5 text-[13px] font-semibold",
              filter === f.key ? "border-primary bg-[rgba(142,114,255,0.16)] text-text" : "border-line text-text-2 hover:text-text",
            )}
          >
            {f.label}
            <span className="text-text-3">{counts[f.key] ?? 0}</span>
          </button>
        ))}
      </div>

      {error ? <ErrorState message={error} onRetry={() => setAttempt((n) => n + 1)} /> : null}
      {!error && rows === null ? <SkeletonRows rows={5} /> : null}
      {!error && rows !== null ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          <Card className="p-2" data-testid="support-list">
            {shown.length === 0 ? (
              <Empty emoji="💬" title="Nothing here" body="Requests people send from the PULSE app show up here." />
            ) : (
              <ul className="flex flex-col">
                {shown.map((r) => {
                  // Preview the latest real message: the automatic acknowledgement
                  // says nothing about what the person needs.
                  const real = r.messages.filter((m) => !m.auto);
                  const last = real[real.length - 1] ?? r.messages[r.messages.length - 1];
                  return (
                    <li key={r.id}>
                      <button
                        onClick={() => setSelected(r.id)}
                        className={cn(
                          "focus-ring flex w-full flex-col gap-1 rounded-control px-3 py-2.5 text-left hover:bg-[rgba(255,255,255,0.04)]",
                          selected === r.id && "bg-[rgba(142,114,255,0.12)]",
                        )}
                      >
                        <span className="flex items-center gap-2">
                          {r.kind === "report" ? <Flag aria-hidden className="h-4 w-4 text-err" /> : <LifeBuoy aria-hidden className="h-4 w-4 text-text-3" />}
                          <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-text">{r.subject}</span>
                          {r.priority === "high" ? <Badge tone="err">High</Badge> : null}
                          {isOverdue(r) ? <Badge tone="err">Overdue</Badge> : null}
                          <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                        </span>
                        <span className="truncate text-[12.5px] text-text-2">{last?.body ?? ""}</span>
                        <span className="text-[11.5px] text-text-3">{r.audience === "organizer" ? "Organizer" : "Customer"} · {formatDateTime(r.updatedAt)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {truncated ? <p className="px-3 py-2 text-[12px] text-text-3">Showing the 300 most recent.</p> : null}
          </Card>

          <Card className="flex min-h-[320px] flex-col p-5" data-testid="support-detail">
            {!current ? (
              <Empty emoji="👈" title="Pick a request" body="Open one to read it and reply." />
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="mr-auto font-display text-[20px] font-bold text-text">{current.subject}</h2>
                  {current.priority === "high" ? <Badge tone="err">High priority</Badge> : null}
                  <Badge tone={STATUS[current.status].tone}>{STATUS[current.status].label}</Badge>
                </div>
                <p className="mt-1 text-[12.5px] text-text-3">
                  {current.kind === "report" ? "Problem report" : "Help request"} · {current.audience === "organizer" ? `Organizer ${current.orgId ?? ""}` : "Customer"} · user {current.uid}
                  {current.context.type !== "none" ? ` · ${current.context.type} ${current.context.id}` : ""}
                  {current.resolveBy ? ` · resolve by ${formatDateTime(current.resolveBy)}` : ""}
                  {isOverdue(current) ? " · OVERDUE" : ""}
                </p>
                <ol className="mt-4 flex flex-1 flex-col gap-2.5">
                  {current.messages.map((m, i) => (
                    <li
                      key={i}
                      className={cn(
                        "max-w-[85%] rounded-control px-3.5 py-2.5 text-[13.5px]",
                        m.from === "pulse" ? "self-end bg-[rgba(142,114,255,0.16)] text-text" : "self-start border border-line-soft text-text",
                      )}
                    >
                      <p className="whitespace-pre-wrap">{m.body}</p>
                      <p className="mt-1 text-[11px] text-text-3">{m.from === "pulse" ? (m.auto ? "PULSE · automatic acknowledgement" : "PULSE") : "Them"} · {formatDateTime(m.at)}</p>
                    </li>
                  ))}
                </ol>
                {canReply ? (
                  <div className="mt-4 flex flex-col gap-2.5">
                    <label className="text-[12.5px] font-semibold text-text-2" htmlFor="support-reply">Reply</label>
                    <textarea
                      id="support-reply"
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      rows={3}
                      maxLength={4000}
                      className="focus-ring rounded-control border border-line bg-surface px-3 py-2 text-[13.5px] text-text"
                      placeholder="Write a reply. The person sees it in the app and gets a notification."
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button variant="volt" size="sm" icon={<Send />} disabled={busy || !reply.trim()} onClick={() => void act("waiting-on-customer", reply.trim())}>
                        Send reply
                      </Button>
                      <Button variant="ghost" size="sm" disabled={busy || !reply.trim()} onClick={() => void act("resolved", reply.trim())}>
                        Reply and resolve
                      </Button>
                      {current.status !== "resolved" ? (
                        <Button variant="ghost" size="sm" icon={<CheckCircle2 />} disabled={busy} onClick={() => void act("resolved", null)}>
                          Resolve without reply
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" disabled={busy} onClick={() => void act("open", null)}>Reopen</Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 text-[12.5px] text-text-3">Read-only for your role.</p>
                )}
              </>
            )}
          </Card>
        </div>
      ) : null}
    </PageContainer>
  );
}
