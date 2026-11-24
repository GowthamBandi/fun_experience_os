"use client";

import { useEffect, useState } from "react";
import { MapPin, Trash2 } from "lucide-react";
import { Badge, Button, Card, useToast } from "@/components/pulse";
import { setServiceCities } from "@/lib/governance-api";
import { useLiveDocument } from "@/lib/use-governance";
import {
  activeCount, addCity, newCityProblem, readServiceCities, removeCity, saveProblem, setActive, toPayload,
  type NewCityInput, type ServiceCityRow,
} from "@/lib/service-cities";

const EMPTY: NewCityInput = { name: "", state: "", lat: "", lng: "" };

/**
 * The cities PULSE serves. The app's city pickers list only active cities,
 * and organizers can't send an event or trip for review anywhere else.
 * Until the list is saved once, every city is allowed. Changes need a reason
 * and are audited.
 */
export function ServiceCitiesCard() {
  const live = useLiveDocument("appConfig", "cities");
  const toast = useToast();
  const [saved, setSaved] = useState<ServiceCityRow[]>([]);
  const [rows, setRows] = useState<ServiceCityRow[]>([]);
  const [draft, setDraft] = useState<NewCityInput>(EMPTY);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const exists = live.data !== null;

  useEffect(() => {
    const list = readServiceCities(live.data);
    setSaved(list);
    setRows(list);
  }, [live.data]);

  const addProblem = newCityProblem(rows, draft);
  const typed = draft.name.trim() || draft.state.trim() || draft.lat.trim() || draft.lng.trim();
  const problem = saveProblem(rows, saved, reason, exists);
  const input = "rounded-control border border-line bg-transparent px-3 py-2 text-text";

  const add = () => {
    if (addProblem) return;
    setRows(addCity(rows, draft));
    setDraft(EMPTY);
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await setServiceCities({ cities: toPayload(rows), reason: reason.trim() });
      const on = r.cities.filter((c) => c.active).length;
      toast.show({ tone: "ok", title: "Service cities saved", body: `${on} active of ${r.cities.length}.` });
      setReason("");
    } catch (e) {
      toast.show({ tone: "err", title: "Couldn't save", body: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-5" data-testid="service-cities">
      <div className="mb-1 flex items-center gap-2">
        <MapPin aria-hidden className="h-4 w-4 text-text-3" />
        <h2 className="mr-auto font-display text-[16px] font-bold text-text">Service cities</h2>
        {live.loading ? null : exists ? <Badge tone="ok">{activeCount(saved)} active</Badge> : <Badge tone="warn">Not set: every city allowed</Badge>}
      </div>
      <p className="mb-4 text-[12px] text-text-3">
        People can only pick these cities in the app, and organizers can only send events and trips for review here.
        Switching a city off keeps live listings on sale but stops new ones.
      </p>

      {live.error ? <p role="alert" className="mb-3 text-[13px] text-err">{live.error}</p> : null}

      {rows.length === 0 ? (
        <p className="mb-4 text-[13px] text-text-2">{live.loading ? "Loading…" : "No cities yet. Add the first one below."}</p>
      ) : (
        <ul aria-label="Service cities" className="mb-4 flex flex-col divide-y divide-line rounded-control border border-line">
          {rows.map((c, i) => (
            <li key={`${c.name}-${i}`} className="flex items-center gap-3 px-3 py-2">
              <div className="mr-auto min-w-0">
                <p className="truncate text-[14px] font-semibold text-text">{c.name}</p>
                <p className="truncate text-[12px] text-text-3">
                  {c.state || "—"}
                  {c.lat !== null && c.lng !== null ? ` · ${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}` : " · no map point"}
                  {c.key === null ? " · new" : ""}
                </p>
              </div>
              <label className="flex items-center gap-2 text-[13px] text-text-2">
                <input
                  type="checkbox"
                  role="switch"
                  aria-label={`${c.name} active`}
                  checked={c.active}
                  onChange={(e) => setRows(setActive(rows, i, e.target.checked))}
                />
                {c.active ? "Active" : "Off"}
              </label>
              <button
                type="button"
                aria-label={`Remove ${c.name}`}
                onClick={() => setRows(removeCity(rows, i))}
                className="rounded-control p-1.5 text-text-3 hover:bg-white/5 hover:text-err"
              >
                <Trash2 aria-hidden className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <fieldset className="mb-4 grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-[13px] font-semibold text-text">Add a city</legend>
        <label className="flex flex-col gap-1.5 text-[13px] text-text-2">
          City
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={60} placeholder="Hyderabad" className={input} />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] text-text-2">
          State
          <input value={draft.state} onChange={(e) => setDraft({ ...draft, state: e.target.value })} maxLength={60} placeholder="Telangana" className={input} />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] text-text-2">
          Latitude (optional)
          <input inputMode="decimal" value={draft.lat} onChange={(e) => setDraft({ ...draft, lat: e.target.value })} placeholder="17.385" className={input} />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] text-text-2">
          Longitude (optional)
          <input inputMode="decimal" value={draft.lng} onChange={(e) => setDraft({ ...draft, lng: e.target.value })} placeholder="78.4867" className={input} />
        </label>
        <p className="text-[12px] text-text-3 sm:col-span-2">
          With a map point, “Use my current location” in the app also matches people within about 50 km of the city.
        </p>
        <div className="flex items-center justify-end gap-3 sm:col-span-2">
          {typed && addProblem ? <span className="mr-auto text-[12px] text-warn">{addProblem}</span> : null}
          <Button variant="ghost" onClick={add} disabled={addProblem !== null}>Add city</Button>
        </div>
      </fieldset>

      <label className="flex flex-col gap-1.5 text-[13px] text-text-2">
        Reason (for the audit trail)
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} className={input} />
      </label>
      <div className="mt-4 flex items-center justify-end gap-3">
        {problem && problem !== "No changes yet." ? <span className="mr-auto text-[12px] text-text-3">{problem}</span> : null}
        <Button variant="volt" onClick={save} loading={saving} disabled={problem !== null}>Save cities</Button>
      </div>
    </Card>
  );
}
