"use client";

export function AIIntelligencePlaceholder({
  title,
  subtitle,
  metrics,
}: {
  title: string;
  subtitle?: string;
  metrics: { label: string; value: string; hint?: string }[];
}) {
  return (
    <div className="bg-slate-900/40 border border-slate-800/80 rounded-lg p-4 space-y-3 relative overflow-hidden">
      {/* Disclaimer Banner */}
      <div className="bg-purple-950/40 border border-purple-800/50 rounded px-2.5 py-1 text-[10px] font-mono text-purple-300 flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-bold">
          <span>🤖 AI Intelligence Scaffold</span>
        </span>
        <span className="italic text-purple-400/80">
          “Future intelligence preview — no prediction model connected.”
        </span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-xs font-bold font-mono text-slate-200">{title}</h4>
          {subtitle && <p className="text-[11px] font-mono text-slate-500">{subtitle}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono">
        {metrics.map((m, idx) => (
          <div key={idx} className="bg-slate-950/60 border border-slate-800/60 rounded p-2 text-xs">
            <div className="text-[10px] text-slate-500">{m.label}</div>
            <div className="text-sm font-bold text-slate-300">{m.value}</div>
            {m.hint && <div className="text-[9px] text-slate-600 mt-0.5">{m.hint}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
