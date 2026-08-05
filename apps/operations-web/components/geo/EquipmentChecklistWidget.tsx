"use client";

import type { EquipmentCheckItem } from "@/lib/prototype/entities";

export function EquipmentChecklistWidget({
  items,
  onUpdateStatus,
  isReadOnly = false,
}: {
  items: EquipmentCheckItem[];
  onUpdateStatus: (equipmentId: string, updates: Partial<EquipmentCheckItem>) => void;
  isReadOnly?: boolean;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 font-mono text-xs space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <span className="font-bold text-slate-200 uppercase tracking-wider text-xs flex items-center gap-2">
          <span>🏏 Equipment Operations Checklist</span>
        </span>
        <span className="text-[10px] text-slate-500">
          Derived Counts & Statuses
        </span>
      </div>

      <div className="space-y-2">
        {items.map((eq) => {
          const isCriticalMissing = eq.isCritical && eq.missingCount > 0;

          return (
            <div
              key={eq.id}
              className={`p-3 rounded-lg border flex flex-wrap items-center justify-between gap-3 ${
                isCriticalMissing
                  ? "bg-red-950/70 border-red-800 text-red-200"
                  : "bg-slate-950 border-slate-800 text-slate-200"
              }`}
            >
              <div>
                <div className="font-bold text-sm flex items-center gap-2">
                  <span>{eq.equipmentName}</span>
                  {eq.isCritical && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-red-950 text-red-400 border border-red-800 font-bold">
                      CRITICAL
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 font-mono">
                  Req: {eq.requiredCount} | Avail: {eq.availableCount} | Issued: {eq.issuedCount} | Returned: {eq.returnedCount} | Missing: {eq.missingCount}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    eq.status === "returned"
                      ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                      : eq.status === "missing" || eq.missingCount > 0
                      ? "bg-red-950 text-red-400 border border-red-800 animate-pulse"
                      : "bg-amber-950 text-amber-300 border border-amber-800"
                  }`}
                >
                  {eq.status.toUpperCase()}
                </span>

                {!isReadOnly && (
                  <div className="flex items-center gap-1">
                    {eq.missingCount === 0 ? (
                      <button
                        onClick={() =>
                          onUpdateStatus(eq.id, {
                            missingCount: 1,
                            status: "missing",
                          })
                        }
                        className="px-2 py-1 bg-red-950 hover:bg-red-900 text-red-300 border border-red-800 rounded text-[10px]"
                      >
                        Mark Missing
                      </button>
                    ) : (
                      <button
                        onClick={() =>
                          onUpdateStatus(eq.id, {
                            missingCount: 0,
                            returnedCount: eq.issuedCount,
                            status: "returned",
                          })
                        }
                        className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded text-[10px]"
                      >
                        Clear Missing
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
