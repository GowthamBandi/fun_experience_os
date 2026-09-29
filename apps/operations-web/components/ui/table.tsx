"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/format";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: "left" | "right";
  width?: string;
}

/** Dense data on a solid surface — readability is a surface. */
export function DataTable<T>({ columns, rows, emptyTitle, emptyLine, onRowClick }: { columns: Array<Column<T>>; rows: T[]; emptyTitle: string; emptyLine: string; onRowClick?: (row: T) => void }) {
  return (
    <div className="solid overflow-hidden rounded-panel">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-edge bg-bg-sunken/80">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-mut",
                    c.align === "right" && "text-right",
                  )}
                  style={{ width: c.width }}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  "border-b border-slate-100 last:border-0 transition-colors hover:bg-slate-50/80",
                  onRowClick && "cursor-pointer hover:bg-brand-subtle/40",
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn("px-4 py-3.5 align-middle", c.align === "right" && "text-right tabular")}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && (
        <div className="px-4 py-14 text-center">
          <p className="text-sm font-semibold text-ink-lum">{emptyTitle}</p>
          <p className="mt-1 text-sm text-ink-mut">{emptyLine}</p>
        </div>
      )}
    </div>
  );
}
