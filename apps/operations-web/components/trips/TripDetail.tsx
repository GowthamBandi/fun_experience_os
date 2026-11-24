"use client";

import type { ReactNode } from "react";
import { Badge, CopyIdPill } from "@/components/pulse";
import { mapsUrl } from "@/lib/maps";
import { Field, Fields, Note, OrgLink, SectionTitle, When } from "@/components/money/MoneyBits";
import { cn } from "@/lib/format";
import {
  daysLabel,
  departureRange,
  draftFacts,
  isRevision,
  priceDeltaLabel,
  roomPolicyLabel,
  rupees,
  totalSeats,
  tripBadge,
  tripStyle,
  type TripDay,
  type TripPoint,
  type TripRow,
} from "@/lib/trips";

/** Icons from the app are emoji or Material names; only emoji are shown. */
const glyph = (icon: string | null): string | null => (icon && /[^\u0000-\u007F]/.test(icon) ? icon : null);

function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <SectionTitle>{title}</SectionTitle>
        {count !== undefined ? <Badge tone="muted">{count}</Badge> : null}
      </div>
      {children}
    </section>
  );
}

function Empty({ children = "Not provided." }: { children?: ReactNode }) {
  return <p className="rounded-control border border-dashed border-line px-3.5 py-2.5 text-[13px] text-text-3">{children}</p>;
}

