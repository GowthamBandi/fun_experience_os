"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { nextId, type TerritoryInput } from "@/lib/prototype/repositories";
import { OPERATORS, operatorName } from "@/lib/data/mock";
import { geoCan } from "@/lib/geo/access";
import type { RoleId } from "@/lib/types";
import { PageFrame, PrototypeNote, PrototypeRoleNote } from "@/components/geo/layout";
import { WizardShell, useWizard } from "@/components/geo/WizardShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, PanelHeader, PermissionDenied } from "@/components/ui/panels";
import { Avatar, Badge, Button } from "@/components/ui/primitives";
import { Field, Input, Select } from "@/components/ui/fields";
import { Tide } from "@/components/motion/Motion";
import { ArrowLeft, ArrowRight, X } from "lucide-react";

const STEPS = [
  { label: "Franchise & Name", sub: "Scope and identity" },
  { label: "Geography", sub: "State, region, timezone" },
  { label: "Manager", sub: "Accountable operator" },
  { label: "Contact & Notes", sub: "Reach and context" },
  { label: "Review", sub: "Confirm & create" },
];

const MANAGER_ROLES: RoleId[] = ["platform-owner", "super-admin", "regional-partner", "city-manager", "ops-manager"];
const managerCandidates = OPERATORS.filter((o) => MANAGER_ROLES.includes(o.role));

