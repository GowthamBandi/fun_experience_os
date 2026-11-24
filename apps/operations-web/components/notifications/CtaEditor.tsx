"use client";

import { useId } from "react";
import { cn } from "@/lib/format";
import { LINK_TYPES, LIMITS, linkIdLabel, type CtaForm, type CtaTarget, type LinkType } from "@/lib/notifications";
import { Field, INPUT, Segmented, TextInput } from "./FormBits";

/** One call-to-action: label + where it goes (an in-app link type + id, or a https web page). */
export function CtaEditor({ legend, value, onChange, error, disabled, labelPlaceholder }: { legend: string; value: CtaForm; onChange: (v: CtaForm) => void; error?: string | null; disabled?: boolean; labelPlaceholder: string }) {
  const set = (patch: Partial<CtaForm>) => onChange({ ...value, ...patch });
  const selectId = useId();
  return (
    <fieldset disabled={disabled} className={cn("flex flex-col gap-3 rounded-control border border-line-soft p-4", disabled && "opacity-60")}>
      <legend className="px-1 text-[12px] font-semibold text-text-3">{legend}</legend>
      <Field label="Button label" count={value.label.trim().length} max={LIMITS.ctaLabel[1]}>
        {({ id, describedBy }) => <TextInput id={id} aria-describedby={describedBy} value={value.label} maxLength={LIMITS.ctaLabel[1] + 10} onChange={(e) => set({ label: e.target.value })} placeholder={labelPlaceholder} />}
      </Field>
      <Segmented<CtaTarget>
        legend="When tapped"
        size="sm"
        value={value.target}
        options={[
          { value: "none", label: "Just close" },
          { value: "link", label: "Open in the app" },
          { value: "url", label: "Open a web page" },
        ]}
        onChange={(target) => set({ target })}
      />
      {value.target === "link" ? (
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={selectId} className="text-[12px] font-semibold text-text-3">
              Screen
            </label>
            <select id={selectId} value={value.linkType} onChange={(e) => set({ linkType: e.target.value as LinkType })} className={cn(INPUT, "bg-[rgba(26,23,38,0.9)]")}>
              {LINK_TYPES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          <Field label={linkIdLabel(value.linkType)}>
            {({ id, describedBy }) => <TextInput id={id} aria-describedby={describedBy} value={value.linkId} onChange={(e) => set({ linkId: e.target.value })} placeholder="Paste the ID from its console page" spellCheck={false} />}
          </Field>
        </div>
      ) : null}
      {value.target === "url" ? (
        <Field label="Web page (https)">
          {({ id, describedBy }) => <TextInput id={id} aria-describedby={describedBy} type="url" value={value.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://pulse.app/offers" spellCheck={false} />}
        </Field>
      ) : null}
      {error ? (
        <p role="alert" className="text-[12px] text-err">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
