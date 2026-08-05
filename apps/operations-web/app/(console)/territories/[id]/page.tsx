"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { territoryDetail } from "@/lib/prototype/repositories";
import { OPERATORS, operatorName } from "@/lib/data/mock";
import { geoCan } from "@/lib/geo/access";
import type { RoleId } from "@/lib/types";
import { cn, inr, pct } from "@/lib/format";
import { Breadcrumbs, KVGrid, PageFrame, Proto, PrototypeRoleNote, Row } from "@/components/geo/layout";
import { ConfirmAction } from "@/components/geo/ConfirmAction";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, PanelHeader, PermissionDenied, Stat } from "@/components/ui/panels";
import { Avatar, Badge, Button, FillMeter, StatusChip } from "@/components/ui/primitives";
import { Field, Input, Select } from "@/components/ui/fields";
import { Item, Stagger, Tide } from "@/components/motion/Motion";
import { AlertTriangle, ArrowLeft, Building2, Pause, Play, ShieldAlert, StickyNote } from "lucide-react";

const typeTone: Record<string, string> = {
  urban: "border border-[#4c6fff]/25 bg-[#4c6fff]/12 text-[#9db4ff]",
  suburban: "border border-[#f7b955]/30 bg-[#f7b955]/10 text-[#ffd28a]",
  regional: "border border-[#12b76a]/25 bg-[#12b76a]/12 text-[#5fd7a3]",
};

const MANAGER_ROLES: RoleId[] = ["platform-owner", "super-admin", "regional-partner", "city-manager", "ops-manager"];
const managerCandidates = OPERATORS.filter((o) => MANAGER_ROLES.includes(o.role));

const isUpcoming = (s: { date: string; status: string }) =>
  (s.date === "Today" || s.date === "Tomorrow") && !["cancelled", "completed", "archived"].includes(s.status);

