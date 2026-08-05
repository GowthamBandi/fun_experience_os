"use client";

import { useStore } from "@/lib/store";
import { repos } from "@/lib/data/mock";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { StatusChip } from "@/components/ui/primitives";
import { Stagger, Item } from "@/components/motion/Motion";

export default function NotificationsPage() {
  const { canAccess, markAllRead } = useStore();

  if (!canAccess("/notifications")) return <PageFrame><PermissionDenied module="Notifications" /></PageFrame>;

  const signals = repos.signals();

  return (
    <PageFrame>
      <PageHeader overline="Signals" title="The night's signals" sub="Every alert the OS raised. Sorted newest first." />
      <Stagger className="mt-6 space-y-1.5">
        {signals.map((s) => (
          <Item key={s.id}>
            <button
              onClick={markAllRead}
              className="flex w-full items-start gap-3 rounded-xl border border-white/5 bg-white/3 px-4 py-3 text-left transition-colors hover:bg-white/6"
            >
              <StatusChip value={s.kind} dot={false} />
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug text-ink-sec">{s.message}</p>
                <p className="mt-0.5 text-[11px] text-ink-mut">{s.at}</p>
              </div>
            </button>
          </Item>
        ))}
      </Stagger>
    </PageFrame>
  );
}

function PageFrame({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8">{children}</div>;
}
