"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { categoryById, nextId, territoryById, type CityInput } from "@/lib/prototype/repositories";
import { OPERATORS, operatorName } from "@/lib/data/mock";
import { geoCan } from "@/lib/geo/access";
import type { RoleId } from "@/lib/types";
import { cn } from "@/lib/format";
import { Breadcrumbs, PageFrame, PrototypeRoleNote } from "@/components/geo/layout";
import { WizardShell, useWizard } from "@/components/geo/WizardShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, PanelHeader, PermissionDenied } from "@/components/ui/panels";
import { Avatar, Badge, Button } from "@/components/ui/primitives";
import { Field, Input, Select } from "@/components/ui/fields";
import { Tide } from "@/components/motion/Motion";
import { ArrowLeft, ArrowRight, MapPin, X } from "lucide-react";

const STEPS = [
  { label: "Identity", sub: "Name, state, status" },
  { label: "Manager", sub: "Accountable operator" },
  { label: "Categories", sub: "Supported activities" },
  { label: "Review", sub: "Confirm & create" },
];

const MANAGER_ROLES: RoleId[] = ["platform-owner", "super-admin", "regional-partner", "city-manager", "ops-manager"];
const managerCandidates = OPERATORS.filter((o) => MANAGER_ROLES.includes(o.role));

