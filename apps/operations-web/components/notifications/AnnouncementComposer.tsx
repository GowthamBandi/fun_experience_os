"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, BellRing, LayoutTemplate, Save, Send } from "lucide-react";
import { Button, Card, Empty, ErrorState, Sheet, Skeleton, useToast } from "@/components/pulse";
import { BackLink } from "@/components/shell/BackLink";
import { PageContainer } from "@/components/shell/PageContainer";
import { RequestIdBook, decisionKey } from "@/lib/console/actions";
import { mapConsoleError, rethrowForSheet } from "@/lib/console/errors";
import { cn } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { saveAnnouncement, setAnnouncementStatus } from "@/lib/notifications-api";
import {
  EMPTY_ANNOUNCEMENT,
  FORMAT_META,
  FREQUENCIES,
  FREQUENCY_META,
  LIMITS,
  TONE_META,
  TONES,
  announcementFormFrom,
  announcementFormFromTemplate,
  announcementProblems,
  announcementTemplatePayload,
  audienceSummary,
  buildAnnouncementPayload,
  effectiveStatus,
  previewModel,
  problemFor,
  toAudience,
  type AnnouncementForm,
  type AnnouncementStatus,
} from "@/lib/notifications";
import { useLiveDocument } from "@/lib/use-governance";
import { useTemplates } from "@/lib/use-notifications";
import { AudienceBuilder, ReachEstimate } from "./AudienceBuilder";
import { StatusBadge } from "./Bits";
import { FormatPicker } from "./FormatPicker";
import { CtaEditor } from "./CtaEditor";
import { Field, FormSection, INPUT, Segmented, TextArea, TextInput, Toggle } from "./FormBits";
import { PhonePreview } from "./PhonePreview";
import { SaveTemplateSheet } from "./SaveTemplateSheet";

/** Create (no id) or edit an announcement, with a live phone preview and reach estimate. */
export function AnnouncementComposer({ id }: { id?: string }) {
  const existing = useLiveDocument(id ? "announcements" : null, id ?? null);
  if (id && existing.loading) return <ComposerSkeleton />;
  if (id && existing.error) {
    return (
      <PageContainer className="flex flex-col gap-5">
        <BackLink href="/notifications/announcements" label="Announcements" />
        <Card>
          <ErrorState message={existing.error} />
        </Card>
      </PageContainer>
    );
  }
  if (id && !existing.data) {
    return (
      <PageContainer className="flex flex-col gap-5">
        <BackLink href="/notifications/announcements" label="Announcements" />
        <Card>
          <Empty emoji="🔎" title="Announcement not found" body={`There's no announcement with the ID ${id}.`} />
        </Card>
      </PageContainer>
    );
  }
  return <Composer key={id ?? "new"} id={id ?? null} initial={id ? existing.data : null} />;
}

function ComposerSkeleton() {
  return (
    <PageContainer className="flex flex-col gap-5">
      <Skeleton className="h-10 w-72 rounded-pill" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[220px] rounded-card" />
          ))}
        </div>
        <Skeleton className="h-[720px] w-[360px] rounded-[44px]" />
      </div>
    </PageContainer>
  );
}

