"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Building2, CheckCircle2, ChevronDown, ChevronRight, Globe2, Landmark, LayoutGrid, MapPin, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/format";
import { StatusChip } from "@/components/ui/primitives";
import type { SetupStepStatus } from "@/lib/prototype/selectors/setup";
import type { PrototypeState } from "@/lib/prototype/scenarios/state";
import { LinkButton } from "@/components/setup/kit";

/** The eight-step first-run journey as a vertical checklist. */
export function SetupJourney({ steps }: { steps: SetupStepStatus[] }) {
  return (
    <ol className="relative space-y-2">
      {steps.map((s, i) => {
        const done = s.status === "complete";
        const attention = s.status === "needs-attention";
        const current = s.status === "in-progress";
        return (
          <li
            key={s.key}
            className={cn(
              "flex flex-col gap-3 rounded-2xl border px-4 py-3.5 sm:flex-row sm:items-center",
              current ? "border-brand/40 bg-brand-subtle/40 ring-4 ring-brand/5" : "border-edge bg-white",
            )}
          >
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <span
                className={cn(
                  "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                  done ? "bg-emerald-100 text-emerald-700" : attention ? "bg-amber-100 text-amber-700" : current ? "bg-brand text-white shadow-brand" : "bg-slate-100 text-ink-mut",
                )}
                aria-hidden
              >
                {done ? <CheckCircle2 className="h-4 w-4" /> : attention ? <AlertTriangle className="h-4 w-4" /> : i + 1}
              </span>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink-lum">
                  {s.title}
                  {s.count > 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-ink-sec tabular">{s.count}</span>}
                  {attention && <span className="text-xs font-medium text-amber-700">Needs attention</span>}
                  {!done && !attention && !current && <span className="text-xs font-medium text-ink-mut">After step {i}</span>}
                </p>
                <p className="mt-0.5 text-[13px] leading-5 text-ink-mut">{s.explanation}</p>
              </div>
            </div>
            <div className="flex shrink-0 gap-2 pl-11 sm:pl-0">
              {s.count > 0 && (
                <LinkButton href={s.listHref} variant="secondary" size="sm">
                  View
                </LinkButton>
              )}
              {(current || attention || done) && (
                <LinkButton href={s.actionHref} variant={current ? "primary" : "ghost"} size="sm">
                  {s.actionLabel} {current && <ArrowRight className="h-3.5 w-3.5" />}
                </LinkButton>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Franchise → territory → city → venue → playing area as an expandable tree. */
export function SetupTree({ state }: { state: PrototypeState }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !(o[id] ?? true) }));
  const isOpen = (id: string) => open[id] ?? true;

  if (state.franchises.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-mut">Nothing created yet. Start with a franchise.</p>;
  }

  const Node = ({ id, href, icon, label, status, children, addHref, addLabel, depth }: { id: string; href: string; icon: React.ReactNode; label: string; status: string; children?: React.ReactNode; addHref?: string; addLabel?: string; depth: number }) => (
    <li>
      <div className="group flex items-center gap-2 rounded-lg py-1.5 pr-2 hover:bg-slate-50" style={{ paddingLeft: depth * 20 + 4 }}>
        {children !== undefined ? (
          <button type="button" onClick={() => toggle(id)} aria-label={isOpen(id) ? `Collapse ${label}` : `Expand ${label}`} aria-expanded={isOpen(id)} className="rounded p-0.5 text-ink-mut hover:bg-slate-200">
            {isOpen(id) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="w-[18px]" />
        )}
        <span className="text-ink-mut">{icon}</span>
        <Link href={href} className="min-w-0 truncate text-sm font-medium text-ink-lum hover:text-brand">
          {label}
        </Link>
        <StatusChip value={status} className="ml-auto scale-90" />
      </div>
      {children !== undefined && isOpen(id) && (
        <ul>
          {children}
          {addHref && (
            <li style={{ paddingLeft: (depth + 1) * 20 + 26 }} className="py-1">
              <Link href={addHref} className="text-xs font-semibold text-brand hover:underline">
                + {addLabel}
              </Link>
            </li>
          )}
        </ul>
      )}
    </li>
  );

  return (
    <ul className="space-y-0.5">
      {state.franchises.map((f) => (
        <Node key={f.id} id={f.id} depth={0} href={`/franchises/${f.id}`} icon={<Landmark className="h-4 w-4" />} label={f.name} status={f.status} addHref={`/territories/new?franchiseId=${f.id}`} addLabel="Add territory">
          {state.territories
            .filter((t) => t.franchiseId === f.id)
            .map((t) => (
              <Node key={t.id} id={t.id} depth={1} href={`/territories/${t.id}`} icon={<Globe2 className="h-4 w-4" />} label={t.name} status={t.status} addHref={`/cities/new?territoryId=${t.id}`} addLabel="Add city">
                {state.cities
                  .filter((c) => c.territoryId === t.id)
                  .map((c) => (
                    <Node key={c.id} id={c.id} depth={2} href={`/cities/${c.id}`} icon={<MapPin className="h-4 w-4" />} label={c.name} status={c.status} addHref={`/locations/venues/new?cityId=${c.id}`} addLabel="Add venue">
                      {state.venues
                        .filter((v) => v.cityId === c.id)
                        .map((v) => (
                          <Node key={v.id} id={v.id} depth={3} href={`/locations/venues/${v.id}`} icon={<Building2 className="h-4 w-4" />} label={v.name} status={v.status} addHref={`/locations/playing-areas/new?venueId=${v.id}`} addLabel="Add playing area">
                            {state.playingAreas
                              .filter((p) => p.venueId === v.id)
                              .map((p) => (
                                <Node key={p.id} id={p.id} depth={4} href={`/locations/playing-areas/${p.id}`} icon={<LayoutGrid className="h-4 w-4" />} label={`${p.name} · ${p.maxCapacity} people`} status={p.status} />
                              ))}
                          </Node>
                        ))}
                    </Node>
                  ))}
              </Node>
            ))}
        </Node>
      ))}
    </ul>
  );
}


/** Recent audit entries that mention this record, newest first. */
export function RecordActivity({ state, match, limit = 8 }: { state: PrototypeState; match: string[]; limit?: number }) {
  const needles = match.filter(Boolean).map((m) => m.toLowerCase());
  const rows = state.audits.filter((a) => needles.some((n) => a.description.toLowerCase().includes(n))).slice(0, limit);
  const who = (id: string) => state.operators.find((o) => o.id === id)?.name ?? (id === "system" ? "System" : id);
  if (!rows.length) return <p className="py-4 text-center text-sm text-ink-mut">No recorded changes yet.</p>;
  return (
    <ol className="space-y-3">
      {rows.map((a) => (
        <li key={a.id} className="flex gap-3">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand/60" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink-lum">{a.action}</p>
            <p className="text-[13px] leading-5 text-ink-sec">{a.description}</p>
            <p className="mt-0.5 text-xs text-ink-mut">
              {who(a.operatorId)} · {a.at ? new Date(a.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : a.timestamp}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
