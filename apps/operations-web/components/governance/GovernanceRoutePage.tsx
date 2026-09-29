"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { GovernanceModulePage } from "./GovernanceModulePage";
import { decideCase, setEntityStatus, type GovernanceCollection, type LiveGovernanceRecord } from "@/lib/governance-api";
import { useGovernanceCollection } from "@/lib/use-governance";

export interface GovernanceRouteConfig {
  collection: GovernanceCollection;
  eyebrow: string;
  title: string;
  description: string;
  metricLabel: string;
  primaryAction: string;
  entityType?: "organizer" | "arena" | "event" | "risk-alert";
  readOnly?: boolean;
}

export function GovernanceRoutePage({ config }: { config: GovernanceRouteConfig }) {
  const { records, loading, error } = useGovernanceCollection(config.collection);
  const [selected, setSelected] = useState<LiveGovernanceRecord | null>(null);
  return <>
    <GovernanceModulePage {...config} metricValue={loading ? "…" : String(records.length)} records={records} loading={loading} error={error} onAction={setSelected} />
    {selected && <RecordActionDialog record={selected} config={config} onClose={() => setSelected(null)} />}
  </>;
}

function RecordActionDialog({ record, config, onClose }: { record: LiveGovernanceRecord; config: GovernanceRouteConfig; onClose: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: string) {
    if (busy) return;
    if (action !== "approved" && note.trim().length < 10) { setError("Add a reason of at least 10 characters."); return; }
    setBusy(true); setError(null);
    try {
      if (config.collection === "governanceCases") {
        await decideCase(record.id, record.version, action as "approved" | "rejected" | "information-requested", note);
      } else if (config.entityType) {
        await setEntityStatus(config.entityType, record.id, record.version, action as "active" | "paused" | "blocked" | "under-review" | "resolved", note);
      }
      onClose();
    } catch (cause) {
      const detail = typeof cause === "object" && cause && "message" in cause ? String((cause as { message: unknown }).message) : "The action could not be completed.";
      setError(detail);
      setBusy(false);
    }
  }

  const raw = Object.entries(record.raw).filter(([, value]) => typeof value === "string" || typeof value === "number" || typeof value === "boolean").slice(0, 10);
  return <div className="fixed inset-0 z-50 flex justify-end bg-black/65" role="dialog" aria-modal="true" aria-label={`Review ${record.primary}`}><button className="absolute inset-0" onClick={onClose} aria-label="Close"/><section className="relative flex h-full w-full max-w-lg flex-col border-l border-white/10 bg-[#0e1621]"><header className="flex items-start justify-between border-b border-white/8 p-6"><div><p className="overline">{config.eyebrow} · {record.id}</p><h2 className="mt-1 text-xl font-semibold text-white">{record.primary}</h2><p className="mt-1 text-xs text-slate-500">Version {record.version} · {record.status}</p></div><button onClick={onClose} className="text-slate-500 hover:text-white"><X className="h-5 w-5"/></button></header><div className="flex-1 overflow-y-auto p-6"><dl className="divide-y divide-white/8 rounded-xl border border-white/8 bg-[#111b28] px-4">{raw.map(([key, value]) => <div key={key} className="grid grid-cols-[9rem_1fr] gap-3 py-3 text-xs"><dt className="text-slate-500">{key.replace(/([A-Z])/g, " $1")}</dt><dd className="break-words text-slate-200">{String(value)}</dd></div>)}</dl>{!config.readOnly && <label className="mt-5 block"><span className="text-sm font-medium text-slate-200">Decision reason</span><textarea value={note} onChange={(event) => setNote(event.target.value)} className="mt-2 min-h-28 w-full rounded-xl border border-white/10 bg-[#0a111a] p-3 text-sm text-white outline-none focus:border-indigo-400/60" placeholder="Record the evidence, policy and reason…"/></label>}{error && <p role="alert" className="mt-3 text-xs text-red-300">{error}</p>}</div><footer className="flex flex-wrap gap-2 border-t border-white/8 p-4">{config.readOnly ? <button onClick={onClose} className="ml-auto h-10 rounded-xl border border-white/10 px-4 text-sm text-slate-200">Close</button> : config.collection === "governanceCases" ? <><button disabled={busy} onClick={() => run("rejected")} className="h-10 rounded-xl border border-red-400/25 px-4 text-sm text-red-300">Reject</button><button disabled={busy} onClick={() => run("information-requested")} className="h-10 rounded-xl border border-white/10 px-4 text-sm text-slate-200">Request information</button><button disabled={busy} onClick={() => run("approved")} className="ml-auto h-10 rounded-xl bg-indigo-500 px-4 text-sm font-semibold text-white">Approve</button></> : <><button disabled={busy} onClick={() => run("blocked")} className="h-10 rounded-xl border border-red-400/25 px-4 text-sm text-red-300">Block</button><button disabled={busy} onClick={() => run("paused")} className="h-10 rounded-xl border border-amber-400/25 px-4 text-sm text-amber-300">Pause</button><button disabled={busy} onClick={() => run(config.entityType === "risk-alert" ? "resolved" : "active")} className="ml-auto h-10 rounded-xl bg-indigo-500 px-4 text-sm font-semibold text-white">{config.entityType === "risk-alert" ? "Resolve" : "Activate"}</button></>}</footer></section></div>;
}
