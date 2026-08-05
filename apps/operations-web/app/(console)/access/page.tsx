"use client";

import { useStore } from "@/lib/store";
import { ROLES, operatorName } from "@/lib/data/mock";
import { NAV } from "@/lib/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { Badge } from "@/components/ui/primitives";
import { Stagger, Item } from "@/components/motion/Motion";
import type { Role } from "@/lib/types";

export default function AccessPage() {
  const { canAccess, operator, state } = useStore();

  if (!canAccess("/access")) return <PageFrame><PermissionDenied module="Access" /></PageFrame>;

  const roles = ROLES;
  const chain = roles.filter((r) => r.kind === "chain");
  const functional = roles.filter((r) => r.kind === "functional");
  const audits = state.audits;

  return (
    <PageFrame>
      <PageHeader
        overline="Access"
        title="Who can open what"
        sub="The permission map mirrors the franchise model — position first, then scope."
      />

      <Stagger className="mt-6 space-y-6">
        <Item>
          <p className="overline mb-3">Command chain</p>
          <AccessMatrix roles={chain} />
        </Item>
        <Item>
          <p className="overline mb-3">Functional lanes</p>
          <AccessMatrix roles={functional} />
        </Item>
        <Item>
          <p className="overline mb-3">Audit trail</p>
          <div className="solid overflow-hidden rounded-panel">
            {audits.map((a) => (
              <div key={a.id} className="flex items-start justify-between gap-4 border-b border-white/4 px-4 py-3 last:border-0">
                <div className="min-w-0">
                  <p className="text-sm text-ink-lum">
                    <span className="font-medium">{operatorName(a.operatorId)}</span> <span className="text-ink-sec">{a.action}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-ink-mut">{a.description}</p>
                </div>
                <span className="shrink-0 text-[11px] tabular text-ink-mut">{a.timestamp}</span>
              </div>
            ))}
          </div>
        </Item>
      </Stagger>

      <div className="mt-6 flex flex-wrap items-center gap-2 text-xs text-ink-mut">
        <Badge className="border border-white/8 bg-white/4 text-ink-sec">Signed in as {operator?.name}</Badge>
        <Badge className="border border-white/8 bg-white/4 text-ink-mut">Scope: {operator?.title}</Badge>
      </div>
    </PageFrame>
  );
}

function AccessMatrix({ roles }: { roles: Array<Pick<Role, "id" | "name" | "scope">> }) {
  return (
    <div className="solid overflow-x-auto rounded-panel">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-white/5">
            <th className="overline px-4 py-3 text-left">Module</th>
            {roles.map((r) => (
              <th key={r.id} className="overline px-2 py-3 text-center" title={r.scope}>
                <span className="block max-w-[72px] truncate">{r.name}</span>
                <span className="mt-0.5 block text-[10px] font-normal normal-case text-ink-mut">{r.scope}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {NAV.map((n) => (
            <tr key={n.href} className="border-b border-white/4 last:border-0 transition-colors hover:bg-white/2">
              <td className="px-4 py-2.5">
                <span className="text-ink-sec">{n.label}</span>
              </td>
              {roles.map((r) => (
                <td key={r.id} className="px-2 py-2.5 text-center">
                  {n.roles.includes(r.id) ? (
                    <span className="mx-auto block h-1.5 w-1.5 rounded-full bg-[#5fd7a3]" title="Access" />
                  ) : (
                    <span className="mx-auto block h-1.5 w-1.5 rounded-full bg-white/10" title="No access" />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PageFrame({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8">{children}</div>;
}
