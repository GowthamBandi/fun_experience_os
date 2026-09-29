"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Cloud, Database, Download, HardDrive, RotateCcw, Sparkles, Upload, Wand2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { useAdminSession } from "@/lib/firebase/auth";
import { DATA_MODE_LABEL } from "@/lib/firebase/mode";
import { SCENARIOS } from "@/lib/prototype/scenarios";
import { SCHEMA_VERSION } from "@/lib/prototype/persistence";
import { listMigrations } from "@/lib/prototype/migrations";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/primitives";
import { PermissionDenied } from "@/components/ui/panels";
import { Dialog } from "@/components/ui/overlays";
import { useToast } from "@/components/ui/toast";

type Confirm = null | { title: string; body: string; action: () => void; danger?: boolean; cta: string };

export default function WorkspaceSettings() {
  const store = useStore();
  const session = useAdminSession();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [typed, setTyped] = useState("");

  if (!store.canAccess("/settings")) return <PermissionDenied module="Workspace settings" />;

  const { state, workspace } = store;
  const counts = [
    ["Sessions", state.sessions.length],
    ["Bookings", state.bookings.length],
    ["Payments", state.payments.length],
    ["Venues", state.venues.length],
    ["Staff", state.crew.length],
    ["Incidents", state.incidents.length],
    ["Governance records", state.governance.length],
    ["Activity records", state.activityLog.length],
  ] as const;
  const bytes = new Blob([JSON.stringify(state)]).size;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const text = await file.text();
    setConfirm({
      title: "Restore this backup?",
      body: `This replaces all current workspace data with “${file.name}”. Export a backup first if you might need the current data.`,
      cta: "Restore backup",
      danger: true,
      action: () => {
        const result = store.importWorkspace(text);
        if (result.error) toast.error("Backup not restored", result.error);
        else toast.success("Backup restored", "The workspace now contains the backup's data.");
      },
    });
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6 px-5 py-7 lg:px-8">
      <PageHeader overline="Control" title="Workspace & backups" sub="Where this console's data lives, how to back it up, and how to restore or start over." />

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-panel border border-edge bg-white p-5 shadow-panel lg:col-span-2">
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-500 text-white shadow-brand">
              {session.mode === "prototype" ? <HardDrive className="h-5 w-5" /> : <Cloud className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-ink-lum">{DATA_MODE_LABEL[session.mode]}</p>
              <p className="mt-1 text-sm leading-6 text-ink-mut">
                {session.mode === "prototype"
                  ? "Operations data is saved automatically in this browser's database (IndexedDB) after every change and restored on every visit. It is private to this device and browser profile — export backups regularly and store them safely."
                  : "Marketplace governance reads and writes Firestore through audited Cloud Functions. Operations modules still use this device's workspace until they are migrated."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {workspace.saveState === "error" ? "Last save failed" : workspace.lastSavedAt ? `Saved ${new Date(workspace.lastSavedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}` : "Saved"}
                </span>
                <span className="rounded-full border border-edge bg-bg-sunken px-2.5 py-1 font-medium text-ink-sec">Schema v{SCHEMA_VERSION}</span>
                <span className="rounded-full border border-edge bg-bg-sunken px-2.5 py-1 font-medium text-ink-sec">{(bytes / 1024).toFixed(0)} KB</span>
                {workspace.source && <span className="rounded-full border border-edge bg-bg-sunken px-2.5 py-1 font-medium text-ink-sec">Loaded from {workspace.source}</span>}
              </div>
            </div>
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {counts.map(([label, n]) => (
              <div key={label} className="rounded-xl border border-edge bg-bg-sunken p-3">
                <dt className="text-xs text-ink-mut">{label}</dt>
                <dd className="mt-1 font-display text-xl font-bold tabular text-ink-lum">{n.toLocaleString("en-IN")}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="rounded-panel border border-edge bg-white p-5 shadow-panel">
          <p className="flex items-center gap-2 text-[15px] font-semibold text-ink-lum">
            <Database className="h-4 w-4 text-brand" /> Backups
          </p>
          <p className="mt-1 text-sm text-ink-mut">A backup is a single JSON file containing every record, including the activity log.</p>
          <div className="mt-4 space-y-2">
            <Button className="w-full" onClick={() => { store.exportWorkspace(); toast.success("Backup downloaded", "Keep it somewhere safe."); }}>
              <Download className="h-4 w-4" /> Export backup
            </Button>
            <Button variant="secondary" className="w-full" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" /> Restore from backup…
            </Button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onFile} />
          </div>
        </div>
      </section>

      <section className="rounded-panel border border-edge bg-white p-5 shadow-panel">
        <p className="flex items-center gap-2 text-[15px] font-semibold text-ink-lum">
          <Sparkles className="h-4 w-4 text-pink-500" /> Sample data & scenarios
        </p>
        <p className="mt-1 text-sm text-ink-mut">Load a realistic situation to train staff or rehearse a process. Scenarios change existing data; export a backup first.</p>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {SCENARIOS.map((s) => (
            <button
              key={s.name}
              onClick={() =>
                setConfirm({ title: `Load “${s.name}”?`, body: s.blurb, cta: "Load scenario", action: () => { store.loadScenario(s.name); toast.success(`Scenario “${s.name}” loaded`); } })
              }
              className="rounded-xl border border-edge p-3 text-left transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-lift"
            >
              <p className="text-sm font-semibold text-ink-lum">{s.name}</p>
              <p className="mt-1 line-clamp-2 text-xs text-ink-mut">{s.blurb}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-panel border border-red-200 bg-white p-5 shadow-panel">
        <p className="flex items-center gap-2 text-[15px] font-semibold text-red-700">
          <AlertTriangle className="h-4 w-4" /> Reset
        </p>
        <p className="mt-1 text-sm text-ink-mut">Both options keep operator accounts and the activity record. Everything else is replaced.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => setConfirm({ title: "Reload sample data?", body: "All current records are replaced with the sample dataset.", cta: "Reload sample data", danger: true, action: () => { store.resetDemoData(); toast.success("Sample data loaded"); } })}
          >
            <RotateCcw className="h-4 w-4" /> Reload sample data
          </Button>
          <Button
            variant="danger"
            onClick={() => setConfirm({ title: "Start with an empty workspace?", body: "All sample and current records are removed so you can set up your real franchises, venues and catalog from scratch.", cta: "Start fresh", danger: true, action: () => { store.startFreshWorkspace(); toast.success("Empty workspace ready", "Begin in Setup."); } })}
          >
            <Wand2 className="h-4 w-4" /> Start fresh (empty)
          </Button>
        </div>
      </section>

      <details className="rounded-panel border border-edge bg-white p-5 text-sm shadow-panel">
        <summary className="cursor-pointer font-semibold text-ink-lum">Data migrations applied on load</summary>
        <ul className="mt-3 space-y-1.5 text-ink-mut">
          {listMigrations().map((m) => (
            <li key={m.id}>
              <span className="font-mono text-xs text-ink-sec">{m.id}</span> — {m.description}
            </li>
          ))}
        </ul>
      </details>

      <Dialog open={!!confirm} onClose={() => { setConfirm(null); setTyped(""); }} title={confirm?.title ?? ""}>
        <p className="text-sm leading-6 text-ink-sec">{confirm?.body}</p>
        {confirm?.danger && (
          <label className="mt-4 block">
            <span className="text-xs font-medium text-ink-sec">Type CONFIRM to continue</span>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} className="field mt-1.5 h-10 w-full rounded-xl px-3 text-sm" autoFocus />
          </label>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => { setConfirm(null); setTyped(""); }}>
            Cancel
          </Button>
          <Button
            variant={confirm?.danger ? "danger" : "primary"}
            disabled={confirm?.danger ? typed.trim().toUpperCase() !== "CONFIRM" : false}
            onClick={() => {
              confirm?.action();
              setConfirm(null);
              setTyped("");
            }}
          >
            {confirm?.cta}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
