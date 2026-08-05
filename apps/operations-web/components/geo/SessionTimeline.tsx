"use client";

import type { SessionStatus } from "@/lib/prototype/entities";

const STEPS: { status: string; label: string }[] = [
  { status: "draft", label: "Draft" },
  { status: "published", label: "Published" },
  { status: "booking-open", label: "Bookings Open" },
  { status: "almost-full", label: "Almost Full" },
  { status: "full", label: "FULL" },
  { status: "waitlist-active", label: "Waitlist Active" },
  { status: "revealed", label: "Reveal" },
  { status: "check-in-open", label: "Check-in" },
  { status: "live", label: "LIVE" },
  { status: "completed", label: "Completed" },
];

export function SessionTimeline({
  status,
  fillRate = 0,
  waitlistCount = 0,
}: {
  status: SessionStatus;
  fillRate?: number;
  waitlistCount?: number;
}) {
  const getActiveStepIndex = () => {
    switch (status) {
      case "draft":
        return 0;
      case "scheduled":
      case "published":
        return 1;
      case "booking-open":
        return 2;
      case "almost-full":
        return 3;
      case "full":
        return waitlistCount > 0 ? 5 : 4;
      case "revealed":
        return 6;
      case "check-in-open":
        return 7;
      case "live":
        return 8;
      case "completed":
      case "archived":
      case "cancelled":
        return 9;
      default:
        return 2;
    }
  };

  const activeIndex = getActiveStepIndex();

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between text-xs font-mono text-slate-400">
        <span className="font-bold uppercase tracking-wider text-slate-300">Operational Session Lifecycle</span>
        <span>Fill Rate: <strong className="text-emerald-400">{fillRate}%</strong> {waitlistCount > 0 && `| Waitlist: ${waitlistCount}`}</span>
      </div>

      <div className="relative flex items-center justify-between">
        {/* Connector Line */}
        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-slate-800 -translate-y-1/2 z-0" />
        <div
          className="absolute top-1/2 left-0 h-0.5 bg-emerald-500 -translate-y-1/2 transition-all duration-500 z-0"
          style={{ width: `${(activeIndex / (STEPS.length - 1)) * 100}%` }}
        />

        {/* Steps */}
        {STEPS.map((step, idx) => {
          const isDone = idx < activeIndex;
          const isCurrent = idx === activeIndex;

          return (
            <div key={step.status} className="relative z-10 flex flex-col items-center group">
              <div
                className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold font-mono transition-all ${
                  isCurrent
                    ? "bg-emerald-500 text-slate-950 ring-4 ring-emerald-500/20 scale-125"
                    : isDone
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-800 text-slate-500 border border-slate-700"
                }`}
              >
                {isDone ? "✓" : idx + 1}
              </div>
              <span
                className={`text-[10px] font-mono mt-1 transition-colors whitespace-nowrap hidden sm:inline-block ${
                  isCurrent
                    ? "text-emerald-400 font-bold"
                    : isDone
                    ? "text-slate-300"
                    : "text-slate-600"
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
