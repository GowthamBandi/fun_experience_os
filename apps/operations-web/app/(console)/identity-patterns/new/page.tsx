"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/primitives";

export default function NewIdentityPatternPage() {
  const router = useRouter();
  const { createIdentityPattern, role } = useStore();

  const [name, setName] = useState("");
  const [prefix, setPrefix] = useState("");
  const [separator, setSeparator] = useState("-");
  const [numberLength, setNumberLength] = useState<number>(2);
  const [aliasStyle, setAliasStyle] = useState("Standard");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const example = `${prefix.toUpperCase() || "CODE"}${separator}${String(1).padStart(numberLength, "0")}`;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!name.trim() || !prefix.trim()) {
      setErrorMsg("Pattern name and code prefix are required.");
      return;
    }

    const res = createIdentityPattern({
      name: name.trim(),
      prefix: prefix.trim(),
      separator,
      numberLength,
      aliasStyle,
    }, role.id);

    if (res.error) {
      setErrorMsg(res.error);
    } else {
      router.push("/identity-patterns");
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 md:px-8 space-y-6 font-mono text-xs">
      <PageHeader
        overline="Identity Configuration"
        title="Create Identity Pattern"
        sub="Define non-identifying temporary identity pattern rules and preview generated format."
        right={
          <Link href="/identity-patterns">
            <Button variant="ghost" className="h-8 px-3 text-xs font-mono">
              ← Cancel
            </Button>
          </Link>
        }
      />

      <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-lg p-6 space-y-6">
        <div className="space-y-4">
          <div>
            <label className="text-slate-400 block mb-1 font-bold uppercase">
              Pattern Name *:
            </label>
            <input
              type="text"
              placeholder="e.g. Cyber Padel League, Urban Cricket"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-slate-400 block mb-1 font-bold uppercase">
                Code Prefix *:
              </label>
              <input
                type="text"
                placeholder="e.g. CR, MX, NIGHT"
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200 font-bold"
                required
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1 font-bold uppercase">
                Separator:
              </label>
              <select
                value={separator}
                onChange={(e) => setSeparator(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200 font-bold"
              >
                <option value="-">Hyphen (-)</option>
                <option value="#">Hash (#)</option>
                <option value=".">Dot (.)</option>
                <option value="">None</option>
              </select>
            </div>

            <div>
              <label className="text-slate-400 block mb-1 font-bold uppercase">
                Number Digits:
              </label>
              <select
                value={numberLength}
                onChange={(e) => setNumberLength(parseInt(e.target.value, 10))}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200 font-bold"
              >
                <option value={2}>2 Digits (01 - 99)</option>
                <option value={3}>3 Digits (001 - 999)</option>
                <option value={4}>4 Digits (0001 - 9999)</option>
              </select>
            </div>
          </div>

          {/* Example Format Card */}
          <div className="bg-slate-950 border border-slate-800 p-4 rounded text-center space-y-1">
            <span className="text-[10px] text-slate-500 uppercase">Generated Code Preview:</span>
            <div className="text-2xl font-bold text-amber-400 font-mono tracking-widest">
              {example}
            </div>
          </div>
        </div>

        {errorMsg && <div className="bg-red-950 border border-red-800 text-red-300 p-3 rounded">{errorMsg}</div>}

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
          <Link href="/identity-patterns">
            <Button variant="ghost" className="h-9 px-4 text-xs font-mono">
              Cancel
            </Button>
          </Link>
          <Button type="submit" variant="lamp" className="h-9 px-6 text-xs font-mono font-bold">
            Create Identity Pattern
          </Button>
        </div>
      </form>
    </div>
  );
}
