"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/ui/PageHeader";
import { StaffBackNavigation } from "@/components/staff";
import { Button } from "@/components/ui/primitives";
import { CheckCircle2, UserPlus, ArrowRight, UserCheck } from "lucide-react";
import type { RoleId } from "@/lib/types";

export default function AddStaffPage() {
  const router = useRouter();
  const { state, territory, createCrewMember } = useStore();

  const territories = state.territories ?? [];
  const venues = state.venues ?? [];

  const [step, setStep] = useState(1);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    role: "staff" as RoleId,
    status: "available" as "available" | "assigned" | "off",
    phone: "+91 98765 43210",
    email: "",
    emergencyContact: "+91 99000 11223",
    skills: ["Check-in Operations"],
    territoryId: (territory.id || territories[0]?.id || "hvd-central") as any,
    venueId: venues[0]?.id || "v-1",
    flexibleAcrossVenues: true,
  });

  const handleAdd = () => {
    const newId = `c-${Date.now()}`;
    createCrewMember({
      id: newId,
      name: formData.name.trim() || "Rahul Kumar",
      role: formData.role,
      status: formData.status,
      territoryId: formData.territoryId as any,
      venueId: formData.venueId,
      assignment: "General Floor Support",
    });

    setCreatedId(newId);
    setStep(6);
  };

  if (step === 6) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6">
        <StaffBackNavigation label="Back to Staff" href="/people/staff" />

        <div className="glass p-8 rounded-2xl border border-emerald-800/40 bg-emerald-950/20 text-center space-y-6 max-w-xl mx-auto my-8">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-ink-lum">Staff Member Added</h2>
            <p className="text-xs text-ink-sec max-w-md mx-auto">
              You have successfully added &quot;{formData.name || "Rahul Kumar"}&quot; to your staff roster.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-black/40 border border-white/5 text-left text-xs space-y-1">
            <p className="text-ink-mut">Name: <strong className="text-ink-lum">{formData.name || "Rahul Kumar"}</strong></p>
            <p className="text-ink-mut">Role: <span className="text-purple-300 font-bold capitalize">{formData.role}</span></p>
            <p className="text-ink-mut">Primary Venue: <span className="text-ink-sec">{venues.find((v) => v.id === formData.venueId)?.name || "Venue"}</span></p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Button
              variant="primary"
              className="w-full sm:w-auto font-bold px-6"
              onClick={() => router.push("/staffing/assign")}
            >
              <UserCheck className="w-4 h-4 mr-1" />
              Assign to an Event
            </Button>
            <Button
              variant="secondary"
              className="w-full sm:w-auto text-xs"
              onClick={() => router.push(`/people/staff/${createdId}`)}
            >
              View Profile
            </Button>
            <Button
              variant="ghost"
              className="w-full sm:w-auto text-xs"
              onClick={() => router.push("/people/staff")}
            >
              Back to Staff
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6">
      <StaffBackNavigation label="Back to Staff" href="/people/staff" />

      <PageHeader
        overline="People · Staff Roster"
        title="Add Staff Member"
        sub="Add someone who will help run events. Who is joining your operations team?"
      />

      <div className="space-y-6 max-w-3xl mx-auto">
        {/* Step Indicator */}
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          {[
            { num: 1, label: "1. Basics" },
            { num: 2, label: "2. Contact" },
            { num: 3, label: "3. Role & Skills" },
            { num: 4, label: "4. Working Area" },
            { num: 5, label: "5. Review" },
          ].map((s) => (
            <button
              key={s.num}
              type="button"
              onClick={() => setStep(s.num)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                step === s.num
                  ? "bg-brand text-slate-950"
                  : step > s.num
                  ? "bg-white/10 text-ink-lum"
                  : "text-ink-mut hover:text-ink-sec"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="glass p-6 rounded-2xl border border-white/5 space-y-6">
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-ink-lum">Step 1: Basic Information</h3>

              <div className="space-y-2">
                <label className="text-xs font-medium text-ink-sec">Full Display Name</label>
                <input
                  type="text"
                  placeholder="e.g. Rahul Kumar"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum placeholder:text-ink-mut"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-ink-sec">Initial Availability Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum"
                >
                  <option value="available">Available (Ready for assignment)</option>
                  <option value="assigned">Assigned to Event</option>
                  <option value="off">Off Duty / On Leave</option>
                </select>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-ink-lum">Step 2: Contact Details</h3>

              <div className="space-y-2">
                <label className="text-xs font-medium text-ink-sec">Phone Number</label>
                <input
                  type="text"
                  placeholder="+91 98765 43210"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum font-mono"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-ink-sec">Emergency Contact</label>
                <input
                  type="text"
                  placeholder="Emergency Contact Phone"
                  value={formData.emergencyContact}
                  onChange={(e) => setFormData({ ...formData, emergencyContact: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum font-mono"
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-ink-lum">Step 3: Primary Role & Skills</h3>

              <div className="space-y-2">
                <label className="text-xs font-medium text-ink-sec">Primary Role</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                  className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum font-bold text-purple-300"
                >
                  <option value="coordinator">Lead Coordinator (Manages full event flow)</option>
                  <option value="safety">Safety Officer (First Aid & Escalations)</option>
                  <option value="venue-manager">Venue Manager (Building & Facilities)</option>
                  <option value="staff">Event Staff / Host (Check-in & Support)</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-ink-sec">Operational Skills & Training</label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <label className="flex items-center gap-2 p-2.5 rounded-lg bg-black/30 border border-white/5 cursor-pointer">
                    <input type="checkbox" defaultChecked className="rounded text-brand" />
                    <span>Check-in Trained</span>
                  </label>
                  <label className="flex items-center gap-2 p-2.5 rounded-lg bg-black/30 border border-white/5 cursor-pointer">
                    <input type="checkbox" defaultChecked={formData.role === "safety"} className="rounded text-brand" />
                    <span>Safety Certified</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-ink-lum">Step 4: Working Area & Venue Scope</h3>

              <div className="space-y-2">
                <label className="text-xs font-medium text-ink-sec">Territory Scope</label>
                <select
                  value={formData.territoryId}
                  onChange={(e) => setFormData({ ...formData, territoryId: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum"
                >
                  {territories.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.region || "Region"})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-ink-sec">Primary Venue</label>
                <select
                  value={formData.venueId}
                  onChange={(e) => setFormData({ ...formData, venueId: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum"
                >
                  {venues.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.type})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-ink-lum">Step 5: Review Details</h3>

              <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-2 text-xs">
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-ink-mut">Name:</span>
                  <span className="font-bold text-ink-lum">{formData.name || "Rahul Kumar"}</span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-ink-mut">Role:</span>
                  <span className="text-purple-300 font-bold capitalize">{formData.role}</span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-ink-mut">Primary Venue:</span>
                  <span className="text-ink-sec">{venues.find((v) => v.id === formData.venueId)?.name || "Venue"}</span>
                </div>
              </div>
            </div>
          )}

          {/* Wizard Buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-white/5">
            <Button
              variant="ghost"
              onClick={() => (step > 1 ? setStep(step - 1) : router.push("/people/staff"))}
              className="text-xs"
            >
              {step > 1 ? "Previous" : "Cancel"}
            </Button>

            {step < 5 ? (
              <Button variant="primary" onClick={() => setStep(step + 1)} className="font-bold text-xs">
                Next Step <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            ) : (
              <Button variant="primary" onClick={handleAdd} className="font-bold text-xs bg-emerald-500 text-slate-950">
                Add Staff Member
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
