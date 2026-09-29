"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, ShieldCheck } from "lucide-react";
import { useStore } from "@/lib/store";
import { formatIdentityCode } from "@/lib/prototype/selectors/identity";
import { IDENTITY_SEPARATORS, patternCapacity, validatePatternSafety } from "@/lib/prototype/validators/identityValidation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/primitives";
import { PermissionDenied } from "@/components/ui/panels";
import { Field, Input, Select } from "@/components/ui/fields";
import { useToast } from "@/components/ui/toast";

const SEPARATOR_LABEL: Record<string, string> = { "-": "Hyphen (CR-07)", "#": "Hash (CR#07)", ".": "Dot (CR.07)", "": "None (CR07)" };

export default function NewIdentityPatternPage() {
  const router = useRouter();
  const toast = useToast();
  const { state, canAccess, createIdentityPattern } = useStore();

  const [name, setName] = useState("");
  const [prefix, setPrefix] = useState("");
  const [separator, setSeparator] = useState("-");
  const [numberLength, setNumberLength] = useState(2);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const upper = prefix.trim().toUpperCase();
  const safety = validatePatternSafety({ prefix: upper, separator, numberLength });
  const clash = useMemo(
    () => (state.identityPatterns ?? []).find((p) => p.status !== "deprecated" && p.prefix.toUpperCase() === upper && p.separator === separator),
    [state.identityPatterns, upper, separator],
  );
  const samples = [1, 2, 3, 12].map((n) => formatIdentityCode({ prefix: upper || "AB", separator, numberLength }, n));

  if (!canAccess("/identity-patterns")) return <PermissionDenied module="Identity patterns" />;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    const res = createIdentityPattern({ name, prefix, separator, numberLength });
    if (res.error) {
      setError(res.error);
      return;
    }
    toast.success("Pattern created", `${res.pattern?.name} · ${res.pattern?.example}`);
    router.push(`/identity-patterns/${res.pattern?.id}`);
  };

  const prefixProblem = touched || prefix ? (!safety.safe ? safety.reason : clash ? `Already used by “${clash.name}”.` : undefined) : undefined;

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-6 px-5 py-7 lg:px-8">
      <Link href="/identity-patterns" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-mut hover:text-ink-lum">
        <ArrowLeft className="h-4 w-4" /> Identity patterns
      </Link>
      <PageHeader overline="Identity patterns" title="New identity pattern" sub="Participants see this code instead of their name until the session ends." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <form onSubmit={submit} className="space-y-5 rounded-panel border border-edge bg-white p-6 shadow-panel" noValidate>
          <Field label="Pattern name" hint="Shown to operators when generating codes.">
            <Input value={name} onChange={(e) => { setName(e.target.value); setError(null); }} placeholder="e.g. Padel League" maxLength={60} required />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Prefix" hint="2–8 letters.">
              <Input
                value={prefix}
                onChange={(e) => { setPrefix(e.target.value.replace(/\s/g, "")); setError(null); }}
                placeholder="PDL"
                maxLength={8}
                className="font-mono uppercase"
                aria-invalid={!!prefixProblem}
                required
              />
            </Field>
            <Field label="Separator">
              <Select value={separator} onChange={(e) => setSeparator(e.target.value)}>
                {IDENTITY_SEPARATORS.map((s) => (
                  <option key={s || "none"} value={s}>
                    {SEPARATOR_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Digits">
              <Select value={numberLength} onChange={(e) => setNumberLength(Number(e.target.value))}>
                {[2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n} (up to {patternCapacity(n).toLocaleString("en-IN")})
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {prefixProblem && <p className="text-sm text-amber-700">{prefixProblem}</p>}
          {error && (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2 border-t border-edge pt-5">
            <Link href="/identity-patterns">
              <Button variant="ghost">Cancel</Button>
            </Link>
            <Button type="submit" disabled={name.trim().length < 3 || !safety.safe || !!clash}>
              Create pattern
            </Button>
          </div>
        </form>

        <aside className="space-y-4 rounded-panel border border-edge bg-white p-6 shadow-panel lg:sticky lg:top-6 lg:self-start" aria-live="polite">
          <p className="eyebrow">Live preview</p>
          <div className="rounded-2xl border border-brand/20 bg-brand-subtle p-5 text-center">
            <p className="text-xs font-medium text-brand-ink">A participant sees</p>
            <p className="mt-1 font-mono text-4xl font-bold tracking-wide text-ink-lum">{samples[0]}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {samples.slice(1).map((s) => (
              <span key={s} className="rounded-lg border border-edge bg-bg-sunken px-2.5 py-1 font-mono text-sm text-ink-sec">
                {s}
              </span>
            ))}
            <span className="px-1 py-1 text-sm text-ink-mut">…</span>
          </div>
          <ul className="space-y-2 text-sm">
            <Rule ok={safety.safe} text="Letters-only prefix — no phone, date or name fragments" />
            <Rule ok={!clash} text="Prefix not used by another active pattern" />
            <Rule ok text={`Room for ${patternCapacity(numberLength).toLocaleString("en-IN")} participants per session`} />
          </ul>
          <p className="flex items-start gap-2 text-xs text-ink-mut">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> Codes are numbered in booking order and locked before the reveal.
          </p>
        </aside>
      </div>
    </div>
  );
}

function Rule({ ok, text }: { ok: boolean; text: string }) {
  return (
    <li className="flex items-start gap-2">
      <span className={ok ? "mt-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100 text-emerald-700" : "mt-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-100 text-amber-700"}>
        {ok ? <Check className="h-3 w-3" /> : <span className="text-[10px] font-bold">!</span>}
      </span>
      <span className={ok ? "text-ink-sec" : "text-amber-800"}>{text}</span>
    </li>
  );
}