export default function TerritoryDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const {
    state,
    role,
    canAccess,
    hydrated,
    changeTerritoryStatus,
    assignTerritoryManager,
    addOperationalNote,
  } = useStore();

  const detail = useMemo(() => territoryDetail(state, id), [state, id]);

  const [manager, setManager] = useState("");
  const [note, setNote] = useState("");

  const canManage = geoCan(role.id, "manage-territory");
  const canSeeSafety = geoCan(role.id, "see-safety");
  const canAnnotate = geoCan(role.id, "annotate");

  if (!hydrated) return <PageFrame><Tide /></PageFrame>;
  if (!canAccess("/territories")) return <PageFrame><PermissionDenied module="Territories" /></PageFrame>;

  if (!detail) {
    return (
      <PageFrame>
        <div className="solid rounded-panel p-10 text-center">
          <p className="text-sm font-medium text-ink-lum">Territory not found</p>
          <p className="mt-1 text-sm text-ink-mut">This territory doesn&apos;t exist or was removed.</p>
          <Button variant="secondary" className="mt-5" onClick={() => router.push("/territories")}>
            <ArrowLeft className="h-4 w-4" />
            Back to territories
          </Button>
        </div>
      </PageFrame>
    );
  }

  const m = detail.metrics;
  const upcoming = detail.sessions.filter(isUpcoming);
  const audits = state.audits.filter((a) => a.description.includes(detail.name));

  return (
    <PageFrame>
      <Breadcrumbs items={[{ label: "Territories", href: "/territories" }, { label: detail.name }]} />

      <PageHeader
        overline="Franchise Operations · Territories"
        title={detail.name}
        sub={`${detail.region} · ${detail.state}`}
        right={
          canManage ? (
            detail.status === "active" ? (
              <ConfirmAction
                label="Pause territory"
                title="Pause this territory?"
                body={
                  <>
                    Pausing <span className="font-medium text-ink-lum">{detail.name}</span> freezes booking intake across
                    its cities. Cities and venues are retained.
                  </>
                }
                confirmLabel="Pause territory"
                tone="danger"
                variant="danger"
                icon={<Pause className="h-4 w-4" />}
                onConfirm={() => changeTerritoryStatus(detail.id, "paused")}
              />
            ) : (
              <ConfirmAction
                label="Resume territory"
                title="Resume this territory?"
                body={
                  <>
                    Resuming <span className="font-medium text-ink-lum">{detail.name}</span> reopens booking intake for
                    its cities and venues.
                  </>
                }
                confirmLabel="Resume territory"
                tone="primary"
                variant="primary"
                icon={<Play className="h-4 w-4" />}
                onConfirm={() => changeTerritoryStatus(detail.id, "active")}
              />
            )
          ) : (
            <PrototypeRoleNote />
          )
        }
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <StatusChip value={detail.status} />
        <Badge className={cn("capitalize", typeTone[detail.type])}>{detail.type}</Badge>
        <Link
          href={`/franchises/${detail.franchise.id}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#4c6fff]/25 bg-[#4c6fff]/12 px-2.5 py-0.5 text-xs font-medium text-[#9db4ff] transition-colors hover:bg-[#4c6fff]/20"
        >
          <Building2 className="h-3 w-3" />
          {detail.franchise.name}
        </Link>
      </div>

      <Stagger className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        <Item><Card><Stat label="Cities" value={String(m.cityCount)} /></Card></Item>
        <Item><Card><Stat label="Venues" value={String(m.venueCount)} /></Card></Item>
        <Item><Card><Stat label="Playing areas" value={String(m.playingAreaCount)} /></Card></Item>
        <Item><Card><Stat label="Upcoming sessions" value={String(m.upcomingSessions)} /></Card></Item>
        <Item><Card><Stat label="Fill rate" value={pct(m.fillRate)} /></Card></Item>
        <Item>
          <Card>
            <Stat
              label="Staffing health"
              value={pct(m.staffingHealth)}
              tone={m.staffingHealth <= 50 ? "danger" : m.staffingHealth <= 75 ? "warm" : "ok"}
            />
          </Card>
        </Item>
        <Item>
          <Card>
            <Stat label="Incidents" value={String(m.incidentCount)} tone={m.incidentCount > 0 ? "danger" : "default"} />
          </Card>
        </Item>
        <Item>
          <Card>
            <Stat label="Safety signals" value={String(m.safetySignals)} tone={m.safetySignals > 0 ? "danger" : "default"} />
          </Card>
        </Item>
        <Item>
          <Card>
            <Stat label="Revenue" value={inr(m.revenue)} />
            <div className="mt-1"><Proto /></div>
          </Card>
        </Item>
      </Stagger>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <PanelHeader title="Overview" sub="Identity and operating record" />
          <div className="mt-4">
            <KVGrid>
              <Row label="Franchise">
                <Link href={`/franchises/${detail.franchise.id}`} className="text-ink-sec hover:text-ink-lum">
                  {detail.franchise.name}
                </Link>
              </Row>
              <Row label="Type"><span className="capitalize">{detail.type}</span></Row>
              <Row label="State">{detail.state}</Row>
              <Row label="Region">{detail.region}</Row>
              <Row label="Manager">{detail.managerName}</Row>
              <Row label="Timezone">{detail.timezone}</Row>
              <Row label="Currency">{detail.currency}</Row>
              <Row label="Contact">{detail.contactInfo || "—"}</Row>
              <Row label="Notes">{detail.notes || "—"}</Row>
              <Row label="Status"><StatusChip value={detail.status} /></Row>
            </KVGrid>
          </div>
        </Card>

        <Card>
          <PanelHeader
            title="Cities"
            sub="Cities scoped under this territory"
            right={<Badge className="border border-white/8 bg-white/4 text-ink-sec">{detail.cities.length}</Badge>}
          />
          <div className="mt-3 space-y-1.5">
            {detail.cities.length === 0 && (
              <div className="rounded-xl solid p-3 text-center">
                <p className="text-sm text-ink-mut">No cities yet.</p>
                <Link href={`/territories/${detail.id}/cities/new`} className="mt-2 inline-block text-xs text-[#9db4ff] hover:underline">
                  Create the first city
                </Link>
              </div>
            )}
            {detail.cities.map((c) => (
              <Link
                key={c.id}
                href={`/cities/${c.id}`}
                className="solid flex items-center justify-between gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-white/4"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-lum">{c.name}</p>
                  <p className="text-[11px] text-ink-mut">{c.venues} venues · {c.playingAreas} PAs</p>
                </div>
                <StatusChip value={c.status} />
              </Link>
            ))}
          </div>
        </Card>

        <Card>
          <PanelHeader
            title="Venues"
            sub="Venues across this territory"
            right={<Badge className="border border-white/8 bg-white/4 text-ink-sec">{detail.venues.length}</Badge>}
          />
          <div className="mt-3 space-y-1.5">
            {detail.venues.length === 0 && <p className="text-sm text-ink-mut">No venues under this territory.</p>}
            {detail.venues.map((v) => (
              <Link
                key={v.id}
                href={`/locations/venues/${v.id}`}
                className="solid flex items-center justify-between gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-white/4"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-lum">{v.name}</p>
                  <p className="text-[11px] text-ink-mut">{v.playingAreas} PAs · {v.upcomingSessions} upcoming</p>
                </div>
                <StatusChip value={v.status} />
              </Link>
            ))}
          </div>
        </Card>

        <Card>
          <PanelHeader
            title="Sessions"
            sub="Upcoming sessions in this territory"
            right={<Badge className="border border-white/8 bg-white/4 text-ink-sec">{upcoming.length}</Badge>}
          />
          <div className="mt-3 space-y-1.5">
            {upcoming.length === 0 && <p className="text-sm text-ink-mut">No upcoming sessions.</p>}
            {upcoming.map((s) => (
              <div key={s.id} className="solid flex items-center justify-between gap-3 rounded-xl px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-lum">{s.title}</p>
                  <p className="text-[11px] text-ink-mut">{s.date} · {s.time} · {s.venueName}</p>
                </div>
                <StatusChip value={s.status} />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <PanelHeader
            title="Managers"
            sub="The operator accountable for this scope"
          />
          {canManage ? (
            <div className="mt-4 flex flex-wrap items-end gap-2">
              <div className="min-w-[220px] flex-1">
                <Field label="Territory manager">
                  <Select value={manager} onChange={(e) => setManager(e.target.value)}>
                    <option value="">Select an operator</option>
                    {managerCandidates.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Button
                variant="secondary"
                disabled={!manager || manager === detail.managerId}
                onClick={() => assignTerritoryManager(detail.id, manager)}
              >
                Assign
              </Button>
            </div>
          ) : (
            <div className="mt-3">
              <div className="flex items-center gap-3 rounded-xl solid px-3 py-2">
                <Avatar initials={OPERATORS.find((o) => o.id === detail.managerId)?.initials ?? "??"} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-lum">{detail.managerName}</p>
                  <p className="text-[11px] text-ink-mut">{OPERATORS.find((o) => o.id === detail.managerId)?.title ?? "—"}</p>
                </div>
              </div>
              <PrototypeRoleNote className="mt-3" />
            </div>
          )}
        </Card>

        <Card>
          <PanelHeader title="Performance" sub="Fill, money and staffing posture" />
          <div className="mt-4">
            <Row label="Fill rate">
              <span className="flex items-center justify-end gap-2">
                <FillMeter value={m.fillRate} className="w-24" />
                <span className="tabular text-sm">{pct(m.fillRate)}</span>
              </span>
            </Row>
            <Row label="Staffing health">
              <span className="flex items-center justify-end gap-2">
                <FillMeter value={m.staffingHealth} className="w-24" />
                <span className="tabular text-sm">{pct(m.staffingHealth)}</span>
              </span>
            </Row>
            <Row label="Revenue">
              <span className="flex items-center justify-end gap-1.5">
                {inr(m.revenue)} <Proto />
              </span>
            </Row>
          </div>
        </Card>

        {canSeeSafety && (
          <Card className="lg:col-span-2">
            <PanelHeader
              title="Safety & Staffing"
              sub="Safety lane view"
              right={<Badge className="border border-white/8 bg-white/4 text-ink-sec">{detail.signals.length} signals</Badge>}
            />
            <div className="mt-3 space-y-4">
              {detail.warnings.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {detail.warnings.map((w) => (
                    <Badge key={w} className="border border-[#f7b955]/30 bg-[#f7b955]/10 text-[#ffd28a]">
                      <AlertTriangle className="h-3 w-3" />
                      {w}
                    </Badge>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="solid rounded-xl p-3">
                  <p className="overline">Incidents</p>
                  <p className={cn("mt-1 text-xl font-semibold", m.incidentCount > 0 ? "text-[#ff8f86]" : "text-ink-lum")}>
                    {m.incidentCount}
                  </p>
                </div>
                <div className="solid rounded-xl p-3">
                  <p className="overline">Staffing health</p>
                  <p
                    className={cn(
                      "mt-1 text-xl font-semibold",
                      m.staffingHealth <= 50 ? "text-[#ff8f86]" : m.staffingHealth <= 75 ? "text-[#ffd28a]" : "text-[#5fd7a3]",
                    )}
                  >
                    {pct(m.staffingHealth)}
                  </p>
                </div>
              </div>
              {detail.signals.length === 0 ? (
                <p className="text-sm text-ink-mut">No signals for this territory.</p>
              ) : (
                <div className="space-y-1.5">
                  {detail.signals.map((sg) => (
                    <div key={sg.id} className="solid flex items-start justify-between gap-3 rounded-xl px-3 py-2">
                      <div className="flex min-w-0 items-start gap-2">
                        <ShieldAlert
                          className={cn(
                            "mt-0.5 h-3.5 w-3.5 shrink-0",
                            sg.kind === "alert" ? "text-[#ffd28a]" : "text-ink-mut",
                          )}
                        />
                        <div className="min-w-0">
                          <p className="text-sm text-ink-sec">{sg.message}</p>
                          <p className="text-[11px] text-ink-mut">{sg.at}</p>
                        </div>
                      </div>
                      {sg.kind === "alert" ? (
                        <Badge className="shrink-0 border border-[#f7b955]/30 bg-[#f7b955]/10 text-[#ffd28a]">alert</Badge>
                      ) : (
                        <Badge className="shrink-0 border border-white/8 bg-white/4 capitalize text-ink-sec">{sg.kind}</Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        )}

        <Card className="lg:col-span-2">
          <PanelHeader
            title="Timeline"
            sub="Audit trail mentioning this territory"
            right={<Badge className="border border-white/8 bg-white/4 text-ink-sec">{audits.length}</Badge>}
          />
          <div className="mt-3 space-y-1.5">
            {audits.length === 0 && <p className="text-sm text-ink-mut">No recorded activity.</p>}
            {audits.map((a) => (
              <div key={a.id} className="solid rounded-xl px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-ink-lum">{a.action}</p>
                  <p className="text-[11px] text-ink-mut">{a.timestamp}</p>
                </div>
                <p className="mt-0.5 text-xs text-ink-sec">{a.description}</p>
                <p className="mt-0.5 text-[11px] text-ink-mut">{operatorName(a.operatorId)}</p>
              </div>
            ))}
          </div>
        </Card>

        {canAnnotate && (
          <Card className="lg:col-span-2">
            <PanelHeader title="Annotations" sub="Operational notes append to the audit trail" />
            <div className="mt-4 flex flex-wrap items-end gap-2">
              <div className="min-w-[260px] flex-1">
                <Field label="Add operational note">
                  <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Context for the team…" />
                </Field>
              </div>
              <Button
                variant="secondary"
                disabled={!note.trim()}
                onClick={() => {
                  addOperationalNote("territory", detail.name, note.trim());
                  setNote("");
                }}
              >
                <StickyNote className="h-4 w-4" />
                Add note
              </Button>
            </div>
          </Card>
        )}
      </div>
    </PageFrame>
  );
}
