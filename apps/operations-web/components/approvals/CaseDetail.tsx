"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, Check, Copy, Info, GitCompareArrows, KeyRound, Lock, RotateCw, UsersRound } from "lucide-react";
import { Badge, Button, Glyph, Skeleton, Tooltip, useToast, type BadgeTone } from "@/components/pulse";
import { rawFields } from "@/components/governance/controls";
import { ExperiencePreview } from "./ExperiencePreview";
import { KIND_LABEL, caseBadge, caseGlyph, caseTarget, experienceDiff, type DiffRow } from "@/lib/approvals";
import type { CaseOutcome } from "@/lib/console/actions";
import { isOpenCase } from "@/lib/console/attention";
import type { ConsoleError } from "@/lib/console/errors";
import { canReissueOrganizerCode, caseTargetFields, formatDateTime, text, type KeyField } from "@/lib/console/records";
import { cn, maskPhone } from "@/lib/format";
import type { LiveGovernanceRecord } from "@/lib/governance-api";
import { categoryEmoji } from "@/lib/overview";
import { useLiveDocument } from "@/lib/use-governance";

type Raw = Record<string, unknown>;

const RISK_TONE: Record<string, BadgeTone> = { high: "err", medium: "warn", low: "ok" };
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

function Card({ title, icon, trailing, children, className }: { title: string; icon?: ReactNode; trailing?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-card border border-line-soft bg-[rgba(26,23,38,0.62)] p-5 backdrop-blur-[12px]", className)}>
      <div className="mb-4 flex items-center gap-2">
        {icon ? <span aria-hidden className="text-text-3 [&>svg]:h-4 [&>svg]:w-4">{icon}</span> : null}
        <h3 className="flex-1 font-display text-[15px] font-bold tracking-[-0.01em] text-text">{title}</h3>
        {trailing}
      </div>
      {children}
    </section>
  );
}

