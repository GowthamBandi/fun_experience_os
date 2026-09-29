"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, Building2, CircleAlert, Clock3, HandCoins, ReceiptIndianRupee, ShieldCheck, Users } from "lucide-react";
import { useGovernanceCollection } from "@/lib/use-governance";

export default function GovernanceOverview() {
  const router = useRouter();
  const cases = useGovernanceCollection("governanceCases");
  const organizers = useGovernanceCollection("organizers");
  const arenas = useGovernanceCollection("arenas");
  const events = useGovernanceCollection("events");
  const risks = useGovernanceCollection("riskAlerts");
  const refunds = useGovernanceCollection("refundCases");
  const settlements = useGovernanceCollection("settlementControls");
  const audit = useGovernanceCollection("auditEvents");
  const loading = [cases, organizers, arenas, events, risks, refunds, settlements, audit].some((source) => source.loading);
  const error = [cases, organizers, arenas, events, risks, refunds, settlements, audit].find((source) => source.error)?.error;
  const openCases = cases.records.filter((record) => !["Approved", "Blocked"].includes(record.status));

  return <div className="mx-auto w-full max-w-[1440px] px-5 py-7 lg:px-8">
    <header className="flex flex-col gap-4 border-b border-white/8 pb-6 lg:flex-row lg:items-end lg:justify-between"><div><p className="overline">Governance overview</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em] text-white">Marketplace control center</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Approve access, protect customers, control marketplace risk and preserve an accountable record—without operating organizer events.</p></div><button onClick={() => router.push("/approvals")} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 text-sm font-semibold text-white hover:bg-indigo-400">Review approvals <ArrowRight className="h-4 w-4"/></button></header>
    {error && <div role="alert" className="mt-5 rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-200">Live governance data could not be loaded: {error}</div>}
    <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={Users} label="Organizers" value={organizers.records.length} detail="governed accounts"/><Metric icon={Building2} label="Arenas" value={arenas.records.length} detail="submitted facilities"/><Metric icon={ShieldCheck} label="Events" value={events.records.length} detail="marketplace events"/><Metric icon={CircleAlert} label="Open risk alerts" value={risks.records.filter((record) => record.status !== "Approved").length} detail="require investigation"/></section>
    <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]"><section className="overflow-hidden rounded-2xl border border-white/8 bg-[#101823]"><div className="flex items-center justify-between border-b border-white/8 p-5"><div><h2 className="text-base font-semibold text-white">Decision queue</h2><p className="mt-1 text-xs text-slate-500">{loading ? "Loading…" : `${openCases.length} cases awaiting action`}</p></div><button onClick={() => router.push("/approvals")} className="text-xs font-medium text-indigo-300 hover:text-indigo-200">Open queue</button></div><div className="divide-y divide-white/8">{openCases.slice(0, 8).map((record) => <button key={record.id} onClick={() => router.push("/approvals")} className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-4 p-5 text-left hover:bg-white/[0.025]"><div><p className="text-sm font-medium text-slate-100">{record.primary}</p><p className="mt-1 text-xs text-slate-500">{record.secondary} · {record.meta}</p></div><span className="self-center rounded-full border border-amber-400/20 bg-amber-400/5 px-2.5 py-1 text-xs text-amber-300">{record.status}</span></button>)}{!loading && !error && openCases.length === 0 && <div className="p-12 text-center text-sm text-slate-500">No open decisions.</div>}</div></section>
      <aside className="space-y-5"><section className="rounded-2xl border border-white/8 bg-[#111925] p-5"><h2 className="text-base font-semibold text-white">Financial controls</h2><ControlRow icon={ReceiptIndianRupee} label="Refund cases" value={refunds.records.length} href="/refunds"/><ControlRow icon={HandCoins} label="Settlement controls" value={settlements.records.length} href="/settlements"/><ControlRow icon={CircleAlert} label="Risk alerts" value={risks.records.length} href="/risk"/></section><section className="rounded-2xl border border-white/8 bg-[#111925] p-5"><div className="flex items-center justify-between"><h2 className="text-base font-semibold text-white">Recent audit</h2><button onClick={() => router.push("/audit")} className="text-xs text-indigo-300">View all</button></div><div className="mt-3 divide-y divide-white/8">{audit.records.slice(0, 6).map((record) => <div key={record.id} className="flex gap-3 py-3"><Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-slate-500"/><div><p className="text-xs font-medium text-slate-200">{record.primary}</p><p className="mt-1 text-[11px] text-slate-500">{record.meta}</p></div></div>)}</div></section></aside>
    </div>
  </div>;

  function ControlRow({ icon: Icon, label, value, href }: { icon: typeof HandCoins; label: string; value: number; href: string }) { return <button onClick={() => router.push(href)} className="mt-3 flex w-full items-center gap-3 rounded-xl border border-white/8 bg-[#0d1520] p-3 text-left hover:border-indigo-400/25"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-400/8 text-indigo-300"><Icon className="h-4 w-4"/></span><span className="flex-1 text-xs text-slate-400">{label}</span><span className="text-base font-semibold text-white">{value}</span></button>; }
}

function Metric({ icon: Icon, label, value, detail }: { icon: typeof Users; label: string; value: number; detail: string }) { return <div className="rounded-2xl border border-white/8 bg-[#111925] p-4"><div className="flex items-center justify-between"><span className="text-xs text-slate-500">{label}</span><Icon className="h-4 w-4 text-indigo-300"/></div><p className="mt-3 text-2xl font-semibold text-white">{value}</p><p className="mt-1 text-xs text-slate-600">{detail}</p></div>; }
