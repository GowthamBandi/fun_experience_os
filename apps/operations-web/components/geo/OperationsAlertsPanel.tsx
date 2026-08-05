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
      <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 text-center text-xs font-mono text-slate-500">
        ✓ Operations Intelligence: No active operational alerts. All systems healthy.
      </div>
    );
  }

  const getSeverityBadge = (severity: OperationsAlert["severity"]) => {
    switch (severity) {
      case "critical":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-950 text-red-400 border border-red-800 uppercase animate-pulse">CRITICAL</span>;
      case "high":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-400 border border-amber-800 uppercase">HIGH RISK</span>;
      case "medium":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-950 text-blue-400 border border-blue-800 uppercase">MEDIUM</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700 uppercase">INFO</span>;
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-amber-400 font-mono flex items-center gap-1.5">
          <span>⚡ Operations Intelligence</span>
          <span className="bg-amber-500/20 text-amber-300 px-2 py-0.2 rounded-full text-[10px]">
            {alerts.length} Active
          </span>
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className="bg-slate-950 border border-slate-800/80 hover:border-slate-700 rounded-md p-3 space-y-2 text-xs font-mono"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="font-bold text-slate-200">{alert.title}</span>
              {getSeverityBadge(alert.severity)}
            </div>

            <div className="text-slate-400 space-y-1">
              <div><strong className="text-slate-500">Trigger:</strong> {alert.trigger}</div>
              <div><strong className="text-slate-500">Evidence:</strong> <span className="text-amber-300/90">{alert.evidence}</span></div>
              <div><strong className="text-slate-500">Impact:</strong> {alert.impact}</div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded p-2 text-slate-300 flex items-center justify-between gap-2 mt-2">
              <div><strong className="text-emerald-400">Action:</strong> {alert.recommendedAction}</div>
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
