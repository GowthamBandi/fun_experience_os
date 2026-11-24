"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, CalendarClock, LayoutTemplate, Send, XCircle } from "lucide-react";
import { Badge, Button, Card, Empty, ErrorState, Sheet, Skeleton, Truncated, useToast } from "@/components/pulse";
import { BroadcastCard } from "@/components/control/BroadcastCard";
import { PageContainer } from "@/components/shell/PageContainer";
import { RequestIdBook, decisionKey } from "@/lib/console/actions";
import { rethrowForSheet } from "@/lib/console/errors";
import { formatDateTime } from "@/lib/console/records";
import { cn, relTime } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { cancelScheduledNotification, sendNotification } from "@/lib/notifications-api";
import {
  EMPTY_NOTIFICATION,
  LINK_TYPES,
  LIMITS,
  audienceSummary,
  buildNotificationPayload,
  isLimitedAudience,
  linkIdLabel,
  linkTypeLabel,
  notificationFormFromTemplate,
  notificationProblems,
  notificationStatusBadge,
  notificationTemplatePayload,
  problemFor,
  recipientsLabel,
  toAudience,
  type CtaTarget,
  type LinkType,
  type NotificationForm,
  type NotificationRow,
  type NotificationStyle,
} from "@/lib/notifications";
import { useLiveDocument } from "@/lib/use-governance";
import { useAdminNotifications, useTemplates } from "@/lib/use-notifications";
import { AudienceBuilder, ReachEstimate } from "./AudienceBuilder";
import { Field, FormSection, INPUT, Segmented, TextArea, TextInput } from "./FormBits";
import { NotificationsHeader } from "./NotificationsNav";
import { PushPreview } from "./PushPreview";
import { SaveTemplateSheet } from "./SaveTemplateSheet";