function Fields({ fields }: { fields: KeyField[] }) {
  if (!fields.length) return <p className="text-[13px] text-text-3">No details available.</p>;
  return (
    <dl className="divide-y divide-line-soft">
      {fields.map((f) => (
        <div key={f.label} className="grid grid-cols-[minmax(7.5rem,38%)_1fr] gap-3 py-2.5 text-[13px]">
          <dt className="text-text-3">{f.label}</dt>
          <dd className="min-w-0 break-words text-text">{f.value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

function Answer({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn("rounded-control border border-line-soft bg-[rgba(255,255,255,0.03)] p-3.5", wide && "sm:col-span-2")}>
      <p className="overline !text-[11px] font-semibold">{label}</p>
      <div className="mt-1.5 break-words text-[14px] leading-[1.5] text-text">{children}</div>
    </div>
  );
}

function CopyId({ label, value }: { label: string; value: string }) {
  const toast = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.show({ tone: "ok", title: `${label} copied`, body: value });
    } catch {
      toast.show({ tone: "err", title: "Couldn’t copy", body: "Select the ID and copy it manually." });
    }
  };
  return (
    <Tooltip label={`Copy ${label.toLowerCase()}`}>
      <button
        type="button"
        onClick={copy}
        className="focus-ring inline-flex h-7 max-w-full items-center gap-1.5 rounded-pill border border-line-soft bg-[rgba(255,255,255,0.03)] px-2.5 text-[11.5px] text-text-2 transition-colors duration-150 hover:border-line hover:text-text"
      >
        <span className="text-text-3">{label}</span>
        <span className="truncate font-mono">{value}</span>
        <Copy aria-hidden className="h-3 w-3 shrink-0" />
      </button>
    </Tooltip>
  );
}

function Notice({ tone, title, children, action }: { tone: "warn" | "err" | "info"; title: string; children?: ReactNode; action?: ReactNode }) {
  const palette = {
    warn: "border-[rgba(255,184,77,0.35)] bg-[rgba(255,184,77,0.08)] text-warn",
    err: "border-[rgba(255,97,120,0.35)] bg-[rgba(255,97,120,0.08)] text-err",
    info: "border-[rgba(99,190,255,0.3)] bg-[rgba(99,190,255,0.07)] text-info",
  }[tone];
  return (
    <div role={tone === "info" ? "status" : "alert"} className={cn("flex flex-wrap items-start gap-3 rounded-control border px-4 py-3.5", palette)}>
      {tone === "info" ? <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />}
      <div className="min-w-0 flex-1">
        <p className="font-display text-[14px] font-bold">{title}</p>
        {children ? <div className="mt-1 text-[13px] leading-[1.5] text-text-2">{children}</div> : null}
      </div>
      {action}
    </div>
  );
}

function DiffCard({ rows, loading, missing }: { rows: DiffRow[]; loading: boolean; missing: boolean }) {
  return (
    <Card title="Changes from the live version" icon={<GitCompareArrows />} trailing={!loading && !missing ? <Badge tone="volt">{rows.length}</Badge> : null}>
      {loading ? (
        <div className="flex flex-col gap-2"><Skeleton className="h-4 w-3/4 rounded-pill" /><Skeleton className="h-4 w-1/2 rounded-pill" /></div>
      ) : missing ? (
        <p className="text-[13px] text-text-3">The approved version this revision replaces wasn’t found, so there’s nothing to compare against.</p>
      ) : rows.length === 0 ? (
        <p className="text-[13px] text-text-3">No content changes. Only metadata differs.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.field} className="rounded-control border border-line-soft bg-[rgba(255,255,255,0.03)] p-3">
              <p className="overline !text-[11px] font-semibold">{r.label}</p>
              <p className="mt-1.5 break-words text-[13px] leading-[1.45] text-err line-through decoration-[rgba(255,97,120,0.6)]"><span className="sr-only">Before: </span>{r.before}</p>
              <p className="mt-1 break-words text-[13px] leading-[1.45] text-ok"><span className="sr-only">After: </span>{r.after}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function KycAnswers({ app }: { app: Raw }) {
  const categories = Array.isArray(app.categories) ? app.categories.filter((c): c is string => typeof c === "string") : [];
  const kind = str(app.kind);
  return (
    <Card title="Application answers" icon={<UsersRound />} trailing={typeof app.resubmissions === "number" && app.resubmissions > 0 ? <Badge tone="warn">Resubmitted ×{app.resubmissions}</Badge> : null}>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Answer label="Kind">{kind ? (kind === "business" ? "🏢 Business" : kind === "individual" ? "🙋 Individual" : kind) : "—"}</Answer>
        <Answer label="City">{text(app, "city")}</Answer>
        <Answer label="Display name">{text(app, "displayName")}</Answer>
        <Answer label="Legal name">{text(app, "legalName")}</Answer>
        <Answer label="Categories" wide>
          {categories.length ? (
            <span className="flex flex-wrap gap-1.5">
              {categories.map((c) => (
                <span key={c} className="inline-flex h-8 items-center gap-1.5 rounded-pill border border-line px-3 text-[13px] font-semibold capitalize text-text">
                  <span aria-hidden>{categoryEmoji(c)}</span>
                  {c}
                </span>
              ))}
            </span>
          ) : "—"}
        </Answer>
        <Answer label="About" wide>{text(app, "about")}</Answer>
        <Answer label="Contact email">{text(app, "contactEmail")}</Answer>
        <Answer label="Phone">{maskPhone(str(app.phone))}</Answer>
      </div>
    </Card>
  );
}

function ExperienceBody({ record, target }: { record: LiveGovernanceRecord; target: Raw }) {
  const previousId = str(record.raw.previousVersionId) ?? str(target.previousVersionId);
  const previous = useLiveDocument(previousId ? "experiences" : null, previousId);
  const orgId = str(record.raw.orgId) ?? str(target.orgId);
  const org = useLiveDocument(orgId ? "organizers" : null, orgId);
  const city = org.data ? str(org.data.city) : null;
  const highlights = Array.isArray(target.highlights) ? target.highlights.length : 0;
  const fields: KeyField[] = [
    ...caseTargetFields("experience-approval", target),
    { label: "Tagline", value: text(target, "tagline") },
    { label: "Highlights", value: highlights ? String(highlights) : "—" },
    { label: "ID required", value: target.idRequired === true ? "Yes" : target.idRequired === false ? "No" : "—" },
    { label: "Revision", value: typeof target.revision === "number" ? String(target.revision) : "—" },
    { label: "Organizer city", value: city ?? "—" },
  ];
  return (
    <div className="grid items-start gap-5 2xl:grid-cols-[auto_minmax(0,1fr)]">
      <div className="flex justify-center rounded-card border border-line-soft bg-[radial-gradient(80%_60%_at_50%_0%,rgba(142,114,255,0.18),transparent_70%)] px-4 py-6">
        <ExperiencePreview experience={target} city={city} />
      </div>
      <div className="flex min-w-0 flex-col gap-5">
        {previousId ? <DiffCard rows={previous.data ? experienceDiff(previous.data, target) : []} loading={previous.loading} missing={!previous.loading && !previous.data} /> : null}
        <Card title="Submitted fields"><Fields fields={fields} /></Card>
      </div>
    </div>
  );
}

function Key({ children, className }: { children: string; className: string }) {
  return <kbd aria-hidden className={cn("ml-0.5 inline-grid h-5 min-w-5 place-items-center rounded-[6px] border px-1 font-display text-[11px] font-bold leading-none", className)}>{children}</kbd>;
}

const OUTCOME_LABEL: Record<string, string> = { approved: "Approved", rejected: "Rejected", "information-requested": "Changes requested" };

export function CaseDetail({
  record,
  permitted,
  roleLabel,
  conflict,
  dual,
  onRefresh,
  onAction,
}: {
  record: LiveGovernanceRecord;
  permitted: boolean;
  roleLabel: string;
  conflict: ConsoleError | null;
  dual: ConsoleError | null;
  onRefresh: () => void;
  onAction: (outcome: CaseOutcome) => void;
}) {
  const raw = record.raw;
  const kind = String(raw.kind ?? "");
  const open = isOpenCase(raw);
  const glyph = caseGlyph(raw);
  const badge = caseBadge(raw.status);
  const risk = str(raw.risk);
  const target = caseTarget(raw);
  const live = useLiveDocument(target.collection, target.id);
  const decision = raw.decision && typeof raw.decision === "object" ? (raw.decision as Raw) : null;
  const previousDecision = raw.previousDecision && typeof raw.previousDecision === "object" ? (raw.previousDecision as Raw) : null;
  const isKyc = kind === "organizer-kyc";

  let body: ReactNode;
  if (!target.collection || !target.id) body = null;
  else if (live.loading) {
    body = (
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-20 rounded-control" />)}
      </div>
    );
  } else if (live.error) body = <Notice tone="warn" title="The submitted record couldn’t be loaded">{live.error}</Notice>;
  else if (!live.data) body = <Notice tone="warn" title="Target not found">The target record was not found. Do not approve without reviewing it.</Notice>;
  else if (isKyc && target.collection === "organizerApplications") body = <KycAnswers app={live.data} />;
  else if (kind === "experience-approval") body = <ExperienceBody record={record} target={live.data} />;
  else {
    const fields = caseTargetFields(kind, live.data);
    body = <Card title={`Submitted record · ${target.collection}`}><Fields fields={fields.length ? fields : rawFields(live.data)} /></Card>;
  }

  return (
    <div className="flex min-w-0 flex-col gap-5 pb-4">
      <header className="relative overflow-hidden rounded-card border border-line-soft bg-[rgba(26,23,38,0.62)] p-5 backdrop-blur-[12px]">
        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(60%_100%_at_10%_0%,rgba(142,114,255,0.22),transparent_70%)]" />
        <div className="relative flex flex-wrap items-start gap-4">
          <Glyph emoji={glyph.emoji} tone={glyph.tone} className="h-14 w-14 rounded-[18px] text-[28px]" />
          <div className="min-w-0 flex-1">
            <p className="overline font-semibold">{KIND_LABEL[kind] ?? (kind || "Case")}</p>
            <h2 className="mt-1 break-words font-display text-[28px] font-bold leading-[1.1] tracking-[-0.03em] text-text">{record.primary}</h2>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <Badge tone={badge.tone}>{badge.label}</Badge>
              {risk ? <Badge tone={RISK_TONE[risk] ?? "muted"}>{risk} risk</Badge> : null}
              {str(raw.previousVersionId) ? <Badge tone="info">Revision</Badge> : null}
              <Badge tone="muted">v{record.version}</Badge>
              {str(raw.policyVersion) ? <Badge tone="muted">{String(raw.policyVersion)}</Badge> : null}
            </div>
          </div>
        </div>
        <p className="relative mt-4 text-[13.5px] leading-[1.5] text-text-2">{text(raw, "summary")}</p>
        <div className="relative mt-3 flex flex-wrap gap-1.5">
          <CopyId label="Case" value={record.id} />
          {target.id ? <CopyId label={target.collection ?? "Target"} value={target.id} /> : null}
          {str(raw.orgId) ? <CopyId label="Org" value={String(raw.orgId)} /> : null}
        </div>
        <p className="relative mt-3 text-[12px] text-text-3">
          Submitted {formatDateTime(raw.createdAt)}
          {str(raw.organizerName) && !isKyc ? <> · by {String(raw.organizerName)}</> : null}
        </p>
      </header>

      {conflict ? (
        <Notice
          tone="warn"
          title="This changed since you opened it"
          action={<Button variant="ghost" size="sm" icon={<RotateCw />} onClick={onRefresh}>Refresh</Button>}
        >
          {conflict.message}
          {conflict.nextStep ? <> {conflict.nextStep}</> : null}
        </Notice>
      ) : null}
      {dual ? (
        <Notice tone="warn" title="Needs a second admin">
          {dual.message}
          {dual.nextStep ? <> {dual.nextStep}</> : null}
        </Notice>
      ) : null}

      {!open ? (
        <Notice tone="info" title={`Decided · ${OUTCOME_LABEL[String(raw.status)] ?? String(raw.status)}`}>
          This case has already reached a final decision.
          {decision ? <> {str(decision.note) ? <>Note: “{String(decision.note)}”. </> : null}{formatDateTime(decision.decidedAt)}.</> : null}
          {isKyc && live.data && canReissueOrganizerCode(live.data) ? (
            <Link href="/approvals?view=codes" className="focus-ring ml-1 inline-flex items-center gap-1 rounded-[6px] font-semibold text-primary hover:underline">
              <KeyRound aria-hidden className="h-3.5 w-3.5" />Manage Organizer Code
            </Link>
          ) : null}
        </Notice>
      ) : null}

      {previousDecision && str(previousDecision.note) ? (
        <Notice tone="info" title="Earlier, changes were requested">“{String(previousDecision.note)}”</Notice>
      ) : null}

      {body}

      <Card title="Case">
        <Fields
          fields={[
            { label: "Kind", value: KIND_LABEL[kind] ?? (kind || "—") },
            { label: "Status", value: String(raw.status ?? "—") },
            { label: "Summary", value: text(raw, "summary") },
            { label: "Policy", value: text(raw, "policyVersion") },
            { label: "Submitted", value: formatDateTime(raw.createdAt) },
          ]}
        />
      </Card>

      <div className="sticky bottom-3 z-10 mt-1">
        <div className="flex flex-wrap items-center gap-2.5 rounded-[22px] border border-line-soft bg-[rgba(18,16,28,0.86)] p-2.5 pl-4 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.75)] backdrop-blur-[18px]">
          {!permitted ? (
            <p className="flex flex-1 items-center gap-2 py-1.5 text-[13px] text-text-2" data-testid="actions-read-only">
              <Lock aria-hidden className="h-4 w-4 text-text-3" />
              Read-only for your role ({roleLabel}). Only a Platform Owner or Super Admin can decide cases. The server enforces the same rule.
            </p>
          ) : !open ? (
            <p className="flex flex-1 items-center gap-2 py-1.5 text-[13px] text-text-2">
              <Check aria-hidden className="h-4 w-4 text-ok" />
              No actions left on this case.
            </p>
          ) : (
            <>
              <p className="mr-auto hidden min-w-0 text-[12.5px] text-text-3 xl:block">Every decision needs a note and lands in the audit trail.</p>
              <Button variant="danger" className="max-xl:ml-auto" onClick={() => onAction("rejected")} aria-keyshortcuts="R">
                Reject <Key className="border-[rgba(255,97,120,0.4)] text-err">R</Key>
              </Button>
              <Button variant="ghost" onClick={() => onAction("information-requested")} aria-keyshortcuts="C">
                Request changes <Key className="border-line text-text-2">C</Key>
              </Button>
              <Button variant="volt" onClick={() => onAction("approved")} aria-keyshortcuts="A">
                {isKyc ? "Approve host" : "Approve"} <Key className="border-[rgba(20,22,11,0.35)] bg-[rgba(20,22,11,0.1)] text-on-volt">A</Key>
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
