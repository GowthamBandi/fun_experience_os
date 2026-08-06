"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { nextId, type FranchiseInput } from "@/lib/prototype/repositories";
import { PageFrame } from "@/components/geo/layout";
import { WizardShell, useWizard } from "@/components/geo/WizardShell";
import { Button } from "@/components/ui/primitives";
import { Field, Input, Select } from "@/components/ui/fields";
import { Tide } from "@/components/motion/Motion";
import { SetupBackNavigation } from "@/components/setup/shared";
import { PermissionDenied } from "@/components/ui/panels";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { OPERATORS } from "@/lib/data/mock";

const STEPS = [
  { label: "Basic Information", sub: "Name and entity" },
  { label: "Operating Head", sub: "Leadership" },
  { label: "Area & Status", sub: "Region and commercial" },
  { label: "Review", sub: "Confirm details" },
];

export default function NewFranchisePage() {
  const router = useRouter();
  const { state, canAccess, hydrated, createFranchise } = useStore();
  
  // Adding one more step conceptually for the success screen, though the wizard shell handles steps 0-3
  const [createdId, setCreatedId] = useState<string | null>(null);
  
  const { step, next, back, jump } = useWizard(4);

  const [name, setName] = useState("");
  const [legalEntity, setLegalEntity] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  
  const [franchiseHead, setFranchiseHead] = useState("");
  const [contactDetails, setContactDetails] = useState("");
  
  const [type, setType] = useState<"master" | "regional">("regional");
  const [revenueShare, setRevenueShare] = useState("15");
  const [status, setStatus] = useState<FranchiseInput["status"]>("active");

  const share = Number(revenueShare);
  
  const stepValid: Record<number, boolean> = {
    0: name.trim().length > 0 && legalEntity.trim().length > 0,
    1: franchiseHead.trim().length > 0 && contactDetails.trim().length > 0,
    2: revenueShare.trim() !== "" && share >= 0 && share <= 100,
    3: true,
  };

  const handleCreate = () => {
    const id = nextId("f", state.franchises.map((f) => f.id));
    createFranchise({
      id,
      name: name.trim(),
      type,
      isInternal,
      legalEntity: legalEntity.trim(),
      assignedTerritories: [],
      franchiseHead: franchiseHead.trim(),
      revenueShare: share,
      startDate: new Date().toISOString().split('T')[0],
      status,
      contactDetails: contactDetails.trim(),
      notes: "",
    });
    setCreatedId(id);
  };

  if (!hydrated) return <PageFrame><Tide /></PageFrame>;
  if (!canAccess("/franchises")) return <PageFrame><PermissionDenied module="Franchises" /></PageFrame>;

  // Success screen
  if (createdId) {
    return (
      <PageFrame>
        <div className="max-w-2xl mx-auto mt-12">
          <div className="solid rounded-panel p-8 flex flex-col items-center text-center space-y-6">
            <div className="h-16 w-16 rounded-full bg-[#12b76a]/20 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-[#12b76a]" />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold text-ink-lum">Franchise Created</h2>
              <p className="text-ink-mut">
                {name} has been successfully created. You can now assign territories to this franchise.
              </p>
            </div>

            <div className="w-full max-w-sm mt-4">
              <Button
                variant="primary"
                className="w-full font-bold justify-center"
                onClick={() => router.push(`/territories/new?franchiseId=${createdId}`)}
              >
                Add First Territory
              </Button>
            </div>
            
            <div className="flex gap-4 mt-6 pt-6 border-t border-white/10 w-full justify-center">
              <Button variant="secondary" onClick={() => router.push(`/franchises/${createdId}`)}>
                View Franchise
              </Button>
              <Button variant="ghost" onClick={() => router.push("/setup")}>
                Back to Setup
              </Button>
            </div>
          </div>
        </div>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <div className="max-w-3xl mx-auto space-y-6 pb-20">
        <div className="space-y-1">
          <SetupBackNavigation label="Back to Franchises" href="/franchises" />
          <h1 className="text-2xl font-semibold text-ink-lum">Create Franchise</h1>
          <p className="text-sm text-ink-mut">A franchise represents the organization or regional team responsible for operations.</p>
        </div>

        <WizardShell
          steps={STEPS}
          step={step}
          onStep={jump}
          className="mt-6"
          footer={
            <div className="flex items-center justify-between w-full">
              <Button variant="ghost" onClick={() => router.push("/franchises")}>
                Cancel
              </Button>
              <div className="flex items-center gap-2">
                {step > 0 && (
                  <Button variant="secondary" onClick={back}>
                    <ArrowLeft className="h-4 w-4 mr-1" />
                    Back
                  </Button>
                )}
                {step < 3 ? (
                  <Button variant="primary" disabled={!stepValid[step]} onClick={next}>
                    Next
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                ) : (
                  <Button variant="primary" onClick={handleCreate}>
                    Create Franchise
                  </Button>
                )}
              </div>
            </div>
          }
        >
          {step === 0 && (
            <div className="space-y-5">
              <Field label="Franchise Name" hint="The display name of the franchise.">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Coastal Sports Collective" />
              </Field>
              <Field label="Legal Entity" hint="Registered company or LLP name.">
                <Input value={legalEntity} onChange={(e) => setLegalEntity(e.target.value)} placeholder="e.g. Coastal Sports LLP" />
              </Field>
              <label className="flex items-center gap-3 cursor-pointer p-3 solid rounded-xl">
                <input
                  type="checkbox"
                  checked={isInternal}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIsInternal(e.target.checked)}
                  className="rounded border-white/20 bg-black/40 text-brand focus:ring-0"
                />
                <div>
                  <div className="text-sm font-medium text-ink-lum">Internal Organization</div>
                  <div className="text-xs text-ink-mut">This franchise is owned and operated internally by the platform.</div>
                </div>
              </label>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <Field label="Operating Head" hint="Primary person responsible for this franchise.">
                <Select value={franchiseHead} onChange={(e) => setFranchiseHead(e.target.value)}>
                  <option value="">Select an operator...</option>
                  {OPERATORS.map((o) => (
                    <option key={o.id} value={o.name}>
                      {o.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Contact Details" hint="Email or phone number for the operating head.">
                <Input
                  value={contactDetails}
                  onChange={(e) => setContactDetails(e.target.value)}
                  placeholder="e.g. head@coastalsports.in"
                />
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <Field label="Franchise Type" hint="Master franchises manage regional franchises.">
                <Select value={type} onChange={(e) => setType(e.target.value as "master" | "regional")}>
                  <option value="regional">Regional Franchise</option>
                  <option value="master">Master Franchise</option>
                </Select>
              </Field>
              <Field label="Revenue Share (%)" hint="Platform percentage of settled revenue.">
                <Input type="number" min={0} max={100} value={revenueShare} onChange={(e) => setRevenueShare(e.target.value)} />
              </Field>
              <Field label="Initial Status">
                <Select value={status} onChange={(e) => setStatus(e.target.value as FranchiseInput["status"])}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </Select>
              </Field>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div>
                <p className="overline mb-3">Review Details</p>
                <div className="space-y-1">
                  <div className="flex items-start justify-between gap-4 border-b border-white/4 py-2">
                    <span className="text-sm text-ink-mut">Name</span>
                    <span className="text-sm font-medium text-ink-lum">{name || "—"}</span>
                  </div>
                  <div className="flex items-start justify-between gap-4 border-b border-white/4 py-2">
                    <span className="text-sm text-ink-mut">Legal Entity</span>
                    <span className="text-sm text-ink-lum">{legalEntity || "—"}</span>
                  </div>
                  <div className="flex items-start justify-between gap-4 border-b border-white/4 py-2">
                    <span className="text-sm text-ink-mut">Type</span>
                    <span className="text-sm text-ink-lum capitalize">{isInternal ? 'Internal' : 'External'} {type}</span>
                  </div>
                  <div className="flex items-start justify-between gap-4 border-b border-white/4 py-2">
                    <span className="text-sm text-ink-mut">Operating Head</span>
                    <span className="text-sm text-ink-lum">{franchiseHead || "—"}</span>
                  </div>
                  <div className="flex items-start justify-between gap-4 border-b border-white/4 py-2">
                    <span className="text-sm text-ink-mut">Contact</span>
                    <span className="text-sm text-ink-lum">{contactDetails || "—"}</span>
                  </div>
                  <div className="flex items-start justify-between gap-4 border-b border-white/4 py-2">
                    <span className="text-sm text-ink-mut">Revenue Share</span>
                    <span className="text-sm text-ink-lum">{share}%</span>
                  </div>
                  <div className="flex items-start justify-between gap-4 py-2">
                    <span className="text-sm text-ink-mut">Status</span>
                    <span className="text-sm text-ink-lum capitalize">{status}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </WizardShell>
      </div>
    </PageFrame>
  );
}