function Composer({ id, initial }: { id: string | null; initial: Record<string, unknown> | null }) {
  const router = useRouter();
  const toast = useToast();
  const params = useSearchParams();
  const now = useNow(30_000);
  const [form, setForm] = useState<AnnouncementForm>(() => (initial ? announcementFormFrom(initial) : EMPTY_ANNOUNCEMENT));
  // Dirty = the payload changed (chip names filling in after load don't count).
  const fingerprint = (f: AnnouncementForm) => JSON.stringify(buildAnnouncementPayload(f, { requestId: "x", id }));
  const baseline = useRef(fingerprint(form));
  const storedStatus = (typeof initial?.status === "string" ? initial.status : "draft") as AnnouncementStatus;
  const status = initial ? effectiveStatus(initial.status, initial.startsAt, initial.endsAt, now ?? new Date()) : "draft";
  const liveLocked = storedStatus === "live";
  const frozen = storedStatus === "ended" || storedStatus === "archived";
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const saveBook = useRef(new RequestIdBook("anns"));
  const publishBook = useRef(new RequestIdBook("annp"));
  const templates = useTemplates(!id);
  const announcementTemplates = templates.rows.filter((t) => t.kind === "announcement");

  // ?template=<id> on a new announcement: apply it once.
  const templateId = !id ? params.get("template") : null;
  const template = useLiveDocument(templateId ? "notificationTemplates" : null, templateId);
  const applied = useRef<string | null>(null);
  useEffect(() => {
    if (!templateId || !template.data || applied.current === templateId) return;
    applied.current = templateId;
    const next = announcementFormFromTemplate(template.data.payload);
    setForm(next);
    toast.show({ tone: "info", title: "Template applied", body: typeof template.data.name === "string" ? template.data.name : undefined });
  }, [templateId, template.data, toast]);

  const dirty = fingerprint(form) !== baseline.current;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = (patch: Partial<AnnouncementForm>) => setForm((f) => ({ ...f, ...patch }));
  const ref = useMemo(() => now ?? new Date(), [now]);
  const saveProblems = useMemo(() => announcementProblems(form, { now: ref, forPublish: false }), [form, ref]);
  const publishProblems = useMemo(() => announcementProblems(form, { now: ref, forPublish: true }), [form, ref]);
  const problems = showErrors ? publishProblems : [];
  const err = (field: string) => problemFor(problems, field);
  const model = useMemo(() => previewModel(form), [form]);

  const persist = async (): Promise<string> => {
    const payloadForKey = buildAnnouncementPayload(form, { requestId: "x", id });
    const requestId = saveBook.current.idFor(decisionKey(id ?? "new", JSON.stringify(payloadForKey)));
    const result = await saveAnnouncement(buildAnnouncementPayload(form, { requestId, id }));
    saveBook.current.reset();
    baseline.current = fingerprint(form);
    return result.id;
  };

  const saveDraft = async () => {
    setShowErrors(true);
    if (saveProblems.length) {
      toast.show({ tone: "err", title: "Fix the highlighted fields", body: saveProblems[0]!.message });
      return;
    }
    setSaving(true);
    try {
      const savedId = await persist();
      toast.show({ tone: "ok", title: id ? "Changes saved" : "Draft saved", body: form.title.trim() });
      if (!id) router.replace(`/notifications/announcements/${encodeURIComponent(savedId)}/edit`);
    } catch (cause) {
      const m = mapConsoleError(cause);
      if (m.kind !== "unavailable" && m.kind !== "unknown") saveBook.current.reset();
      toast.show({ tone: "err", title: "Couldn't save", body: m.nextStep ? `${m.message} ${m.nextStep}` : m.message });
    } finally {
      setSaving(false);
    }
  };

  const askPublish = () => {
    setShowErrors(true);
    if (publishProblems.length) {
      toast.show({ tone: "err", title: "Not ready to publish", body: publishProblems[0]!.message });
      return;
    }
    setPublishOpen(true);
  };

  const publish = async (reason: string) => {
    let savedId: string;
    try {
      savedId = await persist();
    } catch (cause) {
      rethrowForSheet(cause, saveBook.current);
    }
    try {
      const r = await setAnnouncementStatus({ requestId: publishBook.current.idFor(decisionKey("publish", savedId, reason)), id: savedId, action: "publish", reason });
      publishBook.current.reset();
      toast.show({ tone: "ok", title: r.status === "scheduled" ? "Scheduled" : "Live now", body: form.title.trim() });
      router.push(`/notifications/announcements/${encodeURIComponent(savedId)}`);
    } catch (cause) {
      if (!id) router.replace(`/notifications/announcements/${encodeURIComponent(savedId)}/edit`);
      rethrowForSheet(cause, publishBook.current);
    }
  };

  const draftLike = storedStatus === "draft";
  const lockedNote = liveLocked ? "Live — only the text, buttons, image and window can change. Pause it to change the format, behaviour or audience." : null;

  return (
    <PageContainer className="flex flex-col gap-6">
      <BackLink href={id ? `/notifications/announcements/${encodeURIComponent(id)}` : "/notifications/announcements"} label={id ? "Announcement" : "Announcements"} />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="overline mb-2 flex items-center gap-2 font-semibold">
            <BellRing aria-hidden className="h-3.5 w-3.5" /> {id ? "Edit announcement" : "New announcement"}
            {initial ? <StatusBadge status={status} /> : null}
          </div>
          <h1 className="break-words font-display text-[34px] font-bold leading-[1.05] tracking-[-0.03em] text-text sm:text-[40px]">{form.title.trim() || (id ? "Untitled" : "Compose an announcement")}</h1>
          <p className="mt-2 text-[14px] text-text-2">{audienceSummary(toAudience(form.audience))} · {FORMAT_META[form.format].label}</p>
        </div>
        {!id && announcementTemplates.length ? (
          <div className="flex items-center gap-2">
            <label htmlFor="tpl-pick" className="text-[12px] font-semibold text-text-3">
              Start from a template
            </label>
            <select
              id="tpl-pick"
              value=""
              onChange={(e) => {
                const t = announcementTemplates.find((x) => x.id === e.target.value);
                if (!t) return;
                if (dirty && !window.confirm("Replace what you've written with this template?")) return;
                setForm(announcementFormFromTemplate(t.payload));
                toast.show({ tone: "info", title: "Template applied", body: t.name });
              }}
              className={cn(INPUT, "h-10 w-56 bg-[rgba(26,23,38,0.9)]")}
            >
              <option value="">Choose…</option>
              {announcementTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </header>

      {frozen ? (
        <div role="status" className="flex items-start gap-2.5 rounded-control border border-[rgba(255,184,77,0.3)] bg-[rgba(255,184,77,0.08)] px-4 py-3 text-[13px] text-[#FFD9A0]">
          <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
          This announcement has {storedStatus === "ended" ? "ended" : "been archived"} and can&apos;t be edited. Duplicate it from its page to run it again.
        </div>
      ) : lockedNote ? (
        <div role="status" className="flex items-start gap-2.5 rounded-control border border-[rgba(99,190,255,0.3)] bg-[rgba(99,190,255,0.08)] px-4 py-3 text-[13px] text-text-2">
          <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-info" />
          {lockedNote}
        </div>
      ) : null}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <fieldset disabled={frozen} className="flex min-w-0 flex-col gap-5">
          <legend className="sr-only">Announcement</legend>
          <FormSection title="Format & tone" description="How it appears when someone opens PULSE.">
            <fieldset disabled={liveLocked}>
              <legend className="mb-2 text-[12px] font-semibold text-text-3">Format</legend>
              <FormatPicker value={form.format} onChange={(format) => set({ format })} disabled={liveLocked} />
            </fieldset>
            <Segmented
              legend="Tone"
              value={form.tone}
              onChange={(tone) => !liveLocked && set({ tone })}
              options={TONES.map((t) => ({
                value: t,
                label: (
                  <>
                    <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: TONE_META[t].accent }} />
                    {TONE_META[t].label}
                  </>
                ),
              }))}
              className={liveLocked ? "pointer-events-none opacity-60" : undefined}
            />
          </FormSection>

          <FormSection title="Content">
            <Field label="Title" count={form.title.trim().length} max={LIMITS.announcementTitle[1]} error={err("title")}>
              {({ id: fid, describedBy, invalid }) => <TextInput id={fid} aria-describedby={describedBy} invalid={invalid} value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="Welcome to PULSE" />}
            </Field>
            <Field label="Message" count={form.body.trim().length} max={LIMITS.announcementBody[1]} error={err("body")} hint="Plain text; line breaks are kept.">
              {({ id: fid, describedBy, invalid }) => <TextArea id={fid} aria-describedby={describedBy} invalid={invalid} rows={4} value={form.body} onChange={(e) => set({ body: e.target.value })} placeholder="What should people know?" />}
            </Field>
            <Field label="Image (optional)" error={err("imageUrl")} hint="A https link to a wide image (about 16:9).">
              {({ id: fid, describedBy, invalid }) => <TextInput id={fid} aria-describedby={describedBy} invalid={invalid} type="url" value={form.imageUrl} onChange={(e) => set({ imageUrl: e.target.value })} placeholder="https://…/cover.jpg" spellCheck={false} />}
            </Field>
          </FormSection>

          <FormSection title="Buttons" description="Optional. The main button uses the tone colour.">
            <div className="grid gap-3 lg:grid-cols-2">
              <CtaEditor legend="Main button" value={form.primaryCta} onChange={(primaryCta) => set({ primaryCta })} error={err("primaryCta")} labelPlaceholder="Explore" />
              <CtaEditor legend="Second button" value={form.secondaryCta} onChange={(secondaryCta) => set({ secondaryCta })} error={err("secondaryCta")} labelPlaceholder="Not now" disabled={!form.primaryCta.label.trim()} />
            </div>
          </FormSection>

          <FormSection title="Behaviour">
            <fieldset disabled={liveLocked} className="flex flex-col gap-4">
              <legend className="sr-only">Behaviour</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <Toggle checked={form.dismissible} onChange={(dismissible) => set({ dismissible })} label="People can close it" description="Off = no close button; only the buttons or “I understand”." disabled={liveLocked} />
                <Toggle checked={form.requireAck} onChange={(requireAck) => set({ requireAck })} label="Require “I understand”" description="Shows an acknowledgement button; counts as acknowledged." disabled={liveLocked} />
              </div>
              {err("dismissible") ? (
                <p role="alert" className="text-[12px] text-err">
                  {err("dismissible")}
                </p>
              ) : null}
              <Segmented
                legend="How often"
                value={form.frequency}
                onChange={(frequency) => !liveLocked && set({ frequency })}
                options={FREQUENCIES.map((f) => ({ value: f, label: FREQUENCY_META[f].label, description: FREQUENCY_META[f].description }))}
              />
              <p className="-mt-2 text-[12px] text-text-3">{FREQUENCY_META[form.frequency].description}</p>
              <Field label={`Priority · ${form.priority}`} hint="Higher shows first. One popup at a time; at most two banners stack." error={err("priority")}>
                {({ id: fid, describedBy }) => (
                  <input id={fid} aria-describedby={describedBy} type="range" min={0} max={100} step={5} value={form.priority} onChange={(e) => set({ priority: Number(e.target.value) })} className="focus-ring w-full accent-[#8E72FF]" />
                )}
              </Field>
            </fieldset>
          </FormSection>

          <FormSection title="Audience" description={liveLocked ? "Locked while live." : "Who sees it. The reach updates as you change it."}>
            <fieldset disabled={liveLocked} className={cn(liveLocked && "pointer-events-none opacity-60")}>
              <legend className="sr-only">Audience</legend>
              <AudienceBuilder value={form.audience} onChange={(audience) => set({ audience })} purpose="announcement" />
            </fieldset>
          </FormSection>

          <FormSection title="Schedule" description="India time (IST). Delivery checks the window on every app open.">
            <Segmented<"now" | "at">
              legend="Starts"
              value={form.startMode}
              onChange={(startMode) => set({ startMode })}
              options={[
                { value: "now", label: "When published" },
                { value: "at", label: "At a time" },
              ]}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              {form.startMode === "at" ? (
                <Field label="Start (IST)" error={err("startsAt")}>
                  {({ id: fid, describedBy, invalid }) => <TextInput id={fid} aria-describedby={describedBy} invalid={invalid} type="datetime-local" value={form.startsAt} onChange={(e) => set({ startsAt: e.target.value })} />}
                </Field>
              ) : null}
              <Field label="End (IST, optional)" error={err("endsAt")} hint="Leave empty to run until you end it.">
                {({ id: fid, describedBy, invalid }) => <TextInput id={fid} aria-describedby={describedBy} invalid={invalid} type="datetime-local" value={form.endsAt} onChange={(e) => set({ endsAt: e.target.value })} />}
              </Field>
            </div>
          </FormSection>

          <FormSection title="Push">
            <Toggle
              checked={form.sendPush}
              onChange={(sendPush) => set({ sendPush })}
              disabled={liveLocked}
              label="Also send a push"
              description="When it goes live, PULSE also pushes the title and message to the same audience. Everyone / Customers / Cities pushes count toward the 3 a day."
            />
            {err("sendPush") ? (
              <p role="alert" className="text-[12px] text-err">
                {err("sendPush")}
              </p>
            ) : null}
          </FormSection>
        </fieldset>

        <aside aria-label="Preview and reach" className="flex flex-col items-center gap-4 xl:sticky xl:top-4">
          <PhonePreview model={model} />
          {model.primaryHint ? <p className="text-[12px] text-text-3">Main button: {model.primaryHint}</p> : null}
          <div className="w-full max-w-[380px]">
            <ReachEstimate audience={form.audience} purpose="announcement" sendPush={form.sendPush} />
          </div>
        </aside>
      </div>

      {!frozen ? (
        <div className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-card border border-line-soft bg-[rgba(18,16,28,0.92)] px-4 py-3 shadow-[0_18px_48px_-20px_rgba(0,0,0,0.8)] backdrop-blur-[14px]">
          <p className="text-[12.5px] text-text-3" aria-live="polite">
            {showErrors && publishProblems.length ? `${publishProblems.length} thing${publishProblems.length === 1 ? "" : "s"} to fix before publishing.` : dirty ? "Unsaved changes." : id ? "All changes saved." : "Not saved yet."}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="quiet" icon={<LayoutTemplate />} onClick={() => setTemplateOpen(true)}>
              Save as template
            </Button>
            <Button variant="ghost" icon={<Save />} loading={saving} onClick={saveDraft}>
              {draftLike ? "Save draft" : "Save changes"}
            </Button>
            {draftLike ? (
              <Button variant="volt" icon={<Send />} onClick={askPublish}>
                Publish
              </Button>
            ) : (
              <Link href={`/notifications/announcements/${encodeURIComponent(id!)}`} className="focus-ring inline-flex h-10 items-center rounded-[14px] px-4 text-[13px] font-semibold text-text-2 hover:bg-[rgba(255,255,255,0.06)] hover:text-text">
                Back to stats
              </Link>
            )}
          </div>
        </div>
      ) : null}

      <Sheet
        open={publishOpen}
        title={`Publish “${form.title.trim()}”?`}
        description={`${form.startMode === "at" ? "It goes live at its start time" : "It goes live right away"} for ${audienceSummary(toAudience(form.audience))}${form.sendPush ? ", and a push is sent when it goes live" : ""}. You can pause or end it at any time.`}
        confirmLabel={form.startMode === "at" ? "Schedule" : "Publish now"}
        tone="volt"
        requireReason
        minReason={3}
        reasonLabel="Reason (kept in the audit trail)"
        onConfirm={publish}
        onClose={() => setPublishOpen(false)}
      />
      <SaveTemplateSheet open={templateOpen} kind="announcement" defaultName={form.title.trim()} payload={() => announcementTemplatePayload(form)} onClose={() => setTemplateOpen(false)} />
    </PageContainer>
  );
}
