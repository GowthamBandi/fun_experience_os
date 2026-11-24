"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Ban, History, Lock, MessageSquareText, Pause, Play, ShieldCheck } from "lucide-react";
import { Badge, Button, Card, ErrorState, Sheet, Skeleton, Tooltip, useToast } from "@/components/pulse";
import { PhraseBox } from "@/components/governance/PhraseBox";
import { Field, TextArea, TextInput } from "@/components/notifications/FormBits";
import { ACCOUNT_BADGE, ACCOUNT_LIMITS, accountActions, accountStateOf, accountStatusLine, buildAccountStatusPayload, statusHistory, type AccountAction } from "@/lib/accounts";
import { RequestIdBook, decisionKey, isConfirmed } from "@/lib/console/actions";
import { ROLE_LABEL, can, type ConsoleRole } from "@/lib/console/capabilities";
import { rethrowForSheet } from "@/lib/console/errors";
import { formatDateTime } from "@/lib/console/records";
import { cn, relTime } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { istInputToIso, toIstInput } from "@/lib/notifications";
import { personAuditQuery, setAccountStatus } from "@/lib/notifications-api";
import { useLiveDocument } from "@/lib/use-governance";
import { useBoundedQuery } from "@/lib/use-query";

const ICON = { active: Play, paused: Pause, blocked: Ban } as const;

/** The person's account status as a badge (accountStatus/{uid}; no document = active). */
export function AccountStatusBadge({ uid }: { uid: string }) {
  const doc = useLiveDocument("accountStatus", uid);
  const now = useNow();
  if (doc.loading || doc.error) return null;
  const state = accountStateOf(doc.data, now ?? new Date());
  const b = ACCOUNT_BADGE[state.status];
  return (
    <Badge tone={b.tone} className="text-[12px]">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {accountStatusLine(state)}
    </Badge>
  );
}

/**
 * Pause / block / re-activate with a reason, an optional message the person
 * sees and an optional end date; shows the internal reason and the history.
 */
