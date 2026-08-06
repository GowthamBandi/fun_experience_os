"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, PanelHeader, PermissionDenied } from "@/components/ui/panels";
import { Button } from "@/components/ui/primitives";
import { Field, Input, Select } from "@/components/ui/fields";
import { Tide } from "@/components/motion/Motion";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import Link from "next/link";

const STEPS = [
  { label: "Basic Info", sub: "Name, code and template" },
  { label: "Location & Setup", sub: "Venue and seeding" },
  { label: "Rules & Schedule", sub: "Durations and times" },
  { label: "Review & Create", sub: "Verify details" }
];

export default function NewTournamentPage() {
  const router = useRouter();
  const { state, territory, canAccess, hydrated, createTournament } = useStore();

  const [step, setStep] = useState(0);

  // Form State
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [venueId, setVenueId] = useState("");
  const [format, setFormat] = useState("single-elimination");
  const [seedingMethod, setSeedingMethod] = useState("random");
  const [matchDuration, setMatchDuration] = useState("30");
  const [breakDuration, setBreakDuration] = useState("10");
  const [scheduledStart, setScheduledStart] = useState("Today, 18:00");
  const [registrationClosesAt, setRegistrationClosesAt] = useState("Today, 17:00");
  const [prizePlaceholder, setPrizePlaceholder] = useState("");
  const [verificationRequirement, setVerificationRequirement] = useState("referee");

  if (!hydrated) return <div className="p-8 text-center"><Tide /></div>;
  if (!canAccess("/tournaments")) return <div className="p-8 text-center"><PermissionDenied module="Tournaments" /></div>;

  const templates = state.templates ?? [];
  const venues = state.venues.filter((v) => v.territoryId === territory.id);

  const handleCreate = () => {
    createTournament({
      name,
      code,
      experienceTemplateId: templateId || undefined,
      territoryId: territory.id,
      venueId: venueId || venues[0]?.id || "",
      format,
      matchDuration: parseInt(matchDuration, 10) || 30,
      breakDuration: parseInt(breakDuration, 10) || 10,
      seedingMethod,
      verificationRequirement,
      prizePlaceholder,
      scheduledStart,
      registrationClosesAt
    });

    router.push("/tournaments");
  };

  const next = () => {
    if (step < 3) setStep(step + 1);
  };

  const back = () => {
    if (step > 0) setStep(step - 1);
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-8">
      <div className="flex items-center justify-between">
        <PageHeader
          overline={`New Tournament · ${territory.name}`}
          title="Create Tournament"
          sub="Initialize a new knockout tournament bracket."
        />
        <Link href="/tournaments">
          <IconButton label="Cancel">
            <X className="h-4 w-4" />
          </IconButton>
        </Link>
      </div>

      {/* Progress Spine */}
      <div className="mt-8 grid grid-cols-4 gap-2">
        {STEPS.map((s, idx) => (
          <div key={s.label} className="space-y-2">
            <div
              className={`h-1.5 rounded-full transition-all duration-300 ${
                idx <= step ? "bg-brand" : "bg-white/10"
              }`}
            />
            <span className={`block text-[10px] font-semibold ${idx === step ? "text-ink-lum" : "text-ink-mut"}`}>
              {s.label}
            </span>
          </div>
        ))}
      </div>

      <Card className="mt-6 p-6">
        {step === 0 && (
          <div className="space-y-4">
            <PanelHeader title="Basic Information" sub="Identify your tournament" />
            <Field label="Tournament Name" hint="e.g. Monsoon Table Tennis Open">
              <Input
                placeholder="Enter tournament title"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!code && e.target.value) {
                    setCode(e.target.value.substring(0, 3).toUpperCase() + "-" + Math.floor(100 + Math.random() * 900));
                  }
                }}
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Short Code / ID" hint="Unique bracket code">
                <Input placeholder="e.g. MTT-2026" value={code} onChange={(e) => setCode(e.target.value)} />
              </Field>

              <Field label="Prize Placeholder" hint="Rewards description">
                <Input placeholder="e.g. Gold medals + ₹2,000 voucher" value={prizePlaceholder} onChange={(e) => setPrizePlaceholder(e.target.value)} />
              </Field>
            </div>

            <Field label="Linked Experience Template" hint="Optional template defaults">
              <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                <option value="">Select a template...</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.id})
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <PanelHeader title="Location & Format" sub="Where and how the tournament runs" />
            <Field label="Target Venue" hint="Must belong to Hyderabad Central">
              <Select value={venueId} onChange={(e) => setVenueId(e.target.value)}>
                <option value="">Select a venue...</option>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Bracket Format">
                <Select value={format} onChange={(e) => setFormat(e.target.value)}>
                  <option value="single-elimination">Single Elimination</option>
                  <option value="round-robin">Round Robin</option>
                </Select>
              </Field>

              <Field label="Seeding Method">
                <Select value={seedingMethod} onChange={(e) => setSeedingMethod(e.target.value)}>
                  <option value="random">Random Seeding</option>
                  <option value="seeded">Seeded Bracket Placement</option>
                </Select>
              </Field>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <PanelHeader title="Rules & Schedule" sub="Timings and match configurations" />
            <div className="grid grid-cols-2 gap-4">
              <Field label="Match Duration (mins)">
                <Input type="number" value={matchDuration} onChange={(e) => setMatchDuration(e.target.value)} />
              </Field>
              <Field label="Break Duration (mins)">
                <Input type="number" value={breakDuration} onChange={(e) => setBreakDuration(e.target.value)} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Registration Closes At">
                <Input value={registrationClosesAt} onChange={(e) => setRegistrationClosesAt(e.target.value)} />
              </Field>
              <Field label="Scheduled Start Time">
                <Input value={scheduledStart} onChange={(e) => setScheduledStart(e.target.value)} />
              </Field>
            </div>

            <Field label="Verification Requirement">
              <Select value={verificationRequirement} onChange={(e) => setVerificationRequirement(e.target.value)}>
                <option value="referee">Single Referee Submission</option>
                <option value="dual">Dual Sign-off (Referee + Lead Coordinator)</option>
                <option value="self">Self-reported by participants</option>
              </Select>
            </Field>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <PanelHeader title="Review Details" sub="Ensure everything is correct" />
            <div className="solid rounded-xl p-4 space-y-3 text-sm">
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-ink-mut">Name:</span>
                <span className="font-semibold text-ink-lum">{name || "—"}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-ink-mut">Code:</span>
                <span className="font-semibold text-ink-lum">{code || "—"}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-ink-mut">Format:</span>
                <span className="text-ink-sec">{format}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-ink-mut">Venue:</span>
                <span className="text-ink-sec">{venues.find((v) => v.id === venueId)?.name || "Select venue..."}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-ink-mut">Match duration:</span>
                <span className="text-ink-sec">{matchDuration} mins</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-ink-mut">Start time:</span>
                <span className="text-ink-sec">{scheduledStart}</span>
              </div>
            </div>
          </div>
        )}

        <div className="mt-8 flex justify-between gap-4 border-t border-white/5 pt-4">
          <Button variant="secondary" onClick={back} disabled={step === 0} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>

          {step < 3 ? (
            <Button onClick={next} disabled={!name} className="gap-1.5">
              Continue
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleCreate} disabled={!name} className="bg-brand hover:bg-brand-hover shadow-lift">
              Create Tournament
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

function IconButton({
  label,
  children,
  ...rest
}: {
  label: string;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className="inline-flex h-10 w-10 items-center justify-center rounded-xl glass hover:bg-white/5 border border-white/5 text-ink-sec hover:text-ink-lum transition-all duration-200"
      title={label}
      {...rest}
    >
      {children}
    </button>
  );
}
