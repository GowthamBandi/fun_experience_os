"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarRange, ScanLine } from "lucide-react";
import { useStore } from "@/lib/store";
import { repos } from "@/lib/data/mock";
import { fillRate, inr } from "@/lib/format";
import { Stagger, Item, Fade } from "@/components/motion/Motion";
import { Card, PanelHeader, Stat } from "@/components/ui/panels";
import { StatusChip, FillMeter } from "@/components/ui/primitives";
import { LineChart, Bars, Donut } from "@/components/ui/charts";

export default function CommandPage() {
  const { operator, territory } = useStore();
  const router = useRouter();
  const [struck, setStruck] = useState<string | null>(null);

  const sessions = repos.sessions().filter((s) => s.territoryId === territory.id);
  const analytics = repos.analytics();
  const signals = repos.signals();

  const tonight = sessions.filter((s) => s.date === "Today");
  const live = sessions.filter((s) => s.status === "live" || s.status === "closing");
  const take = tonight.reduce((a, s) => a + s.price * s.booked, 0);
  const booked = tonight.reduce((a, s) => a + s.booked, 0);
  const avgFill = tonight.length
    ? Math.round(tonight.reduce((a, s) => a + fillRate(s.booked, s.capacity), 0) / tonight.length)
    : 0;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8">
      <Fade>
        <p className="overline">Command · {territory.name}</p>
        <h1 className="mt-2 text-[28px] font-semibold leading-tight tracking-tight text-ink-lum">
          Good evening, {operator?.name.split(" ")[0]}. The night is on.
        </h1>
      </Fade>

      {/* KPI row */}
      <Stagger className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Item>
          <Card>
            <Stat label="Tonight's take" value={inr(take)} delta={`${tonight.length} missions on the floor`} tone="warm" />
          </Card>
        </Item>
        <Item>
          <Card>
            <Stat label="Bookings tonight" value={String(booked)} delta="sold, seated, on the way" />
          </Card>
        </Item>
        <Item>
          <Card>
            <Stat label="Average fill" value={`${avgFill}%`} delta={avgFill >= 80 ? "the floor is nearly full" : "still room tonight"} tone={avgFill >= 80 ? "ok" : "default"} />
          </Card>
        </Item>
        <Item>
          <Card>
            <Stat label="Live now" value={String(live.length)} delta={live.length ? "missions running" : "floor is quiet"} tone={live.length ? "warm" : "default"} />
          </Card>
        </Item>
      </Stagger>

      {/* charts */}
      <Stagger className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Item className="lg:col-span-2">
          <Card>
            <PanelHeader title="The week's take" sub="Revenue, last seven nights" />
            <div className="mt-4">
              <LineChart labels={analytics.map((d) => d.label)} series={analytics.map((d) => d.revenue)} />
            </div>
          </Card>
        </Item>
        <Item>
          <Card>
            <PanelHeader title="Tonight's fill" sub="across all missions" />
            <div className="mt-6">
              <Donut value={avgFill} label={`${avgFill}%`} sub="of seats are lit tonight" />
            </div>
          </Card>
        </Item>
        <Item className="lg:col-span-3">
          <Card>
            <PanelHeader title="Bookings rhythm" sub="joiners per night, last seven" />
            <div className="mt-4">
              <Bars labels={analytics.map((d) => d.label)} values={analytics.map((d) => d.bookings)} />
            </div>
          </Card>
        </Item>
      </Stagger>

      {/* live missions + signals */}
      <Stagger className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Item className="lg:col-span-2">
          <Card>
            <PanelHeader
              title="Live missions"
              sub={`${live.length} running in ${territory.name}`}
              right={
                <button onClick={() => router.push("/missions")} className="inline-flex items-center gap-1 text-xs text-ink-mut transition-colors hover:text-ink-lum">
                  All missions <ArrowRight className="h-3.5 w-3.5" />
                </button>
              }
            />
            <div className="mt-4 space-y-1">
              {live.map((s) => {
                const fill = fillRate(s.booked, s.capacity);
                return (
                  <div
                    key={s.id}
                    onClick={() => router.push("/missions")}
                    className="group flex w-full cursor-pointer items-center gap-4 rounded-xl px-3 py-3 text-left transition-colors hover:bg-white/4"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-ink-lum">{s.title}</span>
                        <StatusChip value={s.status} />
                      </span>
                      <span className="mt-1.5 block">
                        <FillMeter value={fill} />
                      </span>
                      <span className="mt-1.5 block text-[11px] text-ink-mut">
                        {s.time} · {s.booked}/{s.capacity} seated{s.waitlist > 0 ? ` · ${s.waitlist} waiting` : ""}
                      </span>
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setStruck(s.id);
                        setTimeout(() => setStruck(null), 1400);
                      }}
                      className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[#f7b955]/30 bg-[#f7b955]/10 px-2.5 py-1.5 text-[11px] font-medium text-[#ffd28a] transition-all hover:bg-[#f7b955]/20"
                    >
                      {struck === s.id ? (
                        <>
                          <ScanLine className="h-3.5 w-3.5" /> Struck
                        </>
                      ) : (
                        <>
                          <ScanLine className="h-3.5 w-3.5" /> Strike
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
              {live.length === 0 && <p className="px-3 py-6 text-sm text-ink-mut">The floor is quiet. The night hasn&apos;t started here yet.</p>}
            </div>
          </Card>
        </Item>

        <Item>
          <Card>
            <PanelHeader
              title="The night's signals"
              sub="recent"
              right={
                <button onClick={() => router.push("/notifications")} className="inline-flex items-center gap-1 text-xs text-ink-mut transition-colors hover:text-ink-lum">
                  All <ArrowRight className="h-3.5 w-3.5" />
                </button>
              }
            />
            <div className="mt-4 space-y-2">
              {signals.slice(0, 4).map((s) => (
                <div key={s.id} className="flex items-start gap-2.5 rounded-xl px-2 py-2 transition-colors hover:bg-white/4">
                  <StatusChip value={s.kind} dot={false} />
                  <div className="min-w-0">
                    <p className="text-xs leading-snug text-ink-sec">{s.message}</p>
                    <p className="mt-0.5 text-[11px] text-ink-mut">{s.at}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </Item>
      </Stagger>

      {/* quick actions */}
      <Stagger className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Item>
          <button
            onClick={() => router.push("/bookings")}
            className="group flex w-full items-center justify-between rounded-panel glass p-5 text-left transition-all hover:bg-white/8"
          >
            <div>
              <p className="text-sm font-medium text-ink-lum">Check-in at the door</p>
              <p className="mt-0.5 text-xs text-ink-mut">Turn confirmed into seated</p>
            </div>
            <CalendarRange className="h-5 w-5 text-ink-mut transition-transform group-hover:translate-x-0.5" />
          </button>
        </Item>
        <Item>
          <button
            onClick={() => router.push("/tournaments")}
            className="group flex w-full items-center justify-between rounded-panel glass p-5 text-left transition-all hover:bg-white/8"
          >
            <div>
              <p className="text-sm font-medium text-ink-lum">Check the bracket</p>
              <p className="mt-0.5 text-xs text-ink-mut">The knockout is live</p>
            </div>
            <ArrowRight className="h-5 w-5 text-ink-mut transition-transform group-hover:translate-x-0.5" />
          </button>
        </Item>
        <Item>
          <button
            onClick={() => router.push("/money")}
            className="group flex w-full items-center justify-between rounded-panel glass p-5 text-left transition-all hover:bg-white/8"
          >
            <div>
              <p className="text-sm font-medium text-ink-lum">Count the take</p>
              <p className="mt-0.5 text-xs text-ink-mut">Settled, pending, the night&apos;s sum</p>
            </div>
            <ArrowRight className="h-5 w-5 text-ink-mut transition-transform group-hover:translate-x-0.5" />
          </button>
        </Item>
      </Stagger>
    </div>
  );
}
