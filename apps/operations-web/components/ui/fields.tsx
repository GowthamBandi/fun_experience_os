"use client";

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/format";

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="overline block mb-2">{label}</span>
      {children}
      {hint && <span className="mt-2 block text-xs text-ink-mut">{hint}</span>}
    </label>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "field h-11 w-full rounded-xl px-3.5 text-sm text-ink-lum placeholder:text-ink-mut/70",
        "autofill:bg-transparent",
        className,
      )}
      {...rest}
    />
  );
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "field h-10 w-full cursor-pointer rounded-xl px-3 text-sm text-ink-lum",
        "appearance-none bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%2212%22%20height=%2212%22%20viewBox=%220%200%2024%2024%22%20fill=%22none%22%20stroke=%22%2382889a%22%20stroke-width=%222%22%3E%3Cpath%20d=%22m6%209%206%206%206-6%22/%3E%3C/svg%3E')] bg-[position:right_12px_center] bg-no-repeat pr-9",
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mut" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="field h-10 w-full rounded-xl pl-10 pr-3 text-sm text-ink-lum placeholder:text-ink-mut/70 focus:outline-none"
      />
    </div>
  );
}

/** The room narrowing — a filter rail of quiet segmented choices. */
export function FilterRail<T extends string>({
  options,
  value,
  onChange,
  all = "All",
}: {
  options: readonly T[];
  value: T | "all";
  onChange: (v: T | "all") => void;
  all?: string;
}) {
  const choices: Array<T | "all"> = ["all", ...options];
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl bg-white/4 p-1">
      {choices.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200 ease-light",
            value === c ? "bg-white/10 text-ink-lum shadow-lift" : "text-ink-mut hover:text-ink-sec",
          )}
        >
          {c === "all" ? all : c.replace("-", " ")}
        </button>
      ))}
    </div>
  );
}
