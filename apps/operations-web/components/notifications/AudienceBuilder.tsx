"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, Globe2, Info, MapPin, Store, UserMinus, UserRound, Users } from "lucide-react";
import { Avatar, Badge, Skeleton } from "@/components/pulse";
import { fetchDisplayNames } from "@/lib/customers-firestore";
import { cn, countFull } from "@/lib/format";
import { fetchOrgNames, previewAudience, searchAccounts, searchOrganizations } from "@/lib/notifications-api";
import {
  AUDIENCE_META,
  AUDIENCE_TYPES,
  audienceKey,
  audienceProblems,
  audienceSummary,
  isLimitedAudience,
  LIMITS,
  pushRoute,
  toAudience,
  type AccountHit,
  type AudienceForm,
  type AudiencePreview,
  type AudienceType,
  type Platform,
} from "@/lib/notifications";
import { readServiceCities } from "@/lib/service-cities";
import { useLiveDocument } from "@/lib/use-governance";
import { readErrorMessage } from "@/lib/use-query";
import { Field, Segmented, TextInput } from "./FormBits";
import { RemovableChip, SearchPicker } from "./SearchPicker";

const TYPE_ICON: Record<AudienceType, typeof Users> = { all: Globe2, customers: UserRound, organizers: Store, cities: MapPin, users: Users, orgs: Building2 };

/**
 * Who sees it: Everyone / Customers / Organizers / Cities / Specific people /
 * Organizations, narrowed by platform, app build and exclusions, with a live
 * reach estimate from previewAudience.
 */
