"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { nextId, type TerritoryInput } from "@/lib/prototype/repositories";
import { OPERATORS, operatorName } from "@/lib/data/mock";
import { geoCan } from "@/lib/geo/access";
import { PageFrame, PrototypeNote, PrototypeRoleNote } from "@/components/geo/layout";
import { WizardShell, useWizard } from "@/components/geo/WizardShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, PanelHeader, PermissionDenied } from "@/components/ui/panels";
import { Button } from "@/components/ui/primitives";
import { Field, Input, Select } from "@/components/ui/fields";
import { Tide } from "@/components/motion/Motion";
import { ArrowLeft, ArrowRight, X, CheckCircle2 } from "lucide-react";
import { SetupBackNavigation, SetupStatusBadge } from "@/components/setup/shared";

const STEPS = [
  { label: "Choose Franchise", sub: "Parent organization" },
  { label: "Territory Details", sub: "Name, state, timezone" },
  { label: "Assign Manager", sub: "Operating lead" },
  { label: "Review", sub: "Summary" },
];

export default function NewTerritoryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preSelectedFranchiseId = searchParams.get("franchiseId") || "";
  
  const { state, role, canAccess, hydrated, createTerritory } = useStore();
  const { step, next, back, jump } = useWizard(4);

  const [franchiseId, setFranchiseId] = useState(preSelectedFranchiseId);
  const [name, setName] = useState("");
  const [geoState, setGeoState] = useState("");
  const [region, setRegion] = useState("");
  const [timezone, setTimezone] = useState("IST (UTC+5:30)");
  const [currency, setCurrency] = useState("INR (₹)");
  const [managerId, setManagerId] = useState("");
  const [contactInfo, setContactInfo] = useState("");
  
  const [createdId, setCreatedId] = useState<string | null>(null);

  const nameTrimmed = name.trim();
  const franchiseExists = state.franchises.some((f) => f.id === franchiseId);

  const stepValid: Record<number, boolean> = {
    0: franchiseExists,
    1: nameTrimmed.length > 0 && timezone.trim().length > 0 && currency.trim().length > 0,
    2: managerId.length > 0,
    3: true,
  };

  const franchiseName = state.franchises.find((f) => f.id === franchiseId)?.name ?? "—";

  const handleCreate = () => {
    const id = nextId("t", state.territories.map((t) => t.id));
    const input: TerritoryInput = {
      id,
      franchiseId,
      name: nameTrimmed,
      type: "urban",
      state: geoState.trim(),
      region: region.trim(),
      managerId,
      status: "active",
      timezone: timezone.trim(),
      currency,
      contactInfo: contactInfo.trim(),
      notes: "",
    };
    createTerritory(input);
    setCreatedId(id);
  };

  if (!hydrated) return <PageFrame><Tide /></PageFrame>;
  if (!canAccess("/territories")) return <PageFrame><PermissionDenied module="Territories" /></PageFrame>;

  if (!geoCan(role.id, "create-territory")) {
    return (
      <PageFrame>
        <PageHeader overline="Setup · Territories" title="Add Territory" />
        <Card glass={false} className="mt-6">
          <PanelHeader title="Territory creation is scoped to platform owners and regional partners" />
          <p className="mt-3 text-sm text-ink-mut">Your current position cannot create new scopes.</p>
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

  if (createdId) {
    return (
      <PageFrame>
        <div className="max-w-md mx-auto mt-12 text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-emerald-950/50 border border-emerald-800 flex items-center justify-center mx-auto text-emerald-400">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-ink-lum">Territory Added</h2>
            <p className="text-ink-sec mt-2">The territory has been successfully created under the franchise.</p>
          </div>
          
          <div className="glass p-5 rounded-2xl border border-white/10 space-y-3">
            <h3 className="text-sm font-semibold text-ink-lum">Recommended Next Action</h3>
            <p className="text-xs text-ink-mut mb-4">A territory needs cities to operate in.</p>
            <Link href={`/cities/new?territoryId=${createdId}`} className="block">
              <Button variant="primary" className="w-full justify-center font-bold">
                Add First City
              </Button>
            </Link>
          </div>

          <div className="flex gap-3 justify-center">
            <Link href={`/territories/${createdId}`}>
              <Button variant="secondary">View Territory</Button>
            </Link>
            <Link href="/setup">
              <Button variant="ghost">Back to Setup</Button>
            </Link>
          </div>
        </div>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <div className="mb-6 space-y-4">
        <SetupBackNavigation label="Back to Territories" href="/territories" />
        <PageHeader
          overline="Setup · Territories"
          title="Add Territory"
          sub="Territories divide a franchise region into smaller local operating scopes."
        />
      </div>

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
              {step < 3 ? (
                <Button variant="primary" disabled={!stepValid[step]} onClick={next}>
                  Next
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button variant="primary" onClick={handleCreate}>
                  Add Territory
                </Button>
              )}
            </div>
          </>
        }
      >
        {step === 0 && (
          <div className="space-y-5">
            <Field label="Choose Franchise" hint="The parent franchise this territory belongs to.">
              <Select value={franchiseId} onChange={(e) => setFranchiseId(e.target.value)}>
                <option value="">Select a franchise</option>
                {state.franchises.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </Select>
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <Field label="Territory Name" hint="Example: Hyderabad Central">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Hyderabad Central" />
            </Field>
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
            <Field label="Manager" hint="The operator accountable for this territory.">
              <Select value={managerId} onChange={(e) => setManagerId(e.target.value)}>
                <option value="">Select manager</option>
                {OPERATORS.filter(o => ["platform-owner", "super-admin", "regional-partner", "city-manager"].includes(o.role)).map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Contact Info (Optional)">
              <Input value={contactInfo} onChange={(e) => setContactInfo(e.target.value)} placeholder="Phone or email" />
            </Field>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <div>
              <p className="overline mb-2">Summary</p>
              <div className="space-y-1">
                <div className="flex justify-between py-1 border-b border-white/5 text-sm">
                  <span className="text-ink-mut">Franchise</span>
                  <span className="text-ink-lum font-medium">{franchiseName}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5 text-sm">
                  <span className="text-ink-mut">Name</span>
                  <span className="text-ink-lum font-medium">{nameTrimmed}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5 text-sm">
                  <span className="text-ink-mut">Manager</span>
                  <span className="text-ink-lum font-medium">{managerId ? operatorName(managerId) : "—"}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5 text-sm">
                  <span className="text-ink-mut">State/Region</span>
                  <span className="text-ink-lum font-medium">{geoState} / {region}</span>
                </div>
              </div>
            </div>
            <PrototypeNote>
              Creating a territory adds it to the chosen franchise immediately.
            </PrototypeNote>
          </div>
        )}
      </WizardShell>
    </PageFrame>
  );
}
