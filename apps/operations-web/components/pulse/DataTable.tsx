"use client";

import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/format";
import { Skeleton } from "./Skeleton";
import { Empty } from "./States";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  sort?: (a: T, b: T) => number;
  width?: string;
  align?: "left" | "right";
};

export type DataTableProps<T> = {
  rows: T[];
  columns: Array<Column<T>>;
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  empty?: ReactNode;
  /** Put a max height here (e.g. "max-h-[70vh]") so the sticky header has something to stick to. */
  className?: string;
  caption?: string;
};

export function DataTable<T>({ rows, columns, rowKey, onRowClick, loading = false, empty, className, caption }: DataTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [active, setActive] = useState(0);
  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);

  const sorted = useMemo(() => {
    const col = sort ? columns.find((c) => c.key === sort.key) : undefined;
    if (!sort || !col?.sort) return rows;
    const by = col.sort;
    return rows
      .map((row, i) => ({ row, i }))
      .sort((a, b) => by(a.row, b.row) * sort.dir || a.i - b.i)
      .map((x) => x.row);
  }, [rows, columns, sort]);

  const focusRow = (i: number) => {
    const next = Math.max(0, Math.min(sorted.length - 1, i));
    setActive(next);
    rowRefs.current[next]?.focus();
  };

  const onKey = (e: KeyboardEvent<HTMLTableRowElement>, i: number, row: T) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusRow(i + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusRow(i - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusRow(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusRow(sorted.length - 1);
    } else if (e.key === "Enter" && onRowClick) {
      e.preventDefault();
      onRowClick(row);
    }
  };

  const tabStop = Math.min(active, Math.max(sorted.length - 1, 0));
  const showEmpty = !loading && sorted.length === 0;

  return (
    <div className={cn("relative overflow-auto rounded-card border border-line-soft bg-[rgba(18,16,28,0.6)]", className)}>
      <table className="w-full border-separate border-spacing-0 text-left text-[14px]">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((col) => {
              const dir = sort?.key === col.key ? sort.dir : 0;
              const right = col.align === "right";
              return (
                <th
                  key={col.key}
                  scope="col"
                  style={col.width ? { width: col.width } : undefined}
                  aria-sort={col.sort ? (dir === 1 ? "ascending" : dir === -1 ? "descending" : "none") : undefined}
                  className={cn(
                    "sticky top-0 z-10 whitespace-nowrap border-b border-line-soft bg-[rgba(18,16,28,0.94)] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-3 backdrop-blur-[10px]",
                    right && "text-right",
                  )}
                >
                  {col.sort ? (
                    <button
                      type="button"
                      onClick={() => setSort((s) => (s?.key === col.key ? { key: col.key, dir: s.dir === 1 ? -1 : 1 } : { key: col.key, dir: 1 }))}
                      className={cn(
                        "focus-ring -mx-1.5 inline-flex items-center gap-1 rounded-[8px] px-1.5 py-0.5 uppercase tracking-[0.08em] transition-colors duration-150 hover:text-text",
                        dir !== 0 && "text-text",
                        right && "flex-row-reverse",
                      )}
                    >
                      {col.header}
                      {dir === 1 ? (
                        <ArrowUp aria-hidden className="h-3.5 w-3.5 text-primary" />
                      ) : dir === -1 ? (
                        <ArrowDown aria-hidden className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <ChevronsUpDown aria-hidden className="h-3.5 w-3.5 opacity-50" />
                      )}
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody aria-busy={loading || undefined}>
          {loading
            ? Array.from({ length: 6 }, (_, r) => (
                <tr key={`sk-${r}`} aria-hidden style={{ opacity: 1 - r * 0.12 }}>
                  {columns.map((col, c) => (
                    <td key={col.key} className="border-b border-line-soft px-4 py-4">
                      <Skeleton className={cn("h-3.5 rounded-pill", c === 0 ? "w-3/4" : "w-1/2", col.align === "right" && "ml-auto")} />
                    </td>
                  ))}
                </tr>
              ))
            : sorted.map((row, i) => (
                <tr
                  key={rowKey(row)}
                  ref={(el) => {
                    rowRefs.current[i] = el;
                  }}
                  tabIndex={i === tabStop ? 0 : -1}
                  onFocus={() => setActive(i)}
                  onKeyDown={(e) => onKey(e, i, row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    "group outline-none transition-colors duration-150",
                    "hover:bg-[rgba(255,255,255,0.035)] focus-visible:bg-[rgba(142,114,255,0.1)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
                    onRowClick && "cursor-pointer",
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        "border-b border-line-soft px-4 py-3.5 align-middle text-text group-last:border-b-0",
                        col.align === "right" && "num text-right",
                      )}
                    >
                      {col.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
          {showEmpty ? (
            <tr>
              <td colSpan={columns.length}>{empty ?? <Empty emoji="🫥" title="Nothing here yet" body="Records will show up here as they come in." />}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
      {loading ? <span className="sr-only" role="status">Loading…</span> : null}
    </div>
  );
}
