"use client";

import { useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/format";
import { Button, Toggle } from "@/components/ui/primitives";
import { Select } from "@/components/ui/fields";
import { Drawer } from "@/components/ui/overlays";
import { WizardShell, useWizard } from "@/components/geo/WizardShell";
import { LinkButton, Notice, TextArea } from "@/components/setup/kit";
import { useToast } from "@/components/ui/toast";

/* ----------------------------------------------------------------------------
 * Schema-driven forms: one field definition drives create wizards, edit
 * drawers, inline validation and the review step.
 * ------------------------------------------------------------------------- */

export type FormValues = Record<string, unknown>;
export type Option = { value: string; label: string; hint?: string };

interface BaseField {
  key: string;
  label: string;
  hint?: string;
  required?: boolean;
  /** Occupy both grid columns. */
  wide?: boolean;
  /** Hide the field unless this returns true. */
  show?: (v: FormValues) => boolean;
  /** Extra check; return a message when invalid. */
  check?: (value: unknown, v: FormValues) => string | undefined;
}

export type FieldDef =
  | (BaseField & { type: "text" | "email" | "tel" | "date" | "time"; placeholder?: string })
  | (BaseField & { type: "number"; min?: number; max?: number; step?: number; suffix?: string; placeholder?: string })
  | (BaseField & { type: "textarea"; rows?: number; placeholder?: string })
  | (BaseField & { type: "select"; options: Option[]; placeholder?: string })
  | (BaseField & { type: "toggle"; description?: string })
  | (BaseField & { type: "chips"; options: Option[] })
  | (BaseField & { type: "list"; placeholder?: string });

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isEmpty = (v: unknown) => v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);

/** Inline validation for visible fields. Returns a message per invalid key. */
export function validateFields(fields: FieldDef[], values: FormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    if (f.show && !f.show(values)) continue;
    const v = values[f.key];
    if (f.required && f.type !== "toggle" && isEmpty(v)) {
      errors[f.key] = f.type === "select" ? `Choose ${f.label.toLowerCase()}.` : f.type === "chips" ? `Choose at least one option.` : `${f.label} is required.`;
      continue;
    }
    if (f.type === "number" && !isEmpty(v)) {
      const n = Number(v);
      if (!Number.isFinite(n)) errors[f.key] = "Enter a number.";
      else if (f.min !== undefined && n < f.min) errors[f.key] = `Must be at least ${f.min}.`;
      else if (f.max !== undefined && n > f.max) errors[f.key] = `Must be at most ${f.max}.`;
    }
    if (f.type === "email" && !isEmpty(v) && !EMAIL.test(String(v).trim())) errors[f.key] = "Enter a valid email address.";
    if (!errors[f.key] && f.check) {
      const m = f.check(v, values);
      if (m) errors[f.key] = m;
    }
  }
  return errors;
}

/** Render a value for the review step / read views. */
export function displayValue(f: FieldDef, v: unknown): string {
  if (f.type === "toggle") return v ? "Yes" : "No";
  if (isEmpty(v)) return "—";
  if (f.type === "select") return f.options.find((o) => o.value === v)?.label ?? String(v);
  if (f.type === "chips") return (v as string[]).map((x) => f.options.find((o) => o.value === x)?.label ?? x).join(", ");
  if (f.type === "list") return (v as string[]).join(", ");
  if (f.type === "number") return `${v}${f.suffix ? ` ${f.suffix}` : ""}`;
  return String(v);
}

