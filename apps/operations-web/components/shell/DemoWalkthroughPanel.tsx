"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { SCENARIOS } from "@/lib/prototype/scenarios";
import { Play, RotateCcw, AlertTriangle, ChevronUp, ChevronDown, Check, MapPin } from "lucide-react";
import { cn } from "@/lib/format";

const REVIEWED_KEY = "xos.prototype.walkthrough_reviewed";

interface WalkthroughStep {
  label: string;
  milestone: string;
  route: string;
  desc: string;
}

const STEPS: WalkthroughStep[] = [
  { label: "Create Franchise", milestone: "Setup", route: "/franchises/new", desc: "Set up the legal entity and assign head operators." },
  { label: "Create Territory", milestone: "Setup", route: "/territories/new", desc: "Establish regional scope and assign to the franchise." },
  { label: "Create City", milestone: "Setup", route: "/territories/hvd-central/cities/new", desc: "Add a city manager and supported categories under the territory." },
  { label: "Create Venue", milestone: "Setup", route: "/locations/venues/new", desc: "Configure address, hours, capabilities and safety constraints." },
  { label: "Add Playing Area", milestone: "Setup", route: "/locations/venues/v-1", desc: "Define courts or tables inside the venue." },
  { label: "Create Category", milestone: "Catalog", route: "/catalog/categories/new", desc: "Set default staffing levels, risk index, and category info." },
  { label: "Create Template", milestone: "Catalog", route: "/catalog/experiences/new", desc: "Build an experience template format, duration, pricing and reveal keys." },
  { label: "Review Catalog Health", milestone: "Catalog", route: "/catalog", desc: "Overview of category/template status, readiness warnings and shelf rules." },
  { label: "Inspect Draft Readiness", milestone: "Catalog", route: "/catalog/experiences", desc: "A draft template is not schedulable until it is activated." },
  { label: "Activate Template", milestone: "Catalog", route: "/catalog/experiences/et-7", desc: "Activate the draft to move it onto the schedulable shelf." },
  { label: "Verify Schedulable", milestone: "Catalog", route: "/catalog/experiences", desc: "Confirm the activated template flips to schedulable." },
  { label: "Customer Preview", milestone: "Catalog", route: "/catalog/experiences/et-1/preview", desc: "See the participant-facing listing and pre/post reveal privacy." },
  { label: "Version History", milestone: "Catalog", route: "/catalog/experiences/et-1/versions", desc: "Review who changed what and restore any version as a draft." },
  { label: "Pause Template", milestone: "Catalog", route: "/catalog/experiences/et-8", desc: "Shelve a live format without deleting it." },
  { label: "Resume Template", milestone: "Catalog", route: "/catalog/experiences/et-8", desc: "Bring a paused template back to the shelf." },
  { label: "Duplicate Template", milestone: "Catalog", route: "/catalog/experiences/et-3", desc: "Fork a proven format as a new draft." },
  { label: "Category Compatibility", milestone: "Catalog", route: "/catalog/categories", desc: "Inspect category-venue compatibility coverage per territory." },
  { label: "Category Shelving", milestone: "Catalog", route: "/catalog/categories/cat-cricket", desc: "Pause and restore an activity family; blocking signals protect dependents." },
  { label: "Schedule Session", milestone: "Scheduling", route: "/missions/new", desc: "Book a specific venue, slot time, and assign coordinators." },
  { label: "Publish Session", milestone: "Scheduling", route: "/missions", desc: "Publish the drafted scheduled session to the bookings catalog." },
  { label: "Simulate Bookings", milestone: "Bookings", route: "/missions", desc: "Add mock bookings, payments, and admin override slots." },
  { label: "Trigger Waitlist", milestone: "Bookings", route: "/missions", desc: "Exceed target capacity to trigger waitlist promotions." },
  { label: "Generate Temp IDs", milestone: "Teams & Reveal", route: "/missions", desc: "Generate masked participant identifiers (e.g. CR-07)." },
  { label: "Allocate Teams", milestone: "Teams & Reveal", route: "/missions", desc: "Run the animated random team separator." },
  { label: "Trigger Reveal", milestone: "Teams & Reveal", route: "/missions", desc: "Unlock reveal conditions and verify checklist." },
  { label: "Check In", milestone: "Live", route: "/bookings", desc: "Perform QR check-in simulation on the expected roster." },
  { label: "Start Live Session", milestone: "Live", route: "/missions", desc: "Activate live clock, matches, and safety alerts." },
  { label: "Review Money & Analytics", milestone: "Review", route: "/money", desc: "Review tonight's take, bookings, fill and revenue trends." },
  { label: "Role-Scoped Catalog", milestone: "Review", route: "/catalog/experiences", desc: "Switch to a territory role to see scoped template visibility." }
];

function readReviewed(): number[] {
  try {
    const raw = window.localStorage.getItem(REVIEWED_KEY);
    return raw ? (JSON.parse(raw) as number[]) : [];
  } catch {
    return [];
  }
}

