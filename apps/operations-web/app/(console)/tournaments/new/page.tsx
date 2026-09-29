"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { useStore } from "@/lib/store";
import { toLocalInput } from "@/lib/safety/time";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { Button } from "@/components/ui/primitives";
import { Field, Input, Select } from "@/components/ui/fields";
import { useToast } from "@/components/ui/toast";
import { PermissionNote, useTournamentGate } from "@/components/safety/shared";

const suggestCode = (name: string) => {
  const letters = name.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
  return letters.length >= 2 ? `${letters}-${new Date().getFullYear()}` : "";
};

export default function NewTournamentPage() {
  const router = useRouter();
  const toast = useToast();
  const { state, territory, canAccess, createTournament } = useStore();
  const gate = useTournamentGate();

  const tomorrow = new Date(Date.now() + 86400000);
  tomorrow.setHours(18, 0, 0, 0);
  const regClose = new Date(tomorrow.getTime() - 2 * 3600000);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);
  const [prize, setPrize] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [venueId, setVenueId] = useState("");
  const [areas, setAreas] = useState<string[]>([]);
  const [seeding, setSeeding] = useState<"seeded" | "random">("seeded");
  const [minTeams, setMinTeams] = useState("4");
  const [maxTeams, setMaxTeams] = useState("8");
  const [matchDuration, setMatchDuration] = useState("30");
  const [breakDuration, setBreakDuration] = useState("10");
  const [start, setStart] = useState(toLocalInput(tomorrow));
  const [closes, setCloses] = useState(toLocalInput(regClose));
  const [verification, setVerification] = useState<"referee" | "dual">("referee");
  const [error, setError] = useState<string | undefined>();

  const venues = useMemo(() => state.venues.filter((v) => v.territoryId === territory.id), [state.venues, territory.id]);
  const venueAreas = state.playingAreas.filter((p) => p.venueId === venueId);
  const templates = state.templates.filter((t) => (t as { status?: string }).status !== "archived");
  const createGate = gate("tournament.create", territory.id);

  if (!canAccess("/tournaments")) return <PermissionDenied module="Tournaments" />;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const startIso = start ? new Date(start).toISOString() : undefined;
    const closesIso = closes ? new Date(closes).toISOString() : undefined;
    if (startIso && closesIso && closesIso > startIso) {
      setError("Registration must close before the tournament starts.");
      return;
    }
    const r = createTournament({
      name,
      code: code.trim().toUpperCase(),
      experienceTemplateId: templateId || undefined,
      territoryId: territory.id,
      venueId,
      playingAreaIds: areas,
      format: "single-elimination",
      minimumTeams: Number(minTeams),
      maximumTeams: Number(maxTeams),
      matchDuration: Number(matchDuration),
      breakDuration: Number(breakDuration),
      seedingMethod: seeding,
      verificationRequirement: verification,
      prizePlaceholder: prize,
      scheduledStart: startIso,
      registrationClosesAt: closesIso,
    });
    if (r.error) {
      setError(r.error);
      return;
    }
    toast.success("Tournament created", "Enter the teams next, then draw the bracket.");
    router.push(`/tournaments/${r.id}`);
  }

  return (
    <div className="mx-auto w-full max-w-[920px] space-y-6 px-5 py-7 lg:px-8">
      <Link href="/tournaments" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-mut hover:text-ink-lum">
        <ArrowLeft className="h-4 w-4" /> Tournaments
      </Link>
      <PageHeader overline={`New tournament · ${territory.name}`} title="Create a knockout tournament" sub="Set up the event. Teams are entered on the next screen, then you draw the bracket and publish." />
      <PermissionNote reason={createGate.reason} />

      <form onSubmit={submit} className="space-y-5">
        <section className="rounded-panel border border-edge bg-white p-5 shadow-panel">
          <h2 className="text-[15px] font-semibold text-ink-lum">Details</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Tournament name">
              <Input value={name} onChange={(e) => { setName(e.target.value); if (!codeTouched) setCode(suggestCode(e.target.value)); }} placeholder="e.g. Monsoon Table Tennis Open" required minLength={3} />
            </Field>
            <Field label="Short code" hint="3–16 capital letters, digits or dashes. Must be unique.">
              <Input value={code} onChange={(e) => { setCode(e.target.value.toUpperCase()); setCodeTouched(true); }} placeholder="MTTO-2026" required className="font-mono" />
            </Field>
            <Field label="Prize (optional)">
              <Input value={prize} onChange={(e) => setPrize(e.target.value)} placeholder="e.g. Trophy + ₹2,000 voucher" />
            </Field>
            <Field label="Experience (optional)">
              <Select className="h-11" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                <option value="">No linked experience</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </Select>
            </Field>
          </div>
        </section>

        <section className="rounded-panel border border-edge bg-white p-5 shadow-panel">
          <h2 className="text-[15px] font-semibold text-ink-lum">Venue & format</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Venue" hint={venues.length ? undefined : `No venues in ${territory.name}. Add one in Setup first.`}>
              <Select className="h-11" value={venueId} onChange={(e) => { setVenueId(e.target.value); setAreas([]); }} required>
                <option value="">Choose a venue…</option>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Format" hint="Round-robin and group stages are not available yet.">
              <Input value="Single elimination (knockout)" readOnly aria-readonly className="bg-bg-sunken" />
            </Field>
          </div>
          {venueAreas.length > 0 && (
            <fieldset className="mt-4">
              <legend className="mb-2 text-[13px] font-medium text-ink-sec">Playing areas (matches in the same round run in parallel)</legend>
              <div className="flex flex-wrap gap-2">
                {venueAreas.map((p) => (
                  <label key={p.id} className="inline-flex items-center gap-2 rounded-xl border border-edge px-3 py-2 text-sm text-ink-sec has-[:checked]:border-brand has-[:checked]:bg-brand-subtle has-[:checked]:text-brand-ink">
                    <input type="checkbox" className="accent-[#5b4cf5]" checked={areas.includes(p.id)} onChange={(e) => setAreas(e.target.checked ? [...areas, p.id] : areas.filter((x) => x !== p.id))} />
                    {p.name}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="Seeding">
              <Select className="h-11" value={seeding} onChange={(e) => setSeeding(e.target.value as "seeded" | "random")}>
                <option value="seeded">Seeded (you set the order)</option>
                <option value="random">Random draw</option>
              </Select>
            </Field>
            <Field label="Minimum teams">
              <Input type="number" min={2} max={64} value={minTeams} onChange={(e) => setMinTeams(e.target.value)} required />
            </Field>
            <Field label="Maximum teams">
              <Input type="number" min={2} max={64} value={maxTeams} onChange={(e) => setMaxTeams(e.target.value)} required />
            </Field>
          </div>
        </section>

        <section className="rounded-panel border border-edge bg-white p-5 shadow-panel">
          <h2 className="text-[15px] font-semibold text-ink-lum">Schedule & results</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Registration closes">
              <Input type="datetime-local" value={closes} onChange={(e) => setCloses(e.target.value)} />
            </Field>
            <Field label="First match starts">
              <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="Match length (minutes)">
              <Input type="number" min={5} max={240} value={matchDuration} onChange={(e) => setMatchDuration(e.target.value)} required />
            </Field>
            <Field label="Break between matches (minutes)">
              <Input type="number" min={0} max={120} value={breakDuration} onChange={(e) => setBreakDuration(e.target.value)} required />
            </Field>
          </div>
          <Field label="Result verification">
            <Select className="h-11" value={verification} onChange={(e) => setVerification(e.target.value as "referee" | "dual")}>
              <option value="referee">Verified by a coordinator or manager (can be the scorer)</option>
              <option value="dual">Two-person check (verifier must differ from the scorer)</option>
            </Select>
          </Field>
        </section>

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Link href="/tournaments" className="inline-flex h-10 items-center rounded-xl border border-edge-strong bg-white px-4 text-sm font-semibold text-ink-lum shadow-lift hover:bg-bg-sunken">Cancel</Link>
          <Button type="submit" disabled={!createGate.allowed || name.trim().length < 3 || !venueId}>Create tournament</Button>
        </div>
      </form>
    </div>
  );
}