function Control({ f, value, onChange, invalid }: { f: FieldDef; value: unknown; onChange: (v: unknown) => void; invalid: boolean }) {
  const base = cn("field h-11 w-full rounded-xl px-3.5 text-sm text-ink-lum placeholder:text-slate-400 focus:outline-none", invalid && "border-red-300 ring-2 ring-red-100");
  const id = `f-${f.key}`;
  switch (f.type) {
    case "textarea":
      return <TextArea id={id} rows={f.rows ?? 3} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder} className={cn(invalid && "border-red-300 ring-2 ring-red-100")} />;
    case "select":
      return (
        <Select id={id} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} className={cn("h-11", invalid && "border-red-300 ring-2 ring-red-100")}>
          <option value="">{f.placeholder ?? `Choose ${f.label.toLowerCase()}…`}</option>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      );
    case "toggle":
      return (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-edge bg-bg-sunken/60 px-3.5 py-2.5">
          <span className="text-[13px] text-ink-sec">{f.description ?? f.label}</span>
          <Toggle on={!!value} onToggle={() => onChange(!value)} label={f.label} />
        </div>
      );
    case "chips": {
      const arr = (value as string[] | undefined) ?? [];
      return (
        <div className="flex flex-wrap gap-2" role="group" aria-label={f.label}>
          {f.options.length === 0 && <span className="text-sm text-ink-mut">No options available yet.</span>}
          {f.options.map((o) => {
            const on = arr.includes(o.value);
            return (
              <button
                type="button"
                key={o.value}
                aria-pressed={on}
                onClick={() => onChange(on ? arr.filter((x) => x !== o.value) : [...arr, o.value])}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors",
                  on ? "border-brand bg-brand-subtle text-brand-ink" : "border-edge-strong bg-white text-ink-sec hover:bg-slate-50",
                )}
              >
                {on && <Check className="h-3.5 w-3.5" />}
                {o.label}
              </button>
            );
          })}
        </div>
      );
    }
    case "list":
      return (
        <input
          id={id}
          className={base}
          value={((value as string[] | undefined) ?? []).join(", ")}
          onChange={(e) => onChange(e.target.value.split(",").map((s) => s.trimStart()))}
          onBlur={(e) => onChange(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
          placeholder={f.placeholder ?? "Separate items with commas"}
        />
      );
    case "number":
      return (
        <div className="relative">
          <input
            id={id}
            type="number"
            inputMode="decimal"
            className={cn(base, f.suffix && "pr-14")}
            value={value === undefined || value === null ? "" : String(value)}
            min={f.min}
            max={f.max}
            step={f.step}
            placeholder={f.placeholder}
            onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          />
          {f.suffix && <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-ink-mut">{f.suffix}</span>}
        </div>
      );
    default:
      return <input id={id} type={f.type} className={base} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} placeholder={"placeholder" in f ? f.placeholder : undefined} />;
  }
}

/** A two-column grid of labelled controls with inline errors. */
export function FormFields({ fields, values, onChange, errors = {} }: { fields: FieldDef[]; values: FormValues; onChange: (key: string, v: unknown) => void; errors?: Record<string, string> }) {
  return (
    <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
      {fields
        .filter((f) => !f.show || f.show(values))
        .map((f) => {
          const err = errors[f.key];
          const wide = f.wide || f.type === "textarea" || f.type === "chips" || f.type === "toggle";
          return (
            <div key={f.key} className={cn(wide && "sm:col-span-2")}>
              {f.type === "toggle" ? (
                <span className="mb-1.5 block text-[13px] font-medium text-ink-sec">{f.label}</span>
              ) : (
                <label htmlFor={`f-${f.key}`} className="mb-1.5 block text-[13px] font-medium text-ink-sec">
                  {f.label}
                  {f.required && <span className="ml-0.5 text-red-500" aria-hidden>*</span>}
                </label>
              )}
              <Control f={f} value={values[f.key]} onChange={(v) => onChange(f.key, v)} invalid={!!err} />
              {err ? (
                <p className="mt-1.5 text-xs font-medium text-red-600" role="alert">{err}</p>
              ) : (
                f.hint && <p className="mt-1.5 text-xs leading-5 text-ink-mut">{f.hint}</p>
              )}
            </div>
          );
        })}
    </div>
  );
}

export interface SchemaStep {
  label: string;
  sub?: string;
  intro?: string;
  fields: FieldDef[];
  /** Cross-field checks for this step; return a message to block Next. */
  validate?: (v: FormValues) => string | undefined;
  /** Extra content rendered under the fields (previews, hints). */
  extra?: (v: FormValues) => ReactNode;
}

/**
 * A multi-step create flow. Steps validate before moving on; the last step is
 * an automatic review. `onSubmit` returns the store outcome; a refusal is shown
 * inline and as a toast.
 */
