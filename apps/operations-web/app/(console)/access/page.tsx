"use client";

import { useMemo, useState } from "react";
import { Check, KeyRound, Minus, Plus, Search, UserCheck, UserX } from "lucide-react";
import { useStore } from "@/lib/store";
import { ROLES } from "@/lib/data/mock";
import { NAV, NAV_GROUPS } from "@/lib/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { Avatar, Button, StatusChip } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/overlays";
import { useToast } from "@/components/ui/toast";
import type { RoleId } from "@/lib/types";
import type { OperatorAccount } from "@/lib/prototype/entities";
import { cn } from "@/lib/format";

export default function AccessPage() {
  const { canAccess, operators, state, updateOperator, operator: me } = useStore();
  const toast = useToast();
  const [tab, setTab] = useState<"people" | "matrix">("people");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<OperatorAccount | null>(null);
  const [creating, setCreating] = useState(false);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return operators.filter((o) => !needle || `${o.name} ${o.title} ${o.role} ${o.email ?? ""}`.toLowerCase().includes(needle));
  }, [operators, q]);

  if (!canAccess("/access")) return <PermissionDenied module="Access" />;

  const territoryName = (id: string) => state.territories.find((t) => t.id === id)?.name ?? id;
  const lastSeen = (id: string) => state.activityLog.find((r) => r.actorId === id)?.at;

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 px-5 py-7 lg:px-8">
      <PageHeader
        overline="Control"
        title="Access"
        sub="Operator accounts and what each role can open. Role changes take effect on the operator's next action and are recorded in the activity record."
        right={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Add operator
          </Button>
        }
      />

      <div className="inline-flex rounded-xl border border-edge bg-white p-1 shadow-lift" role="tablist">
        {(["people", "matrix"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn("h-9 rounded-lg px-4 text-sm font-semibold transition-colors", tab === t ? "bg-brand text-white" : "text-ink-sec hover:text-ink-lum")}
          >
            {t === "people" ? `Operators (${operators.length})` : "Role permissions"}
          </button>
        ))}
      </div>

      {tab === "people" && (
        <section className="overflow-hidden rounded-panel border border-edge bg-white shadow-panel">
          <div className="border-b border-edge p-4">
            <label className="relative block max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mut" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search operators" aria-label="Search operators" className="field h-10 w-full rounded-xl pl-9 pr-3 text-sm" />
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-b border-edge bg-bg-sunken text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-mut">
                  <th className="px-5 py-3">Operator</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Territory</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Last action</th>
                  <th className="px-5 py-3 text-right">Manage</th>
                </tr>
              </thead>
              <tbody>
                {list.map((o) => {
                  const seen = lastSeen(o.id);
                  return (
                    <tr key={o.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar initials={o.initials} />
                          <div className="min-w-0">
                            <p className="font-semibold text-ink-lum">
                              {o.name} {me?.id === o.id && <span className="ml-1 rounded-full bg-brand-subtle px-1.5 py-0.5 text-[10px] font-bold text-brand-ink">You</span>}
                            </p>
                            <p className="truncate text-xs text-ink-mut">{o.email ?? o.title}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-ink-sec">{ROLES.find((r) => r.id === o.role)?.name ?? o.role}</td>
                      <td className="px-4 py-3 text-ink-sec">{territoryName(o.territoryId)}</td>
                      <td className="px-4 py-3">
                        <StatusChip value={o.status} />
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-mut">{seen ? new Date(seen).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—"}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="inline-flex gap-1.5">
                          <Button size="sm" variant="secondary" onClick={() => setEditing(o)}>
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant={o.status === "active" ? "ghost" : "lamp"}
                            onClick={() => {
                              const r = updateOperator(o.id, { status: o.status === "active" ? "suspended" : "active" });
                              if (r.error) toast.error("Not changed", r.error);
                              else toast.success(o.status === "active" ? `${o.name} suspended` : `${o.name} reactivated`);
                            }}
                          >
                            {o.status === "active" ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                            {o.status === "active" ? "Suspend" : "Reactivate"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "matrix" && (
        <section className="overflow-hidden rounded-panel border border-edge bg-white shadow-panel">
          <div className="flex items-center gap-2 border-b border-edge px-5 py-4 text-sm text-ink-mut">
            <KeyRound className="h-4 w-4 text-brand" /> Module access by role. This single policy drives the sidebar, search and every page guard.
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-xs">
              <thead>
                <tr className="border-b border-edge bg-bg-sunken">
                  <th className="sticky left-0 z-10 bg-bg-sunken px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-mut">Module</th>
                  {ROLES.map((r) => (
                    <th key={r.id} className="px-2 py-3 text-center font-semibold text-ink-sec">
                      <span className="block w-20 truncate" title={r.name}>
                        {r.name.replace(" Manager", " Mgr").replace("Regional Franchise ", "Regional ")}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {NAV_GROUPS.map((g) => (
                  <MatrixGroup key={g} group={g} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {(editing || creating) && <OperatorDialog account={editing} onClose={() => { setEditing(null); setCreating(false); }} />}
    </div>
  );
}

function MatrixGroup({ group }: { group: string }) {
  const items = NAV.filter((n) => n.group === group);
  return (
    <>
      <tr>
        <td colSpan={ROLES.length + 1} className="bg-white px-4 pb-1 pt-4 text-[10.5px] font-bold uppercase tracking-[0.1em] text-brand">
          {group}
        </td>
      </tr>
      {items.map((n) => (
        <tr key={n.href} className="border-b border-slate-100 hover:bg-slate-50/70">
          <td className="sticky left-0 z-10 bg-white px-4 py-2 text-sm font-medium text-ink-lum">{n.label}</td>
          {ROLES.map((r) => (
            <td key={r.id} className="px-2 py-2 text-center">
              {n.roles.includes(r.id) ? (
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                  <Check className="h-3.5 w-3.5" />
                </span>
              ) : (
                <Minus className="mx-auto h-3.5 w-3.5 text-slate-300" />
              )}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function OperatorDialog({ account, onClose }: { account: OperatorAccount | null; onClose: () => void }) {
  const { createOperator, updateOperator, state } = useStore();
  const toast = useToast();
  const [name, setName] = useState(account?.name ?? "");
  const [title, setTitle] = useState(account?.title ?? "");
  const [email, setEmail] = useState(account?.email ?? "");
  const [role, setRole] = useState<RoleId>(account?.role ?? "coordinator");
  const [territoryId, setTerritoryId] = useState(account?.territoryId ?? state.territories[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);

  function save(e: React.FormEvent) {
    e.preventDefault();
    const result = account
      ? updateOperator(account.id, { name: name.trim(), title: title.trim(), email: email.trim() || undefined, role, territoryId })
      : createOperator({ name, title, role, territoryId, email: email.trim() || undefined });
    if (result.error) {
      setError(result.error);
      return;
    }
    toast.success(account ? "Operator updated" : "Operator added", account ? undefined : `${name} can now sign in.`);
    onClose();
  }

  return (
    <Dialog open onClose={onClose} title={account ? `Edit ${account.name}` : "Add operator"} wide>
      <form onSubmit={save} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-[13px] font-medium text-ink-sec">Full name *</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="field h-11 w-full rounded-xl px-3.5 text-sm" required />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-ink-sec">Role *</span>
          <select value={role} onChange={(e) => setRole(e.target.value as RoleId)} className="field h-11 w-full rounded-xl px-3 text-sm">
            {ROLES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-ink-sec">Home territory</span>
          <select value={territoryId} onChange={(e) => setTerritoryId(e.target.value)} className="field h-11 w-full rounded-xl px-3 text-sm">
            {state.territories.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
            {state.territories.length === 0 && <option value="">No territories yet</option>}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-ink-sec">Job title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="field h-11 w-full rounded-xl px-3.5 text-sm" placeholder="Shown under their name" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-ink-sec">Work email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="field h-11 w-full rounded-xl px-3.5 text-sm" placeholder="Used to match Firebase sign-in" />
        </label>
        {error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 sm:col-span-2">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">{account ? "Save changes" : "Add operator"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