export function AudienceBuilder({ value, onChange, purpose }: { value: AudienceForm; onChange: (next: AudienceForm) => void; purpose: "announcement" | "notification" }) {
  const set = (patch: Partial<AudienceForm>) => onChange({ ...value, ...patch });
  const cities = useLiveDocument("appConfig", "cities");
  const cityRows = useMemo(() => readServiceCities(cities.data), [cities.data]);
  const [cityDraft, setCityDraft] = useState("");
  const [refine, setRefine] = useState(() => value.platforms.length > 0 || !!value.minBuild || !!value.maxBuild || value.exclude.length > 0);
  useFillNames(value, onChange);

  const accountSearch = (q: string) => searchAccounts(q);
  const personRow = (a: AccountHit) => (
    <>
      <Avatar name={a.displayName ?? a.uid} size={30} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-text">{a.displayName ?? "PULSE member"}</span>
        <span className="block truncate text-[11.5px] text-text-3">
          {[a.phoneMasked, a.role === "organizer" ? `Organizer${a.orgs.length ? ` · ${a.orgs.map((o) => o.name).join(", ")}` : ""}` : "Customer", a.accountStatus !== "active" ? a.accountStatus : null].filter(Boolean).join(" · ")}
        </span>
      </span>
    </>
  );

  const problems = audienceProblems(value);
  const typeOptions = AUDIENCE_TYPES.map((t) => {
    const Icon = TYPE_ICON[t];
    return { value: t, label: <><Icon aria-hidden className="h-3.5 w-3.5" />{AUDIENCE_META[t].label}</>, description: AUDIENCE_META[t].description };
  });

  return (
    <div className="flex flex-col gap-5">
      <Segmented legend="Audience" value={value.type} options={typeOptions} onChange={(type) => set({ type })} />
      <p className="-mt-3 text-[12.5px] text-text-3">{AUDIENCE_META[value.type].description}</p>

      {value.type === "cities" ? (
        <fieldset className="flex flex-col gap-2.5">
          <legend className="mb-1 text-[12px] font-semibold text-text-3">Cities</legend>
          {cities.loading ? (
            <Skeleton className="h-9 w-2/3 rounded-pill" />
          ) : cityRows.length ? (
            <div className="flex flex-wrap gap-1.5">
              {cityRows.map((c) => {
                const on = value.cities.includes(c.name);
                return (
                  <button
                    key={c.key ?? c.name}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set({ cities: on ? value.cities.filter((x) => x !== c.name) : [...value.cities, c.name] })}
                    className={cn(
                      "focus-ring inline-flex h-8 items-center gap-1.5 rounded-pill border px-3 text-[12.5px] font-semibold transition-colors duration-150",
                      on ? "border-text bg-text text-ink" : "border-line text-text-2 hover:text-text",
                      !c.active && !on && "opacity-60",
                    )}
                    title={c.active ? c.state : `${c.state} · switched off in Service cities`}
                  >
                    <MapPin aria-hidden className="h-3.5 w-3.5" />
                    {c.name}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-[12.5px] text-text-3">No service-city list is saved yet (System → Service cities). Type a city below.</p>
          )}
          <div className="flex gap-2">
            <TextInput
              aria-label="Add a city by name"
              value={cityDraft}
              placeholder="Add another city, e.g. Vizag"
              onChange={(e) => setCityDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const c = cityDraft.trim();
                  if (c && !value.cities.includes(c)) set({ cities: [...value.cities, c] });
                  setCityDraft("");
                }
              }}
            />
          </div>
          {value.cities.filter((c) => !cityRows.some((r) => r.name === c)).length ? (
            <div className="flex flex-wrap gap-1.5">
              {value.cities
                .filter((c) => !cityRows.some((r) => r.name === c))
                .map((c) => (
                  <RemovableChip key={c} label={c} onRemove={() => set({ cities: value.cities.filter((x) => x !== c) })}>
                    {c}
                  </RemovableChip>
                ))}
            </div>
          ) : null}
          <p className="flex items-start gap-1.5 text-[12px] leading-[1.45] text-text-3">
            <Info aria-hidden className="mt-[1px] h-3.5 w-3.5 shrink-0" />
            {purpose === "announcement"
              ? "Matched on the city the app sends when it opens (the phone keeps the city; PULSE doesn't store where people are)."
              : "Sent to the city push topics only — there are no inbox items for a city send, and it can't be filtered by platform, build or exclusions."}
          </p>
        </fieldset>
      ) : null}

      {value.type === "users" ? (
        <div className="flex flex-col gap-2.5">
          <SearchPicker<AccountHit>
            label="Find people"
            placeholder="Name, phone digits or user ID"
            search={accountSearch}
            itemKey={(a) => a.uid}
            renderItem={personRow}
            isPicked={(a) => value.people.some((p) => p.uid === a.uid)}
            onPick={(a) => value.people.length < LIMITS.maxUids && set({ people: [...value.people, { uid: a.uid, displayName: a.displayName }] })}
          />
          <ChipList
            empty="No one added yet."
            items={value.people.map((p) => ({ key: p.uid, label: p.displayName ?? p.uid }))}
            onRemove={(key) => set({ people: value.people.filter((p) => p.uid !== key) })}
            counter={`${value.people.length}/${LIMITS.maxUids}`}
          />
        </div>
      ) : null}

      {value.type === "orgs" ? (
        <div className="flex flex-col gap-2.5">
          <SearchPicker<{ orgId: string; name: string; city: string | null }>
            label="Find organizations"
            placeholder="Organization name"
            search={searchOrganizations}
            itemKey={(o) => o.orgId}
            renderItem={(o) => (
              <>
                <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[10px] bg-[rgba(142,114,255,0.18)] text-[#C2B4FF]">
                  <Store aria-hidden className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-text">{o.name}</span>
                  <span className="block truncate text-[11.5px] text-text-3">{o.city ?? o.orgId}</span>
                </span>
              </>
            )}
            isPicked={(o) => value.orgs.some((x) => x.orgId === o.orgId)}
            onPick={(o) => value.orgs.length < LIMITS.maxOrgIds && set({ orgs: [...value.orgs, { orgId: o.orgId, name: o.name }] })}
          />
          <ChipList
            empty="No organizations added yet."
            items={value.orgs.map((o) => ({ key: o.orgId, label: o.name ?? o.orgId }))}
            onRemove={(key) => set({ orgs: value.orgs.filter((o) => o.orgId !== key) })}
            counter={`${value.orgs.length}/${LIMITS.maxOrgIds}`}
          />
          <p className="text-[12px] text-text-3">Every active member of these organizations (owners and staff).</p>
        </div>
      ) : null}

      <div className="rounded-control border border-line-soft">
        <button
          type="button"
          aria-expanded={refine}
          onClick={() => setRefine((r) => !r)}
          className="focus-ring flex w-full items-center justify-between gap-3 rounded-control px-4 py-3 text-left text-[13px] font-semibold text-text-2 hover:text-text"
        >
          <span className="inline-flex items-center gap-2">
            <UserMinus aria-hidden className="h-4 w-4 text-text-3" />
            Refine: platform, app build, exclusions
          </span>
          <span className="text-[12px] font-normal text-text-3">{refine ? "Hide" : "Show"}</span>
        </button>
        {refine ? (
          <div className="flex flex-col gap-4 border-t border-line-soft px-4 pb-4 pt-4">
            <Segmented<"both" | Platform>
              legend="Platform"
              size="sm"
              value={value.platforms.length === 1 ? value.platforms[0]! : "both"}
              options={[
                { value: "both", label: "Android + iPhone" },
                { value: "android", label: "Android only" },
                { value: "ios", label: "iPhone only" },
              ]}
              onChange={(p) => set({ platforms: p === "both" ? [] : [p] })}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Minimum app build" error={problems.find((p) => p.field === "minBuild")?.message} hint="Leave empty for any.">
                {({ id, describedBy, invalid }) => <TextInput id={id} aria-describedby={describedBy} invalid={invalid} inputMode="numeric" value={value.minBuild} onChange={(e) => set({ minBuild: e.target.value })} placeholder="e.g. 120" />}
              </Field>
              <Field label="Maximum app build" error={problems.find((p) => p.field === "maxBuild")?.message} hint="Leave empty for any.">
                {({ id, describedBy, invalid }) => <TextInput id={id} aria-describedby={describedBy} invalid={invalid} inputMode="numeric" value={value.maxBuild} onChange={(e) => set({ maxBuild: e.target.value })} placeholder="e.g. 140" />}
              </Field>
            </div>
            <div className="flex flex-col gap-2.5">
              <p className="text-[12px] font-semibold text-text-3">Exclude people</p>
              <SearchPicker<AccountHit>
                label="Find people to exclude"
                placeholder="Name, phone digits or user ID"
                search={accountSearch}
                itemKey={(a) => a.uid}
                renderItem={personRow}
                isPicked={(a) => value.exclude.some((p) => p.uid === a.uid)}
                onPick={(a) => set({ exclude: [...value.exclude, { uid: a.uid, displayName: a.displayName }] })}
              />
              <ChipList
                empty="No one excluded."
                items={value.exclude.map((p) => ({ key: p.uid, label: p.displayName ?? p.uid }))}
                onRemove={(key) => set({ exclude: value.exclude.filter((p) => p.uid !== key) })}
              />
            </div>
          </div>
        ) : null}
      </div>

      {problems.filter((p) => p.field === "audience" || p.field === "exclude").map((p) => (
        <p key={p.message} role="alert" className="text-[12.5px] text-err">
          {p.message}
        </p>
      ))}
    </div>
  );
}

function ChipList({ items, onRemove, empty, counter }: { items: Array<{ key: string; label: string }>; onRemove: (key: string) => void; empty: string; counter?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      {items.length === 0 ? (
        <p className="text-[12.5px] text-text-3">{empty}</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5" aria-label="Selected">
          {items.map((i) => (
            <li key={i.key} className="max-w-full">
              <RemovableChip label={i.label} onRemove={() => onRemove(i.key)}>
                {i.label}
              </RemovableChip>
            </li>
          ))}
        </ul>
      )}
      {counter ? <p className="num text-[11.5px] text-text-3">{counter}</p> : null}
    </div>
  );
}

/** Chips of a saved audience arrive with ids only: look their names up once. */
function useFillNames(value: AudienceForm, onChange: (next: AudienceForm) => void) {
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  const missingPeople = [...value.people, ...value.exclude].filter((p) => p.displayName === null).map((p) => p.uid);
  const missingOrgs = value.orgs.filter((o) => o.name === null).map((o) => o.orgId);
  const key = `${missingPeople.sort().join(",")}|${missingOrgs.sort().join(",")}`;
  const tried = useRef(new Set<string>());
  useEffect(() => {
    if (key === "|" || tried.current.has(key)) return;
    tried.current.add(key);
    let live = true;
    const people = missingPeople.slice(0, 60);
    const orgs = missingOrgs.slice(0, 60);
    Promise.all([people.length ? fetchDisplayNames(people).catch(() => ({})) : Promise.resolve({}), orgs.length ? fetchOrgNames(orgs).catch(() => ({})) : Promise.resolve({})]).then(([names, orgNames]) => {
      if (!live) return;
      const { value: v, onChange: change } = latest.current;
      const n = names as Record<string, string | null>;
      const o = orgNames as Record<string, string | null>;
      const fill = <T extends { uid: string; displayName: string | null }>(xs: T[]) => xs.map((p) => (p.displayName === null && n[p.uid] ? { ...p, displayName: n[p.uid]! } : p));
      change({ ...v, people: fill(v.people), exclude: fill(v.exclude), orgs: v.orgs.map((x) => (x.name === null && o[x.orgId] ? { ...x, name: o[x.orgId]! } : x)) });
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/** The live reach estimate (debounced previewAudience; re-runs only when the audience really changes). */
export function ReachEstimate({ audience, purpose, sendPush }: { audience: AudienceForm; purpose: "announcement" | "notification"; sendPush?: boolean }) {
  const a = useMemo(() => toAudience(audience), [audience]);
  const key = audienceKey(a);
  const blocked = audienceProblems(audience).length > 0;
  const [state, setState] = useState<{ status: "idle" | "loading" | "done" | "error"; preview: AudiencePreview | null; error?: string }>({ status: "idle", preview: null });
  const [attempt, setAttempt] = useState(0);
  const aRef = useRef(a);
  aRef.current = a;

  useEffect(() => {
    if (blocked) {
      setState({ status: "idle", preview: null });
      return;
    }
    let live = true;
    setState((s) => ({ status: "loading", preview: s.preview }));
    const t = window.setTimeout(() => {
      previewAudience(aRef.current).then(
        (preview) => live && setState({ status: "done", preview }),
        (err) => live && setState({ status: "error", preview: null, error: readErrorMessage(err) }),
      );
    }, 600);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [key, blocked, attempt]);

  const p = state.preview;
  const total = p ? Math.max(p.breakdown.customers + p.breakdown.organizers, 1) : 1;
  const route = pushRoute(a);
  return (
    <section aria-label="Reach estimate" aria-live="polite" className="relative overflow-hidden rounded-card border border-[rgba(142,114,255,0.28)] bg-[linear-gradient(160deg,rgba(142,114,255,0.16),rgba(26,23,38,0.7)_55%)] p-5">
      <span aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-primary opacity-[0.18] blur-3xl" />
      <div className="relative flex items-center justify-between gap-3">
        <p className="overline font-semibold">Estimated reach</p>
        {p ? <Badge tone={p.exact ? "ok" : "warn"}>{p.exact ? "Exact" : "Estimate"}</Badge> : null}
      </div>
      <div className="relative mt-2 flex items-baseline gap-2">
        {state.status === "loading" && !p ? (
          <Skeleton className="h-10 w-32 rounded-[12px]" />
        ) : blocked ? (
          <span className="text-[14px] text-text-3">Finish the audience to see the reach.</span>
        ) : state.status === "error" ? (
          <span role="alert" className="text-[13px] text-err">
            {state.error}{" "}
            <button type="button" onClick={() => setAttempt((n) => n + 1)} className="focus-ring rounded font-semibold underline">
              Retry
            </button>
          </span>
        ) : p ? (
          <>
            <span className={cn("num text-[40px] font-bold leading-none text-text transition-opacity", state.status === "loading" && "opacity-50")}>
              {!p.exact && a.type === "cities" ? "≤ " : ""}
              {countFull(p.estimate)}
            </span>
            <span className="text-[14px] text-text-2">{p.estimate === 1 ? "person" : "people"}</span>
          </>
        ) : null}
      </div>
      <p className="relative mt-1.5 text-[12.5px] text-text-3">{audienceSummary(a)}</p>
      {p ? (
        <div className="relative mt-4 flex flex-col gap-2">
          <div aria-hidden className="flex h-2 overflow-hidden rounded-pill bg-surface-high">
            <span className="h-full bg-primary" style={{ width: `${(p.breakdown.customers / total) * 100}%` }} />
            <span className="h-full bg-volt" style={{ width: `${(p.breakdown.organizers / total) * 100}%` }} />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-text-2">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="h-2 w-2 rounded-full bg-primary" /> {countFull(p.breakdown.customers)} customers
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="h-2 w-2 rounded-full bg-volt" /> {countFull(p.breakdown.organizers)} organizers
            </span>
          </div>
          {p.sample.length ? (
            <div className="mt-1">
              <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-text-3">Sample</p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {p.sample.map((s) => (
                  <li key={s.uid} className="inline-flex items-center gap-1.5 rounded-pill bg-[rgba(255,255,255,0.06)] py-0.5 pl-0.5 pr-2.5 text-[12px] text-text-2">
                    <Avatar name={s.displayName ?? s.uid} size={20} />
                    {s.displayName ?? "PULSE member"}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {p.note ? (
            <p className="flex items-start gap-1.5 text-[12px] leading-[1.45] text-warn">
              <Info aria-hidden className="mt-[1px] h-3.5 w-3.5 shrink-0" />
              {p.note}
            </p>
          ) : null}
        </div>
      ) : null}
      {purpose === "notification" || sendPush ? (
        <ul className="relative mt-4 flex flex-col gap-1 border-t border-line-soft pt-3 text-[12px] text-text-3">
          <li>Push: {route === "topic" ? (a.type === "cities" ? "city topics" : "the “all” topic") : "each person's devices"}.</li>
          {isLimitedAudience(a) ? <li>Counts toward the 3 broad pushes a day (shared with Broadcast).</li> : <li>Targeted send: limited to 60 an hour per admin.</li>}
        </ul>
      ) : null}
    </section>
  );
}