export function DemoWalkthroughPanel() {
  const { demoStep, setDemoStep, resetDemoData, loadScenario } = useStore();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [reviewed, setReviewed] = useState<number[]>([]);

  useEffect(() => {
    setReviewed(readReviewed());
  }, [open]);

  const persistReviewed = useCallback((next: number[]) => {
    setReviewed(next);
    try {
      window.localStorage.setItem(REVIEWED_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const current = STEPS[demoStep] || STEPS[0];
  const isReviewed = reviewed.includes(demoStep);

  const handleNext = () => {
    if (demoStep < STEPS.length - 1) {
      const nextIdx = demoStep + 1;
      setDemoStep(nextIdx);
      router.push(STEPS[nextIdx].route);
    } else {
      setDemoStep(0);
      router.push(STEPS[0].route);
    }
  };

  const handlePrev = () => {
    if (demoStep > 0) {
      const prevIdx = demoStep - 1;
      setDemoStep(prevIdx);
      router.push(STEPS[prevIdx].route);
    }
  };

  const handleMarkReviewed = () => {
    const next = isReviewed ? reviewed.filter((s) => s !== demoStep) : [...reviewed, demoStep];
    persistReviewed(next);
  };

  const handleReset = () => {
    persistReviewed([]);
    resetDemoData();
    router.push("/");
  };

  const jumpToStep = (idx: number) => {
    setDemoStep(idx);
    router.push(STEPS[idx].route);
  };

  const selectScenario = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const sc = e.target.value;
    if (sc) {
      loadScenario(sc);
      e.target.value = "";
    }
  };

  const doneCount = reviewed.length;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end">
      {/* Trigger Toggle */}
      <button
        data-testid="demo-open"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-full border border-white/10 bg-brand/90 px-4 py-2.5 text-xs font-semibold text-white shadow-lg backdrop-blur-md transition-all hover:bg-brand"
      >
        <span>Demo Controller</span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
      </button>

      {/* Main Panel */}
      {open && (
        <div className="glass mt-2 w-80 rounded-panel p-4 shadow-[0_32px_64px_rgba(0,0,0,0.5)] border border-white/10 text-left">
          <div className="flex items-center justify-between border-b border-white/5 pb-2">
            <span className="overline text-[10px] text-ink-lum">Operational Walkthrough · {doneCount}/{STEPS.length} reviewed</span>
            <button
              onClick={handleReset}
              data-testid="reset-demo"
              title="Return to seeded state"
              className="flex items-center gap-1 rounded bg-white/5 px-2 py-1 text-[10px] font-medium text-ink-sec transition hover:bg-white/10"
            >
              <RotateCcw className="h-3 w-3" /> Reset demo
            </button>
          </div>

          {/* Current Step Progress */}
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-ink-lum">
                Step {demoStep + 1} of {STEPS.length}
              </span>
              <span className="flex items-center gap-1 rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-brand">
                <MapPin className="h-3 w-3" /> {current.milestone}
              </span>
            </div>
            <p className="mt-1.5 text-xs font-medium text-ink-lum">{current.label}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-ink-sec">{current.desc}</p>
          </div>

          {/* Navigation Actions */}
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => router.push(current.route)}
              className="flex-1 rounded-lg bg-white/10 py-2 text-center text-xs font-semibold text-ink-lum hover:bg-white/15"
            >
              Open route
            </button>
            <button
              onClick={handleMarkReviewed}
              data-testid="mark-reviewed"
              className={cn(
                "flex items-center justify-center gap-1 rounded-lg px-3 text-center text-xs font-semibold transition",
                isReviewed ? "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25" : "bg-white/5 text-ink-sec hover:bg-white/10"
              )}
            >
              <Check className="h-3.5 w-3.5" /> {isReviewed ? "Reviewed" : "Mark reviewed"}
            </button>
            <button
              onClick={handleNext}
              data-testid="demo-next"
              className="flex items-center justify-center gap-1 rounded-lg bg-brand px-3 text-center text-xs font-semibold text-white hover:bg-brand-hover"
            >
              Next <Play className="h-3 w-3 fill-current" />
            </button>
          </div>

          <div className="mt-3 flex gap-2">
            <button
              onClick={handlePrev}
              disabled={demoStep === 0}
              className="flex-1 rounded-lg bg-white/5 py-1.5 text-center text-[11px] font-medium text-ink-sec transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ← Back
            </button>
            <button
              onClick={() => setShowSteps(!showSteps)}
              data-testid="show-steps"
              className="flex-1 rounded-lg bg-white/5 py-1.5 text-center text-[11px] font-medium text-ink-sec transition hover:bg-white/10"
            >
              {showSteps ? "Hide steps" : "Show all steps"}
            </button>
          </div>

          {/* Step List */}
          {showSteps && (
            <div className="mt-3 max-h-56 space-y-1 overflow-y-auto border-t border-white/5 pt-2">
              {STEPS.map((s, i) => (
                <button
                  key={s.label}
                  onClick={() => jumpToStep(i)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[11px] transition",
                    i === demoStep ? "bg-brand/15 text-ink-lum" : "text-ink-sec hover:bg-white/5"
                  )}
                >
                  <span className="w-4 shrink-0 text-center">
                    {reviewed.includes(i) ? <Check className="inline h-3 w-3 text-emerald-300" /> : i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{s.label}</span>
                  <span className="shrink-0 text-[9px] uppercase tracking-wider text-ink-mut">{s.milestone}</span>
                </button>
              ))}
            </div>
          )}

          {/* Scenario Picker */}
          <div className="mt-4 border-t border-white/5 pt-3">
            <label className="overline block text-[9px] text-ink-mut mb-1.5">Load state scenario</label>
            <select
              onChange={selectScenario}
              data-testid="scenario-select"
              className="field w-full rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-ink-lum outline-none"
            >
              <option value="" className="bg-[#12141a]">Select scenario…</option>
              {SCENARIOS.map((sc) => (
                <option key={sc.name} value={sc.name} className="bg-[#12141a]">
                  {sc.name} — {sc.blurb}
                </option>
              ))}
            </select>
          </div>

          {/* Simulated Disclaimer */}
          <div className="mt-3 flex items-start gap-1.5 rounded-lg bg-warning/5 border border-warning/10 p-2 text-[10px] text-ink-mut">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
            <span>Prototype state is stored in localStorage. Click reset demo to return to the seeded state.</span>
          </div>
        </div>
      )}
    </div>
  );
}