/** Push + inbox message to a chosen audience, now or scheduled; history with cancel; the legacy Broadcast card. */
export function SendNotificationView() {
  const toast = useToast();
  const params = useSearchParams();
  const now = useNow(30_000);
  const [form, setForm] = useState<NotificationForm>(EMPTY_NOTIFICATION);
  const [showErrors, setShowErrors] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<NotificationRow | null>(null);
  const book = useRef(new RequestIdBook("ntf"));
  const cancelBook = useRef(new RequestIdBook("ntfc"));
  const history = useAdminNotifications();
  const templates = useTemplates();
  const notificationTemplates = templates.rows.filter((t) => t.kind === "notification");

  const templateId = params.get("template");
  const template = useLiveDocument(templateId ? "notificationTemplates" : null, templateId);
  const applied = useRef<string | null>(null);
  useEffect(() => {
    if (!templateId || !template.data || applied.current === templateId) return;
    applied.current = templateId;
    setForm(notificationFormFromTemplate(template.data.payload));
    toast.show({ tone: "info", title: "Template applied", body: typeof template.data.name === "string" ? template.data.name : undefined });
  }, [templateId, template.data, toast]);

  const set = (patch: Partial<NotificationForm>) => setForm((f) => ({ ...f, ...patch }));
  const ref = useMemo(() => now ?? new Date(), [now]);
  const problems = useMemo(() => notificationProblems(form, ref), [form, ref]);
  const shown = showErrors ? problems : [];
  const err = (f: string) => problemFor(shown, f);
  const audience = toAudience(form.audience);

  const ask = () => {
    setShowErrors(true);
    if (problems.length) {
      toast.show({ tone: "err", title: "Not ready to send", body: problems[0]!.message });
      return;
    }
    setConfirmOpen(true);
  };

  const send = async () => {
    const payload = buildNotificationPayload(form, "x");
    try {
      const r = await sendNotification(buildNotificationPayload(form, book.current.idFor(decisionKey(JSON.stringify(payload)))));
      book.current.reset();
      toast.show({
        tone: "ok",
        title: r.status === "scheduled" ? "Scheduled" : "Sent",
        body: `${form.title.trim()} · ${r.recipients === null || r.recipients === undefined ? (audience.type === "cities" ? "city topic push" : "") : `${r.recipients} ${r.recipients === 1 ? "person" : "people"}`}`,
      });
      setForm((f) => ({ ...EMPTY_NOTIFICATION, audience: f.audience }));
      setShowErrors(false);
    } catch (cause) {
      rethrowForSheet(cause, book.current);
    }
  };

  const cancel = async (reason: string) => {
    if (!cancelTarget) return;
    try {
      await cancelScheduledNotification({ requestId: cancelBook.current.idFor(decisionKey("cancel", cancelTarget.id, reason)), id: cancelTarget.id, reason });
      cancelBook.current.reset();
      toast.show({ tone: "info", title: "Scheduled send cancelled", body: cancelTarget.title });
    } catch (cause) {
      rethrowForSheet(cause, cancelBook.current);
    }
  };

  return (
    <PageContainer className="flex flex-col gap-6">
      <NotificationsHeader
        title={
          <>
            Send a <em className="hl">notification</em>
          </>
        }
        subtitle="A push plus an item in each person's notifications list — to everyone, customers, organizers, cities, organizations or specific people. Now or scheduled; every send is audited."
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-5">
          <FormSection
            title="Message"
            action={
              notificationTemplates.length ? (
                <select
                  aria-label="Start from a template"
                  value=""
                  onChange={(e) => {
                    const t = notificationTemplates.find((x) => x.id === e.target.value);
                    if (!t) return;
                    setForm(notificationFormFromTemplate(t.payload));
                    toast.show({ tone: "info", title: "Template applied", body: t.name });
                  }}
                  className={cn(INPUT, "h-10 w-56 bg-[rgba(26,23,38,0.9)]")}
                >
                  <option value="">Start from a template…</option>
                  {notificationTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              ) : null
            }
          >
            <Field label="Title" count={form.title.trim().length} max={LIMITS.notificationTitle[1]} error={err("title")}>
              {({ id, describedBy, invalid }) => <TextInput id={id} aria-describedby={describedBy} invalid={invalid} value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="New this weekend" />}
            </Field>
            <Field label="Message" count={form.body.trim().length} max={LIMITS.notificationBody[1]} error={err("body")}>
              {({ id, describedBy, invalid }) => <TextArea id={id} aria-describedby={describedBy} invalid={invalid} rows={3} value={form.body} onChange={(e) => set({ body: e.target.value })} placeholder="12 new experiences near you — book before they fill up." />}
            </Field>
            <Segmented<NotificationStyle>
              legend="Style"
              value={form.style}
              onChange={(style) => set({ style })}
              options={[
                { value: "standard", label: "Standard", description: "Title and message (a small thumbnail if there's an image)." },
                { value: "rich", label: "Rich (big image)", description: "Shows the image large when the push is expanded." },
              ]}
            />
            <Field label={form.style === "rich" ? "Image" : "Image (optional)"} error={err("imageUrl")} hint="A https link. Also shown on the inbox item.">
              {({ id, describedBy, invalid }) => <TextInput id={id} aria-describedby={describedBy} invalid={invalid} type="url" value={form.imageUrl} onChange={(e) => set({ imageUrl: e.target.value })} placeholder="https://…/promo.jpg" spellCheck={false} />}
            </Field>
          </FormSection>

          <FormSection title="When tapped">
            <Segmented<CtaTarget>
              legend="Opens"
              value={form.target}
              onChange={(target) => set({ target })}
              options={[
                { value: "none", label: "The app" },
                { value: "link", label: "A screen in the app" },
                { value: "url", label: "A web page" },
              ]}
            />
            {form.target === "link" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="ntf-link-type" className="text-[12px] font-semibold text-text-3">
                    Screen
                  </label>
                  <select id="ntf-link-type" value={form.linkType} onChange={(e) => set({ linkType: e.target.value as LinkType })} className={cn(INPUT, "bg-[rgba(26,23,38,0.9)]")}>
                    {LINK_TYPES.map((l) => (
                      <option key={l.value} value={l.value}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </div>
                <Field label={linkIdLabel(form.linkType)} error={err("linkId")}>
                  {({ id, describedBy, invalid }) => <TextInput id={id} aria-describedby={describedBy} invalid={invalid} value={form.linkId} onChange={(e) => set({ linkId: e.target.value })} spellCheck={false} />}
                </Field>
              </div>
            ) : null}
            {form.target === "url" ? (
              <Field label="Web page (https)" error={err("url")}>
                {({ id, describedBy, invalid }) => <TextInput id={id} aria-describedby={describedBy} invalid={invalid} type="url" value={form.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://pulse.app/offers" spellCheck={false} />}
              </Field>
            ) : null}
          </FormSection>

          <FormSection title="Audience">
            <AudienceBuilder value={form.audience} onChange={(a) => set({ audience: a })} purpose="notification" />
            {err("audience") ? (
              <p role="alert" className="text-[12.5px] text-err">
                {err("audience")}
              </p>
            ) : null}
          </FormSection>

          <FormSection title="When">
            <Segmented<"now" | "at">
              legend="Send"
              value={form.when}
              onChange={(when) => set({ when })}
              options={[
                { value: "now", label: "Now" },
                { value: "at", label: "At a time" },
              ]}
            />
            {form.when === "at" ? (
              <Field label="Send at (IST)" error={err("scheduleAt")} hint="2 minutes to 60 days ahead. Scheduled sends go out within 5 minutes of this time.">
                {({ id, describedBy, invalid }) => <TextInput id={id} aria-describedby={describedBy} invalid={invalid} type="datetime-local" value={form.scheduleAt} onChange={(e) => set({ scheduleAt: e.target.value })} />}
              </Field>
            ) : null}
            <Field label="Reason (kept in the audit trail)" count={form.reason.trim().length} max={LIMITS.reason[1]} error={err("reason")}>
              {({ id, describedBy, invalid }) => <TextInput id={id} aria-describedby={describedBy} invalid={invalid} value={form.reason} onChange={(e) => set({ reason: e.target.value })} placeholder="Weekend promotion for Hyderabad" />}
            </Field>
          </FormSection>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line-soft bg-[rgba(18,16,28,0.92)] px-4 py-3">
            <p className="text-[12.5px] text-text-3">
              {isLimitedAudience(audience) ? "Broad send: counts toward the 3 a day shared with Broadcast." : "Targeted send: up to 60 an hour per admin."}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="quiet" icon={<LayoutTemplate />} onClick={() => setTemplateOpen(true)}>
                Save as template
              </Button>
              <Button variant="volt" icon={form.when === "at" ? <CalendarClock /> : <Send />} onClick={ask}>
                {form.when === "at" ? "Schedule" : "Send now"}
              </Button>
            </div>
          </div>
        </div>

        <aside aria-label="Preview and reach" className="flex flex-col items-center gap-4 xl:sticky xl:top-4">
          <PushPreview form={form} />
          <div className="w-full max-w-[380px]">
            <ReachEstimate audience={form.audience} purpose="notification" />
          </div>
        </aside>
      </div>

      <History rows={history.rows} loading={history.loading} error={history.error} truncated={history.truncated} retry={history.retry} now={now} onCancel={setCancelTarget} />

      <section aria-label="Quick broadcast" className="flex flex-col gap-2">
        <h2 className="font-display text-[17px] font-bold tracking-[-0.02em] text-text">Quick broadcast</h2>
        <p className="text-[13px] text-text-2">The original push-only broadcast (no inbox item) to everyone or one city topic. It shares the 3-a-day limit with broad sends above.</p>
        <BroadcastCard />
      </section>

      <Sheet
        open={confirmOpen}
        title={form.when === "at" ? "Schedule this notification?" : "Send this notification now?"}
        description={`“${form.title.trim()}” to ${audienceSummary(audience)}${form.when === "at" ? `, at the time you chose (IST)` : ""}. A sent push can't be taken back.`}
        confirmLabel={form.when === "at" ? "Schedule" : "Send now"}
        tone="volt"
        extra={
          audience.type === "all" || audience.type === "customers" ? (
            <p className="flex items-start gap-2 rounded-control border border-[rgba(255,184,77,0.3)] bg-[rgba(255,184,77,0.08)] px-3.5 py-3 text-[13px] leading-5 text-[#FFD9A0]">
              <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
              This reaches {audience.type === "all" ? "everyone on PULSE" : "every customer"}. Double-check the text.
            </p>
          ) : undefined
        }
        onConfirm={send}
        onClose={() => setConfirmOpen(false)}
      />
      <Sheet
        open={!!cancelTarget}
        title={cancelTarget ? `Cancel “${cancelTarget.title}”?` : ""}
        description="It won't be sent. This can't be undone; schedule a new one if you change your mind."
        confirmLabel="Cancel the send"
        tone="danger"
        requireReason
        minReason={3}
        reasonLabel="Reason (kept in the audit trail)"
        onConfirm={cancel}
        onClose={() => setCancelTarget(null)}
      />
      <SaveTemplateSheet open={templateOpen} kind="notification" defaultName={form.title.trim()} payload={() => notificationTemplatePayload(form)} onClose={() => setTemplateOpen(false)} />
    </PageContainer>
  );
}

function History({
  rows,
  loading,
  error,
  truncated,
  retry,
  now,
  onCancel,
}: {
  rows: NotificationRow[];
  loading: boolean;
  error: string | null;
  truncated: boolean;
  retry: () => void;
  now: Date | null;
  onCancel: (row: NotificationRow) => void;
}) {
  return (
    <Card as="section" aria-label="Send history" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-[17px] font-bold tracking-[-0.02em] text-text">History</h2>
        <span className="text-[12px] text-text-3">Newest first</span>
      </div>
      {error ? (
        <ErrorState message={error} onRetry={retry} />
      ) : loading ? (
        <div role="status" aria-busy="true" className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 rounded-control" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Empty emoji="📨" title="Nothing sent yet" body="Sends and scheduled sends from this page appear here." />
      ) : (
        <ul className="flex flex-col divide-y divide-line-soft">
          {rows.map((r) => {
            const badge = notificationStatusBadge(r.status);
            return (
              <li key={r.id} className="flex flex-wrap items-start gap-3 py-3">
                <div className="min-w-0 flex-1 basis-[320px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-semibold text-text">{r.title}</p>
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                    {r.style === "rich" ? <Badge tone="violet">Rich</Badge> : null}
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-[13px] text-text-2">{r.body}</p>
                  <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-text-3">
                    <span>{audienceSummary(r.audience)}</span>
                    <span>· {recipientsLabel(r)}</span>
                    {r.link ? <span>· opens {linkTypeLabel(r.link.type).toLowerCase()} {r.link.id}</span> : r.url ? <span>· opens {r.url}</span> : null}
                    {r.pushStatus ? <span>· push {r.pushStatus}</span> : null}
                    {r.reason ? <span>· “{r.reason}”</span> : null}
                  </p>
                  {r.failure ? (
                    <p className="mt-1 text-[12px] text-err">{r.failure === "daily-limit" ? "Not sent: the 3-a-day limit for broad pushes was reached." : r.failure}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5 text-right text-[12px] text-text-3">
                  <span title={formatDateTime(r.sentAt ?? r.scheduleAt ?? r.createdAt)}>
                    {r.status === "scheduled" && r.scheduleAt ? `Sends ${formatDateTime(r.scheduleAt)}` : r.sentAt ? `Sent ${now ? relTime(r.sentAt, now) : formatDateTime(r.sentAt)}` : `Created ${r.createdAt && now ? relTime(r.createdAt, now) : formatDateTime(r.createdAt)}`}
                  </span>
                  {r.status === "scheduled" ? (
                    <Button variant="danger" size="sm" icon={<XCircle />} onClick={() => onCancel(r)}>
                      Cancel
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {truncated ? <Truncated shown={rows.length} order="newest" noun="sends" /> : null}
    </Card>
  );
}
