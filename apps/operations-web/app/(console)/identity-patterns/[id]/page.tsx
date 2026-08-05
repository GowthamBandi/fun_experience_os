"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusChip, Button } from "@/components/ui/primitives";

export default function IdentityPatternDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { state } = useStore();

  const pattern = useMemo(
    () => (state.identityPatterns ?? []).find((p) => p.id === id),
    [state, id]
  );

  const [sampleCount, setSampleCount] = useState(5);

  if (!pattern) {
    return (
      <div className="mx-auto max-w-4xl p-8 font-mono text-xs text-slate-400 space-y-4">
        <div>❌ Identity Pattern <strong className="text-slate-200">{id}</strong> not found.</div>
        <Link href="/identity-patterns" className="text-emerald-400 hover:underline">
          ← Return to Identity Pattern Catalog
        </Link>
      </div>
    );
  }

  const generatedSamples = Array.from({ length: sampleCount }, (_, idx) => {
    const num = String(idx + 1).padStart(pattern.numberLength, "0");
    return `${pattern.prefix}${pattern.separator}${num}`;
  });

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 md:px-8 space-y-6 font-mono text-xs">
      <PageHeader
        overline={`Identity Configuration · ${pattern.id}`}
        title={`Pattern: ${pattern.name}`}
        sub={`Prefix: '${pattern.prefix}' · Separator: '${pattern.separator}' · Length: ${pattern.numberLength} digits`}
        right={
          <div className="flex items-center gap-2">
            <StatusChip value={pattern.status} />
            <Link href="/identity-patterns">
              <Button variant="ghost" className="h-8 px-3 text-xs font-mono">
                ← Back
              </Button>
            </Link>
          </div>
        }
      />

      <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 space-y-4">
        <h3 className="font-bold text-slate-200 uppercase tracking-wider text-xs border-b border-slate-800 pb-2">
          Test Bench: Simulated Sequence Generator
        </h3>

        <div className="flex items-center gap-4">
          <span className="text-slate-400">Generate Sample Count:</span>
          <select
            value={sampleCount}
            onChange={(e) => setSampleCount(parseInt(e.target.value, 10))}
            className="bg-slate-950 border border-slate-700 rounded px-3 py-1 text-slate-200 font-bold"
          >
            <option value={5}>5 Codes</option>
            <option value={10}>10 Codes</option>
            <option value={20}>20 Codes</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          {generatedSamples.map((code, idx) => (
            <div key={idx} className="bg-slate-950 border border-slate-800 px-3 py-1.5 rounded font-bold font-mono text-amber-400 text-sm">
              {code}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