export function SchemaWizard({
  steps,
  initial,
  submitLabel,
  cancelHref,
  onSubmit,
}: {
  steps: SchemaStep[];
  initial: FormValues;
  submitLabel: string;
  cancelHref: string;
  onSubmit: (values: FormValues) => { error?: string } | void;
}) {
  const all: SchemaStep[] = [...steps, { label: "Review", sub: "Check and create", fields: [] }];
  const { step, next, back, jump } = useWizard(all.length);
  const [values, setValues] = useState<FormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [stepError, setStepError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const toast = useToast();
  const current = all[step];
  const isReview = step === all.length - 1;

  const set = (key: string, v: unknown) => {
    setValues((prev) => ({ ...prev, [key]: v }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const n = { ...prev };
      delete n[key];
      return n;
    });
    setStepError(null);
    setSubmitError(null);
  };

  function checkStep(i: number): boolean {
    const s = all[i];
    const errs = validateFields(s.fields, values);
    setErrors(errs);
    const cross = Object.keys(errs).length === 0 ? s.validate?.(values) : undefined;
    setStepError(cross ?? null);
    return Object.keys(errs).length === 0 && !cross;
  }

  function goNext() {
    if (checkStep(step)) next();
  }

  function submit() {
    for (let i = 0; i < steps.length; i++) {
      if (!checkStep(i)) {
        jump(i);
        return;
      }
    }
    const out = onSubmit(values);
    if (out && out.error) {
      setSubmitError(out.error);
      toast.error("Not created", out.error);
    }
  }

  return (
    <WizardShell
      steps={all.map((s) => ({ label: s.label, sub: s.sub }))}
      step={step}
      onStep={jump}
      footer={
        <>
          <LinkButton href={cancelHref} variant="ghost">
            Cancel
          </LinkButton>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button variant="secondary" onClick={back}>
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
            )}
            {isReview ? (
              <Button onClick={submit}>
                <CheckCircle2 className="h-4 w-4" /> {submitLabel}
              </Button>
            ) : (
              <Button onClick={goNext}>
                Next <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <p className="eyebrow text-brand">
            Step {step + 1} of {all.length}
          </p>
          <h2 className="mt-1 font-display text-lg font-bold text-ink-lum">{current.label}</h2>
          {current.intro && <p className="mt-1 text-sm leading-6 text-ink-mut">{current.intro}</p>}
        </div>
        {isReview ? (
          <div className="space-y-5">
            {steps.map((s, i) => (
              <div key={s.label} className="rounded-2xl border border-edge">
                <div className="flex items-center justify-between border-b border-edge px-4 py-2.5">
                  <p className="text-[13px] font-semibold text-ink-lum">{s.label}</p>
                  <button type="button" onClick={() => jump(i)} className="text-xs font-semibold text-brand hover:underline">
                    Edit
                  </button>
                </div>
                <dl className="divide-y divide-slate-100 px-4">
                  {s.fields
                    .filter((f) => !f.show || f.show(values))
                    .map((f) => (
                      <div key={f.key} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:justify-between sm:gap-6">
                        <dt className="text-[13px] text-ink-mut">{f.label}</dt>
                        <dd className="text-sm font-medium text-ink-lum sm:text-right">{displayValue(f, values[f.key])}</dd>
                      </div>
                    ))}
                </dl>
              </div>
            ))}
            {submitError && <Notice tone="danger" title="Not created">{submitError}</Notice>}
          </div>
        ) : (
          <>
            <FormFields fields={current.fields} values={values} onChange={set} errors={errors} />
            {current.extra?.(values)}
            {stepError && <Notice tone="danger">{stepError}</Notice>}
          </>
        )}
      </div>
    </WizardShell>
  );
}

/** Edit an existing record in a side drawer using the same field schema. */
export function EditDrawer({
  open,
  onClose,
  title,
  sub,
  fields,
  initial,
  onSave,
  saveLabel = "Save changes",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  sub?: string;
  fields: FieldDef[];
  initial: FormValues;
  onSave: (values: FormValues) => { error?: string } | void;
  saveLabel?: string;
}) {
  const [values, setValues] = useState<FormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [openedWith, setOpenedWith] = useState<boolean>(false);
  if (open !== openedWith) {
    setOpenedWith(open);
    if (open) {
      setValues(initial);
      setErrors({});
      setError(null);
    }
  }
  function save() {
    const errs = validateFields(fields, values);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const out = onSave(values);
    if (out && out.error) setError(out.error);
    else onClose();
  }
  return (
    <Drawer open={open} onClose={onClose} title={title} sub={sub} width="max-w-xl">
      <div className="space-y-5">
        <FormFields
          fields={fields}
          values={values}
          errors={errors}
          onChange={(k, v) => {
            setValues((p) => ({ ...p, [k]: v }));
            setError(null);
          }}
        />
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="flex justify-end gap-2 border-t border-edge pt-4">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>{saveLabel}</Button>
        </div>
      </div>
    </Drawer>
  );
}

/** Success screen shown after a create flow. */
export function CreatedCard({ title, line, primary, secondary }: { title: string; line: string; primary: { href: string; label: string }; secondary: Array<{ href: string; label: string }> }) {
  return (
    <div className="mx-auto max-w-xl rounded-panel border border-edge bg-white p-8 text-center shadow-panel">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-8 ring-emerald-50/60">
        <CheckCircle2 className="h-7 w-7" />
      </span>
      <h2 className="mt-5 font-display text-xl font-bold text-ink-lum">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-mut">{line}</p>
      <div className="mt-6 flex flex-col items-center gap-3">
        <LinkButton href={primary.href} size="lg" className="w-full sm:w-auto">
          {primary.label} <ArrowRight className="h-4 w-4" />
        </LinkButton>
        <div className="flex flex-wrap justify-center gap-2">
          {secondary.map((s) => (
            <LinkButton key={s.href} href={s.href} variant="secondary" size="sm">
              {s.label}
            </LinkButton>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Coerce form values to typed fields. */
export const num = (v: unknown, fallback = 0): number => (v === "" || v === undefined || v === null || !Number.isFinite(Number(v)) ? fallback : Number(v));
export const str = (v: unknown): string => (typeof v === "string" ? v.trim() : v === undefined || v === null ? "" : String(v));
export const list = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);
export const bool = (v: unknown): boolean => !!v;