export default function NewTerritoryPage() {
  const router = useRouter();
  const { state, role, canAccess, hydrated, createTerritory } = useStore();
  const { step, next, back, jump } = useWizard(5);

  const [franchiseId, setFranchiseId] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<TerritoryInput["type"]>("urban");
  const [status, setStatus] = useState<TerritoryInput["status"]>("draft");
  const [geoState, setGeoState] = useState("");
  const [region, setRegion] = useState("");
  const [timezone, setTimezone] = useState("IST (UTC+5:30)");
  const [currency, setCurrency] = useState("INR (₹)");
  const [managerId, setManagerId] = useState("");
  const [contactInfo, setContactInfo] = useState("");
  const [notes, setNotes] = useState("");

  const nameTrimmed = name.trim();
  const franchiseExists = state.franchises.some((f) => f.id === franchiseId);
  const nameUnique = !state.territories.some(
    (t) => t.franchiseId === franchiseId && t.name.trim().toLowerCase() === nameTrimmed.toLowerCase(),
  );

  const stepValid: Record<number, boolean> = {
    0: franchiseExists && nameTrimmed.length > 0 && nameUnique,
    1: timezone.trim().length > 0 && currency.trim().length > 0,
    2: managerId.length > 0,
    3: true,
    4: true,
  };

  const franchiseName = state.franchises.find((f) => f.id === franchiseId)?.name ?? "—";

  const assumptions = [
    { label: "Franchise", value: franchiseName },
    { label: "Name", value: nameTrimmed || "—" },
    { label: "Type", value: type },
    { label: "State / Region", value: `${geoState.trim() || "—"} / ${region.trim() || "—"}` },
    { label: "Manager", value: managerId ? operatorName(managerId) : "—" },
    { label: "Timezone", value: timezone.trim() || "—" },
    { label: "Currency", value: currency },
    { label: "Status", value: status },
  ];

  const warnings = [
    status === "draft" ? "Draft territories are not schedulable until activated." : "",
    currency !== "INR (₹)" ? "Non-INR territory currency is unusual for this prototype." : "",
  ].filter(Boolean) as string[];

  const handleCreate = () => {
    const id = nextId("t", state.territories.map((t) => t.id));
    const input: TerritoryInput = {
      id,
      franchiseId,
      name: nameTrimmed,
      type,
      state: geoState.trim(),
      region: region.trim(),
      managerId,
      status,
      timezone: timezone.trim(),
      currency,
      contactInfo: contactInfo.trim(),
      notes: notes.trim(),
    };
    createTerritory(input);
    router.push(`/territories/${id}`);
  };

  if (!hydrated) return <PageFrame><Tide /></PageFrame>;
  if (!canAccess("/territories")) return <PageFrame><PermissionDenied module="Territories" /></PageFrame>;

  if (!geoCan(role.id, "create-territory")) {
    return (
      <PageFrame>
        <PageHeader overline="Franchise Operations · Territories" title="New territory" />
        <Card glass={false} className="mt-6">
          <PanelHeader
            title="Territory creation is scoped to platform owners, super admins and regional partners"
            sub="City managers and below can operate within a territory but cannot open new ones."
          />
          <p className="mt-3 text-sm text-ink-mut">
            Your current position can view territory operations but cannot create new scopes. Switch position with the
            role simulator to try it.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={() => router.push("/territories")}>
              <ArrowLeft className="h-4 w-4" />
              Back to territories
            </Button>
            <PrototypeRoleNote />
          </div>
        </Card>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <PageHeader
        overline="Franchise Operations · Territories"
        title="New territory"
        sub="Five steps to a new scope under a franchise."
      />
      <WizardShell
        steps={STEPS}
        step={step}
        onStep={jump}
        className="mt-6"
        footer={
          <>
            <Button variant="ghost" onClick={() => router.push("/territories")}>
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
              {step < 4 ? (
                <Button variant="primary" disabled={!stepValid[step]} onClick={next}>
                  Next
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button variant="primary" onClick={handleCreate}>
                  Create territory
                </Button>
              )}
            </div>
          </>
        }
      >
        {step === 0 && (
          <div className="space-y-5">
            <Field label="Franchise" hint="The franchise this territory reports into.">
              <Select value={franchiseId} onChange={(e) => setFranchiseId(e.target.value)}>
                <option value="">Select a franchise</option>
                {state.franchises.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Territory name" hint="Unique within the selected franchise.">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Hyderabad Central" />
              {nameTrimmed.length > 0 && !nameUnique && (
                <p className="mt-2 text-xs text-[#ff8f86]">
                  A territory with this name already exists under this franchise.
                </p>
              )}
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Type">
                <Select value={type} onChange={(e) => setType(e.target.value as TerritoryInput["type"])}>
                  <option value="urban">Urban</option>
                  <option value="suburban">Suburban</option>
                  <option value="regional">Regional</option>
                </Select>
              </Field>
              <Field label="Status">
                <Select value={status} onChange={(e) => setStatus(e.target.value as TerritoryInput["status"])}>
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                </Select>
              </Field>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="State">
                <Input value={geoState} onChange={(e) => setGeoState(e.target.value)} placeholder="e.g. Telangana" />
              </Field>
              <Field label="Region">
                <Input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="e.g. South-1" />
              </Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Timezone">
                <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} />
              </Field>
              <Field label="Currency">
                <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  <option value="INR (₹)">INR (₹)</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </Select>
              </Field>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <Field label="Territory manager" hint="The operator accountable for this scope.">
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

        {step === 3 && (
          <div className="space-y-5">
            <Field label="Contact info" hint="Ops email or phone for the scope.">
              <Input
                value={contactInfo}
                onChange={(e) => setContactInfo(e.target.value)}
                placeholder="e.g. hyd-ops@experienceos.com"
              />
            </Field>
            <Field label="Notes">
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Context for the team…" />
            </Field>
          </div>
        )}

        {step === 4 && (
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
            {warnings.length > 0 && (
              <div>
                <p className="overline mb-2">Warnings</p>
                <div className="flex flex-wrap gap-1.5">
                  {warnings.map((w) => (
                    <Badge key={w} className="border border-[#f7b955]/30 bg-[#f7b955]/10 text-[#ffd28a]">
                      {w}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <PrototypeNote>
              Creating a territory also assigns it to the chosen franchise — no manual sync needed. Prototype data only.
            </PrototypeNote>
            <PrototypeRoleNote />
          </div>
        )}
      </WizardShell>
    </PageFrame>
  );
}
