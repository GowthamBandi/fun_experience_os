"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { nextId, territoryRows, type FranchiseInput } from "@/lib/prototype/repositories";
import { OPERATORS } from "@/lib/data/mock";
import { geoCan } from "@/lib/geo/access";
import { PageFrame, Proto, PrototypeNote, PrototypeRoleNote } from "@/components/geo/layout";
import { WizardShell, useWizard } from "@/components/geo/WizardShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, PanelHeader, PermissionDenied } from "@/components/ui/panels";
import { Button, StatusChip, Badge } from "@/components/ui/primitives";
import { Field, Input, Select } from "@/components/ui/fields";
import { Tide } from "@/components/motion/Motion";
import { ArrowLeft, ArrowRight, X } from "lucide-react";

const STEPS = [
  { label: "Identity", sub: "Name, type, status" },
  { label: "Legal & Head", sub: "Entity, operator, dates" },
  { label: "Territories", sub: "Existing scopes" },
  { label: "Commercial", sub: "Share & settlement" },
  { label: "Contact & Notes", sub: "Reach & context" },
  { label: "Review", sub: "Confirm & create" },
];

export default function NewFranchisePage() {
  const router = useRouter();
  const { state, role, canAccess, hydrated, createFranchise } = useStore();
  const { step, next, back, jump } = useWizard(6);

  const [name, setName] = useState("");
  const [type, setType] = useState<"master" | "regional">("master");
  const [isInternal, setIsInternal] = useState<"internal" | "external">("internal");
  const [status, setStatus] = useState<FranchiseInput["status"]>("active");
  const [legalEntity, setLegalEntity] = useState("");
  const [franchiseHead, setFranchiseHead] = useState("");
  const [startDate, setStartDate] = useState("");
  const [revenueShare, setRevenueShare] = useState("15");
  const [contactDetails, setContactDetails] = useState("");
  const [notes, setNotes] = useState("");
  const [settlementModel, setSettlementModel] = useState("Weekly settlement");

  const share = Number(revenueShare);
  const stepValid: Record<number, boolean> = {
    0: name.trim().length > 0,
    1:
      legalEntity.trim().length > 0 &&
      franchiseHead.trim().length > 0 &&
      startDate.length > 0 &&
      revenueShare.trim() !== "" &&
      share >= 0 &&
      share <= 100,
    2: true,
    3: true,
    4: true,
    5: true,
  };

  const assumptions = [
    { label: "Name", value: name.trim() || "—" },
    { label: "Type", value: type },
    { label: "Origin", value: isInternal },
    { label: "Status", value: status },
    { label: "Legal entity", value: legalEntity.trim() || "—" },
    { label: "Franchise head", value: franchiseHead.trim() || "—" },
    { label: "Start date", value: startDate || "—" },
    { label: "Revenue share", value: `${share}%` },
  ];

  const warnings = [
    share < 10 ? "Revenue share below 10% is unusually low." : "",
    status === "suspended" ? "Creating a franchise that starts suspended is unusual." : "",
    isInternal === "external" ? "External partners need a signed agreement before launch." : "",
  ].filter(Boolean) as string[];

  const handleCreate = () => {
    const id = nextId("f", state.franchises.map((f) => f.id));
    createFranchise({
      id,
      name: name.trim(),
      type,
      isInternal: isInternal === "internal",
      legalEntity: legalEntity.trim(),
      assignedTerritories: [],
      franchiseHead: franchiseHead.trim(),
      revenueShare: share,
      startDate,
      status,
      contactDetails: contactDetails.trim(),
      notes: notes.trim(),
    });
    router.push(`/franchises/${id}`);
  };

  if (!hydrated) return <PageFrame><Tide /></PageFrame>;
  if (!canAccess("/franchises")) return <PageFrame><PermissionDenied module="Franchises" /></PageFrame>;

  if (!geoCan(role.id, "create-franchise")) {
    return (
      <PageFrame>
        <PageHeader overline="Franchise Operations · Part P2B" title="New franchise" />
        <Card glass={false} className="mt-6">
          <PanelHeader
            title="Creation is reserved for platform owners"
            sub="Only the platform owner or a super admin can create a platform-level franchise."
          />
          <p className="mt-3 text-sm text-ink-mut">
            Your current position can view franchise operations but cannot open new partnerships or chains. Switch position
            with the role simulator to try it.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={() => router.push("/franchises")}>
              <ArrowLeft className="h-4 w-4" />
              Back to franchises
            </Button>
            <PrototypeRoleNote />
          </div>
        </Card>
      </PageFrame>
    );
  }

  const territories = territoryRows(state);

  return (
    <PageFrame>
      <PageHeader
        overline="Franchise Operations · Part P2B"
        title="New franchise"
        sub="Six steps to a new platform partnership or chain."
      />
      <WizardShell
        steps={STEPS}
        step={step}
        onStep={jump}
        className="mt-6"
        footer={
          <>
            <Button variant="ghost" onClick={() => router.push("/franchises")}>
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
              {step < 5 ? (
                <Button variant="primary" disabled={!stepValid[step]} onClick={next}>
                  Next
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button variant="primary" onClick={handleCreate}>
                  Create franchise
                </Button>
              )}
            </div>
          </>
        }
      >
        {step === 0 && (
          <div className="space-y-5">
            <Field label="Franchise name" hint="Consumer-facing partnership or chain name.">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Coastal Sports Collective" />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Type">
                <Select value={type} onChange={(e) => setType(e.target.value as "master" | "regional")}>
                  <option value="master">Master franchise</option>
                  <option value="regional">Regional franchise</option>
                </Select>
              </Field>
              <Field label="Origin">
                <Select value={isInternal} onChange={(e) => setIsInternal(e.target.value as "internal" | "external")}>
                  <option value="internal">Internal</option>
                  <option value="external">External</option>
                </Select>
              </Field>
            </div>
            <Field label="Status">
              <Select value={status} onChange={(e) => setStatus(e.target.value as FranchiseInput["status"])}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="suspended">Suspended</option>
              </Select>
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <Field label="Legal entity" hint="Registered company or LLP.">
              <Input value={legalEntity} onChange={(e) => setLegalEntity(e.target.value)} placeholder="e.g. Coastal Sports LLP" />
            </Field>
            <Field label="Franchise head">
              <Select value={franchiseHead} onChange={(e) => setFranchiseHead(e.target.value)}>
                <option value="">Select an operator</option>
                {OPERATORS.map((o) => (
                  <option key={o.id} value={o.name}>
                    {o.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Start date">
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </Field>
              <Field label="Revenue share (%)" hint="Platform percentage of settled revenue.">
                <Input type="number" min={0} max={100} value={revenueShare} onChange={(e) => setRevenueShare(e.target.value)} />
              </Field>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <PrototypeNote>Territory assignment happens at territory creation time — this franchise starts with none assigned.</PrototypeNote>
            <div>
              <p className="overline mb-2">Existing territories</p>
              <div className="space-y-1.5">
                {territories.map((t) => (
                  <div key={t.id} className="solid flex items-center justify-between gap-3 rounded-xl px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-lum">{t.name}</p>
                      <p className="text-[11px] text-ink-mut">Current franchise: {t.franchiseName}</p>
                    </div>
                    <StatusChip value={t.status} />
                  </div>
                ))}
                {territories.length === 0 && <p className="text-sm text-ink-mut">No territories exist yet.</p>}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <PrototypeNote>Prototype configuration — no legal contract, settlement or payout system is connected.</PrototypeNote>
            <div>
              <p className="overline mb-2">Commercial configuration</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-4 border-b border-white/4 py-2">
                  <span className="overline">Revenue share</span>
                  <span className="flex items-center gap-2 text-sm text-ink-sec">
                    {share}% <Proto />
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4 border-b border-white/4 py-2">
                  <span className="overline">Cancellation model</span>
                  <span className="flex items-center gap-2 text-sm text-ink-sec">
                    Template-driven full refund <Proto />
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4 py-2">
                  <span className="overline">Settlement model</span>
                  <span className="flex items-center gap-2 text-sm text-ink-sec">
                    <Select
                      value={settlementModel}
                      onChange={(e) => setSettlementModel(e.target.value)}
                      className="w-44"
                      aria-label="Settlement model placeholder"
                    >
                      <option>Weekly settlement</option>
                      <option>Monthly settlement</option>
                      <option>Per-event settlement</option>
                    </Select>
                    <Proto />
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5">
            <Field label="Contact details" hint="Ops email or phone for the partnership.">
              <Input
                value={contactDetails}
                onChange={(e) => setContactDetails(e.target.value)}
                placeholder="e.g. ops@coastalsports.in"
              />
            </Field>
            <Field label="Notes">
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Context for the team…" />
            </Field>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-5">
            <div>
              <p className="overline mb-2">Assumptions</p>
              <div className="space-y-1">
                {assumptions.map((a) => (
                  <div key={a.label} className="flex items-start justify-between gap-4 border-b border-white/4 py-1.5">
                    <span className="overline shrink-0 pt-px">{a.label}</span>
                    <span className="min-w-0 text-right text-sm text-ink-sec">{a.value}</span>
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
            <PrototypeNote>Prototype configuration — no legal contract, settlement or payout system is connected.</PrototypeNote>
            <PrototypeRoleNote />
          </div>
        )}
      </WizardShell>
    </PageFrame>
  );
}
