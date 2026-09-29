"use client";

import type { OperationsAlert } from "@/lib/prototype/selectors/intelligence";

export function OperationsAlertsPanel({
  alerts,
  onAction,
}: {
  alerts: OperationsAlert[];
  onAction?: (alert: OperationsAlert) => void;
}) {
  if (alerts.length === 0) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-center text-xs font-mono text-slate-500">
        ✓ Operations Intelligence: No active operational alerts. All systems healthy.
      </div>
    );
  }

  const getSeverityBadge = (severity: OperationsAlert["severity"]) => {
    switch (severity) {
      case "critical":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-600 border border-red-200 uppercase animate-pulse">CRITICAL</span>;
      case "high":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200 uppercase">HIGH RISK</span>;
      case "medium":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-200 uppercase">MEDIUM</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 uppercase">INFO</span>;
    }
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-amber-600 font-mono flex items-center gap-1.5">
          <span>⚡ Operations Intelligence</span>
          <span className="bg-amber-100 text-amber-700 px-2 py-0.2 rounded-full text-[10px]">
            {alerts.length} Active
          </span>
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className="bg-slate-50 border border-slate-200 hover:border-slate-200 rounded-md p-3 space-y-2 text-xs font-mono"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="font-bold text-slate-800">{alert.title}</span>
              {getSeverityBadge(alert.severity)}
            </div>

            <div className="text-slate-500 space-y-1">
              <div><strong className="text-slate-500">Trigger:</strong> {alert.trigger}</div>
              <div><strong className="text-slate-500">Evidence:</strong> <span className="text-amber-300/90">{alert.evidence}</span></div>
              <div><strong className="text-slate-500">Impact:</strong> {alert.impact}</div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded p-2 text-slate-700 flex items-center justify-between gap-2 mt-2">
              <div><strong className="text-emerald-600">Action:</strong> {alert.recommendedAction}</div>
              {onAction && (
                <button
                  onClick={() => onAction(alert)}
                  className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded text-[10px] shrink-0"
                >
                  Resolve
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