export function AccountControls({ uid, name, role }: { uid: string; name: string; role: ConsoleRole | null }) {
  const toast = useToast();
  const now = useNow(30_000);
  const permitted = can(role, "accounts.moderate");
  const status = useLiveDocument("accountStatus", uid);
  const priv = useLiveDocument(permitted ? "accountStatusPrivate" : null, uid);
  const audits = useBoundedQuery(`person-audit|${uid}`, () => personAuditQuery(uid), (id, data) => ({ id, raw: { ...data } }), 100);
  const [open, setOpen] = useState<AccountAction | null>(null);
  const [message, setMessage] = useState("");
  const [until, setUntil] = useState("");
  const [typed, setTyped] = useState("");
  const book = useRef(new RequestIdBook("acct"));

  const state = accountStateOf(status.data, now ?? new Date());
  const history = useMemo(() => statusHistory(priv.data, audits.rows), [priv.data, audits.rows]);
  const reason = typeof priv.data?.reason === "string" && priv.data.reason.trim() ? priv.data.reason : null;

  useEffect(() => {
    if (!open) return;
    setMessage(open.status === state.status ? state.messageToUser ?? "" : "");
    setUntil(open.status !== "active" && open.status === state.status ? toIstInput(state.until) : "");
    setTyped("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const confirm = async (why: string) => {
    if (!open) return;
    if (open.phrase && !isConfirmed(typed, open.phrase)) throw new Error(`Type ${open.phrase} to confirm.`);
    const untilIso = until.trim() ? istInputToIso(until) : null;
    if (until.trim() && !untilIso) throw new Error("The end date isn't valid.");
    let payload;
    try {
      payload = buildAccountStatusPayload({ requestId: "pending", uid, status: open.status, reason: why, messageToUser: message, until: untilIso, now: new Date() });
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }
    try {
      const requestId = book.current.idFor(decisionKey(uid, open.status, why, payload.messageToUser ?? "", payload.until ?? "", state.updatedAt?.getTime() ?? 0));
      const r = await setAccountStatus({ ...payload, requestId });
      book.current.reset();
      toast.show({
        tone: r.authSynced === false ? "err" : open.status === "active" ? "ok" : "info",
        title: `${open.done} · ${name}`,
        body: r.authSynced === false ? "Saved, but the sign-in lock couldn't be applied. Apply the same status again to retry." : open.status === "blocked" ? "Signed out everywhere; sign-in is disabled." : open.status === "paused" ? "They can look around but can't book." : "Everything works again.",
      });
      audits.retry();
    } catch (cause) {
      rethrowForSheet(cause, book.current);
    }
  };

  const Icon = ICON[state.status];

  return (
    <Card as="section" aria-label="Account controls" className={cn("flex flex-col gap-4", state.status === "blocked" ? "border-[rgba(255,97,120,0.4)]" : state.status === "paused" ? "border-[rgba(255,184,77,0.35)]" : "")}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-[14px]", state.status === "blocked" ? "bg-[rgba(255,97,120,0.16)] text-err" : state.status === "paused" ? "bg-[rgba(255,184,77,0.16)] text-warn" : "bg-[rgba(63,221,154,0.14)] text-ok")}>
            {state.status === "active" ? <ShieldCheck aria-hidden className="h-5 w-5" /> : <Icon aria-hidden className="h-5 w-5" />}
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-[17px] font-bold tracking-[-0.02em] text-text">Account</h2>
            {status.loading ? (
              <Skeleton className="mt-1.5 h-4 w-40 rounded-pill" />
            ) : status.error ? (
              <p className="mt-1 text-[13px] text-err">{status.error}</p>
            ) : (
              <p className="mt-0.5 text-[13.5px] text-text-2">
                <b className="font-semibold text-text">{accountStatusLine(state)}</b>
                {state.status === "paused" ? " — can sign in and contact support, but can't book, join waitlists, review or follow." : state.status === "blocked" ? " — signed out, sign-in disabled, every action refused." : " — no restrictions."}
                {state.lapsed ? <span className="text-text-3"> (the end date passed; the daily job writes it back to active)</span> : null}
              </p>
            )}
          </div>
        </div>
        {permitted ? (
          <div className="flex flex-wrap items-center gap-2">
            {accountActions(state.status).map((a) => {
              const AIcon = ICON[a.status];
              const same = a.status === state.status;
              return (
                <Button key={`${a.status}-${same}`} variant={a.status === "active" ? "volt" : a.status === "blocked" ? "danger" : "ghost"} icon={<AIcon />} onClick={() => setOpen(a)}>
                  {same ? `Update ${a.label.toLowerCase()}` : a.label}
                </Button>
              );
            })}
          </div>
        ) : (
          <Tooltip label={`${role ? ROLE_LABEL[role] : "Your role"} can't change account status.`}>
            <span tabIndex={0} className="focus-ring inline-flex h-10 items-center gap-2 rounded-pill border border-line px-4 text-[13px] font-semibold text-text-3">
              <Lock aria-hidden className="h-4 w-4" />
              Read-only
            </span>
          </Tooltip>
        )}
      </div>

      {state.status !== "active" ? (
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-control border border-line-soft bg-[rgba(255,255,255,0.03)] px-4 py-3">
            <dt className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-text-3">
              <MessageSquareText aria-hidden className="h-3.5 w-3.5" /> Message they see
            </dt>
            <dd className="mt-1 text-[13.5px] text-text-2">{state.messageToUser ?? <span className="text-text-3">No message — they see the standard text.</span>}</dd>
          </div>
          {permitted ? (
            <div className="rounded-control border border-line-soft bg-[rgba(255,255,255,0.03)] px-4 py-3">
              <dt className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-text-3">
                <Lock aria-hidden className="h-3.5 w-3.5" /> Internal reason
              </dt>
              <dd className="mt-1 text-[13.5px] text-text-2">{priv.loading ? "…" : reason ?? <span className="text-text-3">—</span>}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      <div>
        <h3 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-text-3">
          <History aria-hidden className="h-3.5 w-3.5" /> Status history
        </h3>
        {audits.error && !history.length ? (
          <ErrorState message={audits.error} onRetry={audits.retry} className="py-6" />
        ) : audits.loading && !history.length ? (
          <Skeleton className="mt-2 h-12 rounded-control" />
        ) : history.length === 0 ? (
          <p className="mt-2 text-[13px] text-text-3">Never paused or blocked.</p>
        ) : (
          <ol className="mt-2 flex flex-col gap-2">
            {history.slice(0, 20).map((h) => {
              const b = ACCOUNT_BADGE[h.status];
              return (
                <li key={h.key} className="flex flex-wrap items-start gap-x-3 gap-y-1 rounded-control border border-line-soft px-3.5 py-2.5 text-[13px]">
                  <Badge tone={b.tone}>{b.label}</Badge>
                  <span className="min-w-0 flex-1 text-text-2">
                    {h.reason ? <>“{h.reason}”</> : <span className="text-text-3">No reason recorded</span>}
                    {h.messageToUser ? <span className="block text-[12px] text-text-3">Told them: “{h.messageToUser}”</span> : null}
                    {h.until ? <span className="block text-[12px] text-text-3">Until {formatDateTime(h.until)}</span> : null}
                  </span>
                  <span className="shrink-0 text-right text-[12px] text-text-3" title={formatDateTime(h.at)}>
                    {h.at && now ? relTime(h.at, now) : formatDateTime(h.at)}
                    {h.by ? <span className="block font-mono text-[11px]">{h.by.slice(0, 10)}</span> : null}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <Sheet
        open={!!open}
        title={open ? (open.status === state.status ? `Update ${name}'s ${open.label.toLowerCase()}?` : open.question(name)) : ""}
        description={open && !open.phrase ? open.consequence : undefined}
        confirmLabel={open ? (open.status === state.status ? "Save" : open.confirm) : ""}
        tone={open?.tone ?? "danger"}
        requireReason
        minReason={ACCOUNT_LIMITS.reason[0]}
        reasonLabel="Internal reason (admins only; kept in the audit trail)"
        extra={
          open ? (
            <div className="flex flex-col gap-4">
              {open.phrase ? <PhraseBox phrase={open.phrase} consequence={open.consequence} value={typed} onChange={setTyped} /> : null}
              {open.status !== "active" || state.status === "paused" ? (
                <Field
                  label={open.status === "active" ? "Message to the person (optional)" : "Message to the person (optional; they can read it)"}
                  count={message.trim().length}
                  max={ACCOUNT_LIMITS.message[1]}
                  hint={open.status === "blocked" ? "Shown on their “Account suspended” screen if they open the app." : open.status === "paused" ? "Shown on their paused banner and in the inbox message." : "Added to their inbox message."}
                >
                  {({ id, describedBy }) => <TextArea id={id} aria-describedby={describedBy} rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. We're reviewing a report about a recent booking. Reach us from Help & support." />}
                </Field>
              ) : null}
              {open.status !== "active" ? (
                <Field label="Until (IST, optional)" hint="Returns to active automatically after this time. Leave empty to keep it until you change it.">
                  {({ id, describedBy }) => <TextInput id={id} aria-describedby={describedBy} type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} />}
                </Field>
              ) : null}
            </div>
          ) : undefined
        }
        onConfirm={confirm}
        onClose={() => setOpen(null)}
      />
    </Card>
  );
}