function Bullets({ items, tone }: { items: string[]; tone?: "ok" | "err" }) {
  if (!items.length) return <Empty />;
  return (
    <ul className="flex flex-col gap-1.5 text-[13px] leading-[1.5] text-text">
      {items.map((item, i) => (
        <li key={`${i}-${item}`} className="flex gap-2">
          <span aria-hidden className={cn("mt-[7px] h-1.5 w-1.5 shrink-0 rounded-pill", tone === "ok" ? "bg-ok" : tone === "err" ? "bg-err" : "bg-text-3")} />
          <span className="min-w-0 break-words">{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Chips({ items }: { items: string[] }) {
  if (!items.length) return <span className="text-text-3">—</span>;
  return (
    <span className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span key={item} className="inline-flex h-7 items-center rounded-pill border border-line px-2.5 text-[12px] font-semibold text-text-2">{item}</span>
      ))}
    </span>
  );
}

function Tile({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-control border border-line-soft bg-[rgba(255,255,255,0.03)] p-3.5", className)}>{children}</div>;
}

function Day({ day, index }: { day: TripDay; index: number }) {
  return (
    <li>
      <Tile>
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="overline !text-[11px] font-semibold">Day {index + 1}</span>
          <h4 className="min-w-0 flex-1 font-display text-[15px] font-bold tracking-[-0.01em] text-text">{day.title}</h4>
          {day.overnightTransit ? <Badge tone="info">Overnight transit</Badge> : null}
        </div>
        {day.summary ? <p className="mt-1.5 text-[13px] leading-[1.5] text-text-2">{day.summary}</p> : null}

        {day.activities.length ? (
          <ol aria-label={`Day ${index + 1} activities`} className="mt-3 flex flex-col gap-2 border-l border-line-soft pl-3">
            {day.activities.map((a, i) => (
              <li key={i} className="grid grid-cols-[4.5rem_1fr] gap-2 text-[13px]">
                <span className="num text-text-3">{a.time ?? "—"}</span>
                <span className="min-w-0">
                  <span className="font-semibold text-text">
                    {glyph(a.icon) ? <span aria-hidden className="mr-1">{glyph(a.icon)}</span> : null}
                    {a.title}
                  </span>
                  {a.detail ? <span className="block break-words text-text-2">{a.detail}</span> : null}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-3 text-[12.5px] text-text-3">No activities listed.</p>
        )}

        {day.mealPlan.length ? (
          <div className="mt-3">
            <p className="text-[12px] font-semibold text-text-3">Meals</p>
            <ul className="mt-1.5 flex flex-col gap-1.5">
              {day.mealPlan.map((m, i) => (
                <li key={i} className="text-[13px] text-text">
                  <span className="font-semibold">{m.meal}</span>
                  {m.time ? <span className="num text-text-3"> · {m.time}</span> : null}
                  {m.place ? <span className="text-text-2"> · {m.place}</span> : null}
                  {m.menu ? <span className="block break-words text-text-2">{m.menu}</span> : null}
                  {m.diets.length ? <span className="block text-[12px] text-text-3">{m.diets.join(", ")}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : day.meals.length ? (
          <p className="mt-3 text-[13px] text-text-2">
            <span className="font-semibold text-text-3">Meals:</span> {day.meals.join(", ")}
          </p>
        ) : null}

        {day.stay || day.travel ? (
          <dl className="mt-3 grid gap-1 text-[13px]">
            {day.stay ? (
              <div className="flex gap-2"><dt className="text-text-3">Stay</dt><dd className="min-w-0 break-words text-text">{day.stay}</dd></div>
            ) : null}
            {day.travel ? (
              <div className="flex gap-2"><dt className="text-text-3">Travel</dt><dd className="min-w-0 break-words text-text">{day.travel}</dd></div>
            ) : null}
          </dl>
        ) : null}
      </Tile>
    </li>
  );
}

function Points({ title, points, note }: { title: string; points: TripPoint[]; note: string | null }) {
  return (
    <Tile>
      <p className="text-[12px] font-semibold text-text-3">{title}</p>
      {points.length ? (
        <ul className="mt-2 flex flex-col gap-1.5">
          {points.map((p) => (
            <li key={p.id} className="text-[13px]">
              <span className="num mr-1.5 text-text-3">{p.time ?? "—"}</span>
              <span className="font-semibold text-text">{p.name}</span>
              {p.landmark ? <span className="block text-[12px] text-text-2">{p.landmark}</span> : null}
              {p.spot ? (
                <a
                  href={mapsUrl(p.spot)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="focus-ring block w-fit rounded-[6px] text-[12px] font-semibold text-text underline-offset-2 hover:underline"
                >
                  Exact pin ↗
                </a>
              ) : (
                <span className="block text-[12px] text-text-3">No exact pin</span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[13px] text-text-3">None listed.</p>
      )}
      {note ? <p className="mt-2 text-[12.5px] leading-[1.45] text-text-2">{note}</p> : null}
    </Tile>
  );
}

/** The full submitted draft, laid out in the order an operator reviews it. */
export function TripDetail({ row, now }: { row: TripRow; now: Date | null }) {
  const d = row.draft;
  const style = tripStyle(row.style);
  const badge = tripBadge(row.status);
  const seats = totalSeats(d.departures);
  const names = row.orgId ? { [row.orgId]: row.organizerName } : {};

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={badge.tone}>{badge.label}</Badge>
          {isRevision(row) ? <Badge tone="info">Revision of a live trip</Badge> : <Badge tone="muted">New trip</Badge>}
          <Badge tone="muted">v{row.version}</Badge>
          <CopyIdPill id={row.id} noun="trip draft" />
        </div>
        <p className="mt-3 text-[13px] text-text-3">
          <span aria-hidden className="mr-1">{style.emoji}</span>
          {style.label} · {daysLabel(row.durationDays)} · {[d.destination ?? row.destination, d.region].filter(Boolean).join(", ") || "—"}
        </p>
        {d.tagline ? <p className="mt-1.5 text-[15px] leading-[1.45] text-text">{d.tagline}</p> : null}
        <p className="num mt-3 font-display text-[32px] font-bold leading-none tracking-[-0.03em] text-text">
          {rupees(row.priceFrom)}
          <span className="ml-2 text-[13px] font-semibold tracking-normal text-text-3">per person, from</span>
          {d.compareAt !== null ? <span className="ml-2 text-[14px] font-semibold tracking-normal text-text-3 line-through">{rupees(d.compareAt)}</span> : null}
        </p>
      </div>

      {isRevision(row) ? (
        <Note>
          This is an edit of a trip that is already live (<span className="font-mono text-[12px]">{row.tripId}</span>). Approving replaces the live version; rejecting or requesting changes leaves the live version as it is.
        </Note>
      ) : null}
      {row.reviewerNote ? (
        <Note tone="warn">
          <strong>{row.status === "in-review" ? "Earlier review note" : "Review note"}:</strong> “{row.reviewerNote}”
        </Note>
      ) : null}

      <Fields label="Submission">
        <Field label="Organizer"><OrgLink id={row.orgId} names={names} /></Field>
        <Field label="Submitted"><When at={row.submittedAt} now={now} /></Field>
        <Field label="Submitted by" mono>{row.submittedBy ?? "—"}</Field>
        {row.decidedAt ? <Field label="Decided"><When at={row.decidedAt} now={now} /></Field> : null}
        {row.decidedBy ? <Field label="Decided by" mono>{row.decidedBy}</Field> : null}
        <Field label="Live trip" mono>{row.tripId ?? "—"}</Field>
      </Fields>

      <Section title="At a glance">
        <div className="grid gap-2.5 sm:grid-cols-3">
          {draftFacts(d).map((f) => (
            <Tile key={f.label}>
              <p className="overline !text-[11px] font-semibold">{f.label}</p>
              <p className="mt-1 break-words text-[13.5px] text-text">{f.value}</p>
            </Tile>
          ))}
        </div>
        {d.route.length ? (
          <p className="text-[13px] text-text-2">
            <span className="font-semibold text-text-3">Route:</span> {d.route.join(" → ")}
          </p>
        ) : null}
        {d.highlights.length ? <Bullets items={d.highlights} /> : null}
      </Section>

      <Section title="Departures" count={d.departures.length}>
        {d.departures.length ? (
          <ul className="flex flex-col gap-2">
            {d.departures.map((x) => (
              <li key={x.id}>
                <Tile className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
                  <span className="min-w-0 flex-1 font-semibold text-text">{departureRange(x.start, x.end)}</span>
                  {x.longWeekend ? <Badge tone="volt">{x.longWeekend}</Badge> : null}
                  <span className="num text-text-2">{x.seatsTotal ?? "—"} seats</span>
                  <span className="num text-text-2">{priceDeltaLabel(x.priceDelta)}</span>
                </Tile>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No departures — the trip can’t be booked.</Empty>
        )}
        {seats !== null ? <p className="text-[12.5px] text-text-3">{seats} seats across all departures.</p> : null}
      </Section>

      <Section title="Rooms & pricing" count={d.rooms.length}>
        {d.rooms.length ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {d.rooms.map((r) => (
              <li key={r.id}>
                <Tile>
                  <p className="font-semibold text-text">{r.label}</p>
                  <p className="num mt-0.5 font-display text-[18px] font-bold text-text">{rupees(r.price)}<span className="ml-1 text-[12px] font-semibold text-text-3">per person</span></p>
                  <p className="mt-1 text-[12.5px] text-text-2">
                    {r.occupancy !== null ? `${r.occupancy} per room` : "Occupancy —"}
                    {r.beds ? ` · ${r.beds}` : ""}
                  </p>
                </Tile>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No room options.</Empty>
        )}
        <Fields label="Pricing terms">
          <Field label="Room policy">{roomPolicyLabel(d.roomPolicy)}</Field>
          {d.roomNote ? <Field label="Room note">{d.roomNote}</Field> : null}
          <Field label="Deposit">{d.deposit !== null ? `${rupees(d.deposit)} per person` : "—"}</Field>
          <Field label="Compare-at price">{rupees(d.compareAt)}</Field>
        </Fields>
      </Section>

      <Section title="Add-ons" count={d.addOns.length}>
        {d.addOns.length ? (
          <ul className="flex flex-col gap-2">
            {d.addOns.map((a) => (
              <li key={a.id}>
                <Tile className="flex items-start gap-3 text-[13px]">
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold text-text">
                      {glyph(a.icon) ? <span aria-hidden className="mr-1">{glyph(a.icon)}</span> : null}
                      {a.title}
                    </span>
                    {a.description ? <span className="block break-words text-text-2">{a.description}</span> : null}
                  </span>
                  <span className="num font-semibold text-text">{rupees(a.price)}</span>
                </Tile>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No add-ons.</Empty>
        )}
      </Section>

      <Section title="Itinerary" count={d.days.length}>
        {d.days.length ? (
          <ol className="flex flex-col gap-2.5">
            {d.days.map((day, i) => <Day key={i} day={day} index={i} />)}
          </ol>
        ) : (
          <Empty>No days planned.</Empty>
        )}
      </Section>

      <Section title="Stays" count={d.stays.length}>
        {d.stays.length ? (
          <ul className="flex flex-col gap-2">
            {d.stays.map((s, i) => (
              <li key={i}>
                <Tile className="text-[13px]">
                  <p className="font-semibold text-text">
                    {s.name}
                    {s.type ? <span className="font-normal text-text-3"> · {s.type}</span> : null}
                  </p>
                  <p className="text-text-2">
                    {[s.location, s.nights !== null ? `${s.nights} night${s.nights === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ") || "—"}
                  </p>
                  {s.note ? <p className="mt-1 text-[12.5px] text-text-2">{s.note}</p> : null}
                </Tile>
              </li>
            ))}
          </ul>
        ) : (
          <Empty />
        )}
      </Section>

      <Section title="Transport" count={d.vehicles.length}>
        {d.transport ? <p className="text-[13px] leading-[1.5] text-text-2">{d.transport}</p> : null}
        {d.vehicles.length ? (
          <ul className="flex flex-col gap-2">
            {d.vehicles.map((v, i) => (
              <li key={i}>
                <Tile className="text-[13px]">
                  <p className="font-semibold text-text">
                    {v.type}
                    {v.model ? <span className="font-normal text-text-2"> · {v.model}</span> : null}
                  </p>
                  <p className="text-text-2">
                    {[v.leg, v.seats !== null ? `${v.seats} seats` : null, v.ac === true ? "AC" : v.ac === false ? "Non-AC" : null].filter(Boolean).join(" · ") || "—"}
                  </p>
                  {v.features.length ? <p className="mt-1 text-[12.5px] text-text-3">{v.features.join(", ")}</p> : null}
                </Tile>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No vehicles listed.</Empty>
        )}
      </Section>

      <Section title="Pickups & drops">
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Points title="Pickups" points={d.pickups} note={d.reportingNote} />
          <Points title="Drops" points={d.drops} note={d.returnNote} />
        </div>
      </Section>

      <Section title="Food">
        <Fields label="Food">
          <Field label="Diets"><Chips items={d.diets} /></Field>
          <Field label="Food note">{d.foodNote ?? "—"}</Field>
        </Fields>
      </Section>

      <Section title="What’s included">
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Tile>
            <p className="mb-2 text-[12px] font-semibold text-ok">Included</p>
            <Bullets items={d.inclusions} tone="ok" />
          </Tile>
          <Tile>
            <p className="mb-2 text-[12px] font-semibold text-err">Not included</p>
            <Bullets items={d.exclusions} tone="err" />
          </Tile>
        </div>
      </Section>

      {d.goodies.length ? (
        <Section title="Goodies & moments" count={d.goodies.length}>
          <ul className="flex flex-col gap-2">
            {d.goodies.map((g, i) => (
              <li key={i}>
                <Tile className="text-[13px]">
                  <p className="font-semibold text-text">
                    {g.title}
                    {g.moment ? <span className="font-normal text-text-3"> · {g.moment}</span> : null}
                  </p>
                  {g.detail ? <p className="text-text-2">{g.detail}</p> : null}
                </Tile>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Rules" count={d.rules.length}>
        <Bullets items={d.rules} />
        {d.luggageNote ? <p className="text-[13px] text-text-2"><span className="font-semibold text-text-3">Luggage:</span> {d.luggageNote}</p> : null}
      </Section>

      {d.facts.length ? (
        <Section title="Good to know" count={d.facts.length}>
          <ul className="grid gap-2 sm:grid-cols-2">
            {d.facts.map((f, i) => (
              <li key={i}>
                <Tile className="text-[13px]">
                  <p className="font-semibold text-text">
                    {glyph(f.icon) ? <span aria-hidden className="mr-1">{glyph(f.icon)}</span> : null}
                    {f.title}
                  </p>
                  {f.text ? <p className="text-text-2">{f.text}</p> : null}
                </Tile>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Trip captain">
        <Fields label="Trip captain">
          <Field label="Name">{d.captainName ?? "—"}</Field>
          <Field label="Role">{d.captainRole ?? "—"}</Field>
          <Field label="Bio">{d.captainBio ?? "—"}</Field>
          <Field label="Languages"><Chips items={d.languages} /></Field>
          <Field label="Certifications"><Chips items={d.certifications} /></Field>
        </Fields>
      </Section>

      <Section title="Packing list">
        {d.packing.length ? (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {d.packing.map((p) => (
              <Tile key={p.category}>
                <p className="mb-2 text-[12px] font-semibold capitalize text-text-3">{p.category}</p>
                <Bullets items={p.items} />
              </Tile>
            ))}
          </div>
        ) : (
          <Empty />
        )}
      </Section>

      <Section title="FAQs" count={d.faqs.length}>
        {d.faqs.length ? (
          <ul className="flex flex-col gap-2">
            {d.faqs.map((f, i) => (
              <li key={i}>
                <Tile className="text-[13px]">
                  <p className="font-semibold text-text">{f.q}</p>
                  <p className="mt-0.5 break-words text-text-2">{f.a ?? "—"}</p>
                </Tile>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No FAQs.</Empty>
        )}
      </Section>
    </div>
  );
}