export default function NewCityPage() {
  const router = useRouter();
  const { id: territoryId } = useParams<{ id: string }>();
  const { state, role, canAccess, hydrated, createCity } = useStore();
  const { step, next, back, jump } = useWizard(4);

  const [name, setName] = useState("");
  const [geoState, setGeoState] = useState("");
  const [launchDate, setLaunchDate] = useState("");
  const [status, setStatus] = useState<CityInput["status"]>("draft");
  const [managerId, setManagerId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const t = territoryById(state, territoryId);

  const nameTrimmed = name.trim();
  const nameUnique = !state.cities.some(
    (c) => c.territoryId === territoryId && c.name.trim().toLowerCase() === nameTrimmed.toLowerCase(),
  );

  const stepValid: Record<number, boolean> = {
    0: nameTrimmed.length > 0 && nameUnique,
    1: managerId.length > 0,
    2: selected.size >= 1,
    3: true,
  };

  const toggle = (catId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) {
        next.delete(catId);
      } else {
        next.add(catId);
      }
      return next;
    });
  };

  const assumptions = [
    { label: "Territory", value: t?.name ?? "—" },
    { label: "Name", value: nameTrimmed || "—" },
    { label: "State", value: geoState.trim() || "—" },
    { label: "Manager", value: managerId ? operatorName(managerId) : "—" },
    { label: "Categories", value: [...selected].map((cid) => categoryById(state, cid)?.name ?? cid).join(", ") || "—" },
    { label: "Launch date", value: launchDate || "—" },
    { label: "Status", value: status },
  ];

  const handleCreate = () => {
    const id = nextId("c", state.cities.map((c) => c.id));
    const input: CityInput = {
      id,
      territoryId,
      name: nameTrimmed,
      state: geoState.trim(),
      launchDate,
      managerId,
      supportedCategories: [...selected],
      status,
      notes: "",
    };
    createCity(input);
    router.push(`/cities/${id}`);
  };

  if (!hydrated) return <PageFrame><Tide /></PageFrame>;
  if (!canAccess("/territories")) return <PageFrame><PermissionDenied module="Territories" /></PageFrame>;

  if (!t) {
    return (
      <PageFrame>
        <div className="solid rounded-panel p-10 text-center">
          <p className="text-sm font-medium text-ink-lum">Territory not found</p>
          <p className="mt-1 text-sm text-ink-mut">A city belongs to exactly one territory — and this one doesn&apos;t exist.</p>
          <Button variant="secondary" className="mt-5" onClick={() => router.push("/territories")}>
            <ArrowLeft className="h-4 w-4" />
            Back to territories
          </Button>
        </div>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <Breadcrumbs
        items={[
          { label: "Territories", href: "/territories" },
          { label: t.name, href: `/territories/${territoryId}` },
          { label: "New city" },
        ]}
      />

      <PageHeader
        overline="Territories · City Creation"
        title="New city"
        sub="A city belongs to exactly one territory."
        right={
          <Link
            href={`/territories/${territoryId}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#4c6fff]/25 bg-[#4c6fff]/12 px-2.5 py-0.5 text-xs font-medium text-[#9db4ff] transition-colors hover:bg-[#4c6fff]/20"
          >
            <MapPin className="h-3 w-3" />
            {t.name}
          </Link>
        }
      />

      <WizardShell
        steps={STEPS}
        step={step}
        onStep={jump}
        className="mt-6"
        footer={
          <>
            <Button variant="ghost" onClick={() => router.push(`/territories/${territoryId}`)}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
            <div className="flex items-center gap-2">
              {step > 0 && (
                <Button variant="secondary" onClick={back}>
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
              )}
              {step < 3 ? (
                <Button variant="primary" disabled={!stepValid[step]} onClick={next}>
                  Next
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button variant="primary" onClick={handleCreate}>
                  Create city
                </Button>
              )}
            </div>
          </>
        }
      >
        {step === 0 && (
          <div className="space-y-5">
            <Field label="City name" hint="Unique within this territory.">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Hyderabad" />
              {nameTrimmed.length > 0 && !nameUnique && (
                <p className="mt-2 text-xs text-[#ff8f86]">
                  A city with this name already exists under this territory.
                </p>
              )}
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="State">
                <Input value={geoState} onChange={(e) => setGeoState(e.target.value)} placeholder="e.g. Telangana" />
              </Field>
              <Field label="Launch date">
                <Input type="date" value={launchDate} onChange={(e) => setLaunchDate(e.target.value)} />
              </Field>
            </div>
            <Field label="Status">
              <Select value={status} onChange={(e) => setStatus(e.target.value as CityInput["status"])}>
                <option value="draft">Draft</option>
                <option value="ready">Ready</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
              </Select>
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <Field label="City manager" hint="The operator accountable for this city.">
              <Select value={managerId} onChange={(e) => setManagerId(e.target.value)}>
                <option value="">Select an operator</option>
                {managerCandidates.map((o) => (
                  <option key={o.id} value={o.id}>
                    <Avatar initials={o.initials} size="sm" /> {o.name}
                  </option>
                ))}
              </Select>
            </Field>
            {managerId && (
              <div className="flex items-center gap-3 rounded-xl solid px-3 py-2">
                <Avatar initials={OPERATORS.find((o) => o.id === managerId)?.initials ?? "??"} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-lum">{operatorName(managerId)}</p>
                  <p className="text-[11px] text-ink-mut">{OPERATORS.find((o) => o.id === managerId)?.title ?? "—"}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div>
              <p className="overline mb-2">Supported activity categories</p>
              <div className="flex flex-wrap gap-2">
                {state.categories.map((cat) => {
                  const on = selected.has(cat.id);
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => toggle(cat.id)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200 ease-light",
                        on
                          ? "border-[#4c6fff]/40 bg-[#4c6fff]/15 text-ink-lum"
                          : "border-white/10 bg-white/4 text-ink-mut hover:text-ink-sec",
                      )}
                    >
                      {categoryById(state, cat.id)?.name ?? cat.id}
                    </button>
                  );
                })}
              </div>
              {selected.size === 0 && (
                <p className="mt-3 text-xs text-ink-mut">Pick at least one category this city can host.</p>
              )}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <div>
              <p className="overline mb-2">Assumptions</p>
              <div className="space-y-1">
                {assumptions.map((a) => (
                  <div key={a.label} className="flex items-start justify-between gap-4 border-b border-white/4 py-1.5">
                    <span className="overline shrink-0 pt-px">{a.label}</span>
                    <span className="min-w-0 text-right text-sm text-ink-sec capitalize">{a.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <Card glass={false} className="p-4">
              <PanelHeader title="Fixed territory" sub="Cities are created under exactly one territory." />
              <Badge className="mt-3 border border-[#4c6fff]/25 bg-[#4c6fff]/12 text-[#9db4ff]">
                <MapPin className="h-3 w-3" />
                {t.name}
              </Badge>
            </Card>
            <PrototypeRoleNote />
          </div>
        )}
      </WizardShell>
    </PageFrame>
  );
}
