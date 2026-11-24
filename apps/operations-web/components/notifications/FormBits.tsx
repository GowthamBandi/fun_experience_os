"use client";

import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/format";

/** A labelled form field with an optional counter, hint and error (aria-wired). */
export function Field({
  label,
  hint,
  error,
  count,
  max,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  count?: number;
  max?: number;
  className?: string;
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[12px] font-semibold text-text-3">
          {label}
        </label>
        {max !== undefined && count !== undefined ? (
          <span aria-hidden className={cn("num text-[11.5px]", count > max ? "text-err" : "text-text-3")}>
            {count}/{max}
          </span>
        ) : null}
      </div>
      {children({ id, describedBy, invalid: !!error })}
      {hint ? (
        <p id={hintId} className="text-[12px] leading-[1.45] text-text-3">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errId} className="flex items-start gap-1.5 text-[12px] leading-[1.45] text-err">
          <AlertCircle aria-hidden className="mt-[1px] h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const INPUT = "field h-11 w-full rounded-control px-3.5 text-[14px] text-text placeholder:text-text-3 disabled:opacity-60";
export const TEXTAREA = "field block w-full resize-y rounded-control px-3.5 py-3 text-[14px] leading-[1.5] text-text placeholder:text-text-3 disabled:opacity-60";

export function TextInput(props: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  const { invalid, className, ...rest } = props;
  return <input {...rest} aria-invalid={invalid || undefined} className={cn(INPUT, invalid && "!border-[rgba(255,97,120,0.6)]", className)} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  const { invalid, className, ...rest } = props;
  return <textarea {...rest} aria-invalid={invalid || undefined} className={cn(TEXTAREA, invalid && "!border-[rgba(255,97,120,0.6)]", className)} />;
}

/** An accessible on/off switch. */
export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-l`}
        aria-describedby={description ? `${id}-d` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "focus-ring relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-pill border transition-colors duration-150 ease-pulse disabled:opacity-50",
          checked ? "border-[rgba(142,114,255,0.6)] bg-primary-strong" : "border-line bg-[rgba(255,255,255,0.06)]",
        )}
      >
        <span aria-hidden className={cn("inline-block h-[18px] w-[18px] rounded-full bg-white shadow transition-transform duration-150 ease-pulse", checked ? "translate-x-[22px]" : "translate-x-[3px]")} />
      </button>
      <div className="min-w-0">
        <p id={`${id}-l`} className="text-[13.5px] font-semibold text-text">
          {label}
        </p>
        {description ? (
          <p id={`${id}-d`} className="mt-0.5 text-[12px] leading-[1.45] text-text-3">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** A radio group drawn as pills (native radios: arrow keys move the choice). */
export function Segmented<T extends string>({
  legend,
  value,
  options,
  onChange,
  className,
  size = "md",
}: {
  legend: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: ReactNode; description?: string }>;
  onChange: (v: T) => void;
  className?: string;
  size?: "sm" | "md";
}) {
  const name = useId();
  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend className="mb-1.5 text-[12px] font-semibold text-text-3">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <label
              key={o.value}
              title={o.description}
              className={cn(
                "relative inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-pill border font-semibold transition-[background-color,border-color,color] duration-150 ease-pulse has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary",
                size === "sm" ? "h-8 px-3 text-[12px]" : "h-9 px-3.5 text-[13px]",
                on ? "border-[rgba(142,114,255,0.55)] bg-[rgba(142,114,255,0.2)] text-text" : "border-line text-text-2 hover:border-[rgba(255,255,255,0.22)] hover:text-text",
              )}
            >
              <input type="radio" name={name} value={o.value} checked={on} onChange={() => onChange(o.value)} className="sr-only" />
              {o.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** A section card heading inside a form. */
export function FormSection({ title, description, children, className, action }: { title: string; description?: ReactNode; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section aria-label={title} className={cn("glass relative flex flex-col gap-4 rounded-card p-5 sm:p-6", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-[17px] font-bold tracking-[-0.02em] text-text">{title}</h2>
          {description ? <p className="mt-1 text-[13px] leading-[1.5] text-text-2">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
