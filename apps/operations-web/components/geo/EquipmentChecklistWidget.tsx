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
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 font-mono text-xs space-y-4">
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <span className="font-bold text-slate-800 uppercase tracking-wider text-xs flex items-center gap-2">
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
                  ? "bg-red-200 border-red-200 text-red-700"
                  : "bg-slate-50 border-slate-200 text-slate-800"
              }`}
            >
              <div>
                <div className="font-bold text-sm flex items-center gap-2">
                  <span>{eq.equipmentName}</span>
                  {eq.isCritical && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-red-50 text-red-600 border border-red-200 font-bold">
                      CRITICAL
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 font-mono">
                  Req: {eq.requiredCount} | Avail: {eq.availableCount} | Issued: {eq.issuedCount} | Returned: {eq.returnedCount} | Missing: {eq.missingCount}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    eq.status === "returned"
                      ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                      : eq.status === "missing" || eq.missingCount > 0
                      ? "bg-red-50 text-red-600 border border-red-200 animate-pulse"
                      : "bg-amber-50 text-amber-700 border border-amber-200"
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
                        className="px-2 py-1 bg-red-50 hover:bg-red-50 text-red-700 border border-red-200 rounded text-[10px]"
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
