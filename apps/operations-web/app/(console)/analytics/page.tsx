"use client";

import { useStore } from "@/lib/store";
import { repos } from "@/lib/data/mock";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { Card, PanelHeader, Stat } from "@/components/ui/panels";
import { LineChart, Bars, Donut } from "@/components/ui/charts";
import { Stagger, Item } from "@/components/motion/Motion";

export default function AnalyticsPage() {
  const { territory, canAccess } = useStore();

  if (!canAccess("/analytics")) return <PageFrame><PermissionDenied module="Analytics" /></PageFrame>;

  const analytics = repos.analytics();

  const totalRevenue = analytics.reduce((a, d) => a + d.revenue, 0);
  const totalBookings = analytics.reduce((a, d) => a + d.bookings, 0);
  const peak = analytics.reduce((a, d) => (d.revenue > a.revenue ? d : a), analytics[0]);

  return (
    <PageFrame>
      <PageHeader
        overline={`Analytics · ${territory.name}`}
        title="The read"
        sub="Seven nights, told in numbers. The OS measures so the crew can move."
      />

      <Stagger className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Item><Card><Stat label="7-night take" value={`₹${Math.round(totalRevenue / 1000)}k`} delta="sum of the week" tone="warm" /></Card></Item>
        <Item><Card><Stat label="Joiners" value={String(totalBookings)} delta="bookings across the week" /></Card></Item>
        <Item><Card><Stat label="Peak night" value={peak.label} delta={`${peak.fill}% fill · ${peak.bookings} joiners`} tone="ok" /></Card></Item>
      </Stagger>

      <Stagger className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Item className="lg:col-span-2">
          <Card>
            <PanelHeader title="Revenue line" sub="the week's take" />
            <div className="mt-4"><LineChart labels={analytics.map((d) => d.label)} series={analytics.map((d) => d.revenue)} /></div>
          </Card>
        </Item>
        <Item>
          <Card>
            <PanelHeader title="Bookings" sub="joiners per night" />
            <div className="mt-6"><Bars labels={analytics.map((d) => d.label)} values={analytics.map((d) => d.bookings)} /></div>
          </Card>
        </Item>
      </Stagger>
    </PageFrame>
  );
}

function PageFrame({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8">{children}</div>;
}
