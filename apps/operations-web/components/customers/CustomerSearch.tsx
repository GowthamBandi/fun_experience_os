"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Hash, Info, Phone, Search, Ticket, X } from "lucide-react";
import { Avatar, Badge, Card, Empty, ErrorState, PageHeader, Skeleton } from "@/components/pulse";
import { PageContainer } from "@/components/shell/PageContainer";
import { customerLookup, customerName, newestCustomers, newestShort, toCustomer, type CustomerLookup, type CustomerRow } from "@/lib/customers";
import { fetchDisplayNames, lookupCustomers, newestUsersQuery } from "@/lib/customers-firestore";
import { maskPhone, relTime } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { countFull } from "@/lib/overview";
import { useMetric } from "@/lib/use-metric";
import { readErrorMessage, useBoundedQuery, useOneShot } from "@/lib/use-query";

const NEWEST = 20;
/** Operators share users with customers; read a few extra so 20 customers remain after dropping them. */
const NEWEST_READ = 60;
const DEBOUNCE_MS = 350;

const KIND_LABEL: Record<"phone" | "id" | "reference", { label: string; icon: typeof Phone }> = {
  phone: { label: "Phone number", icon: Phone },
  id: { label: "Customer ID", icon: Hash },
  reference: { label: "Booking reference", icon: Ticket },
};

type Found = { rows: CustomerRow[]; names: Record<string, string | null> };
type SearchState = { status: "idle" } | { status: "loading" } | { status: "done"; found: Found } | { status: "error"; message: string };

async function runLookup(lookup: CustomerLookup): Promise<Found> {
  const rows = await lookupCustomers(lookup);
  const names = rows.length ? await fetchDisplayNames(rows.map((r) => r.uid)).catch(() => ({})) : {};
  return { rows, names };
}

export function CustomerSearch() {
  const [input, setInput] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<SearchState>({ status: "idle" });
  const lookup = useMemo(() => customerLookup(input), [input]);
  const lookupKey = lookup.kind === "phone" || lookup.kind === "id" || lookup.kind === "reference" ? `${lookup.kind}:${lookup.value}` : null;
  const inputRef = useRef<HTMLInputElement>(null);
  const lookupRef = useRef(lookup);
  lookupRef.current = lookup;

  useEffect(() => {
    if (!lookupKey) {
      setState({ status: "idle" });
      return;
    }
    let live = true;
    setState({ status: "loading" });
    const t = window.setTimeout(() => {
      runLookup(lookupRef.current).then(
        (found) => live && setState({ status: "done", found }),
        (err) => live && setState({ status: "error", message: readErrorMessage(err) }),
      );
    }, DEBOUNCE_MS);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [lookupKey, attempt]);

  const total = useMetric("newCustomers", undefined);
  const searching = lookup.kind !== "empty";

  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader
        overline="Marketplace"
        title={
          <>
            Customers
            {total.value !== null && total.value > 0 ? (
              <>
                {" "}
                <em className="hl">{countFull(total.value)} members</em>
              </>
            ) : null}
          </>
        }
        subtitle="Find anyone on PULSE by phone, customer ID or booking reference, then open their 360: bookings, money, reviews and holds."
      />

      <Card as="section" aria-label="Find a customer" className="overflow-hidden p-5 sm:p-6">
        <span aria-hidden className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-primary opacity-[0.16] blur-3xl" />
        <span aria-hidden className="pointer-events-none absolute -bottom-32 left-10 h-64 w-64 rounded-full bg-[#F6A6FF] opacity-[0.08] blur-3xl" />
        <form
          role="search"
          className="relative"
          onSubmit={(e) => {
            e.preventDefault();
            setAttempt((n) => n + 1);
          }}
        >
          <label className="field flex h-16 items-center gap-3 rounded-[20px] px-5">
            <Search aria-hidden className="h-5 w-5 shrink-0 text-primary" />
            <span className="sr-only">Phone number, customer ID or booking reference</span>
            <input
              ref={inputRef}
              type="search"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="98765 43210, a customer ID or PLS-…"
              autoComplete="off"
              spellCheck={false}
              autoFocus
              className="h-full min-w-0 flex-1 bg-transparent font-display text-[20px] font-semibold tracking-[-0.01em] text-text outline-none placeholder:font-sans placeholder:text-[16px] placeholder:font-normal placeholder:text-text-3 [&::-webkit-search-cancel-button]:hidden"
            />
            {lookupKey ? (
              <Badge tone="violet" className="hidden shrink-0 sm:inline-flex">
                {(() => {
                  const k = KIND_LABEL[lookup.kind as keyof typeof KIND_LABEL];
                  const Icon = k.icon;
                  return (
                    <>
                      <Icon aria-hidden className="h-3.5 w-3.5" />
                      {k.label}
                    </>
                  );
                })()}
              </Badge>
            ) : null}
            {input ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setInput("");
                  inputRef.current?.focus();
                }}
                className="focus-ring grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-text-3 hover:bg-[rgba(255,255,255,0.06)] hover:text-text"
              >
                <X aria-hidden className="h-4 w-4" />
              </button>
            ) : null}
          </label>
          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-text-3">
            <span className="inline-flex items-center gap-1.5">
              <Phone aria-hidden className="h-3.5 w-3.5" /> Any phone format: +91, 0 or spaces
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Hash aria-hidden className="h-3.5 w-3.5" /> Customer ID
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Ticket aria-hidden className="h-3.5 w-3.5" /> Booking reference PLS-XXXXXX
            </span>
          </p>
        </form>

        {searching ? (
          <div className="relative mt-5 border-t border-line-soft pt-5" aria-live="polite">
            {lookup.kind === "unsupported" ? (
              <div role="status" className="flex items-start gap-3 rounded-control border border-dashed border-[rgba(99,190,255,0.35)] bg-[rgba(99,190,255,0.06)] px-4 py-3.5">
                <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-info" />
                <div>
                  <div className="font-display text-[15px] font-bold text-text">Search by phone or ID</div>
                  <p className="mt-0.5 text-[13px] leading-5 text-text-2">
                    PULSE accounts don&apos;t store a name (it lives on the public profile), so names can&apos;t be searched here. Try a phone number, a customer ID or a booking reference.
                  </p>
                </div>
              </div>
            ) : state.status === "loading" || state.status === "idle" ? (
              <div aria-busy="true" className="flex flex-col gap-3">
                <ResultSkeleton />
                <span className="sr-only" role="status">
                  Searching…
                </span>
              </div>
            ) : state.status === "error" ? (
              <ErrorState message={state.message} onRetry={() => setAttempt((n) => n + 1)} className="py-6" />
            ) : state.found.rows.length === 0 ? (
              <Empty
                emoji="🫥"
                title="No one matches"
                body={
                  lookup.kind === "phone"
                    ? "No PULSE account uses that number. Check the digits; customers sign in with the number they verified."
                    : lookup.kind === "reference"
                      ? "No booking has that reference, or it isn't linked to a customer account."
                      : "No account has that ID."
                }
                className="py-8"
              />
            ) : (
              <ResultList found={state.found} />
            )}
          </div>
        ) : null}
      </Card>

      <NewestCustomers />
    </PageContainer>
  );
}

function ResultSkeleton() {
  return (
    <div className="flex items-center gap-4 rounded-control border border-line-soft p-4">
      <Skeleton className="h-12 w-12 rounded-full" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-40 rounded-pill" />
        <Skeleton className="h-3 w-56 rounded-pill" />
      </div>
    </div>
  );
}

function ResultList({ found }: { found: Found }) {
  const now = useNow(60_000);
  return (
    <ul className="flex flex-col gap-3" aria-label="Matching customers">
      {found.rows.map((c) => {
        const name = customerName(found.names[c.uid]);
        return (
          <li key={c.uid}>
            <Link
              href={`/customers/${encodeURIComponent(c.uid)}`}
              className="focus-ring group flex items-center gap-4 rounded-control border border-[rgba(142,114,255,0.35)] bg-[rgba(142,114,255,0.08)] p-4 transition-[transform,background-color] duration-200 ease-[cubic-bezier(.2,.8,.2,1)] hover:bg-[rgba(142,114,255,0.14)] motion-safe:hover:-translate-y-0.5"
            >
              <Avatar name={name} size={48} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-display text-[17px] font-bold text-text">{name}</span>
                  {c.operator ? <Badge tone="violet">Operator</Badge> : null}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-[12.5px] text-text-2">
                  <span className="font-mono">{maskPhone(c.phone)}</span>
                  <span className="text-text-3">Joined {now ? relTime(c.createdAt, now) : "—"}</span>
                  <span className="font-mono text-text-3">{c.uid}</span>
                </div>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-primary">
                Open 360
                <ArrowUpRight aria-hidden className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function NewestCustomers() {
  const now = useNow(60_000);
  const users = useBoundedQuery("newest-users", newestUsersQuery, toCustomer, NEWEST_READ);
  const rows = useMemo(() => newestCustomers(users.rows, NEWEST), [users.rows]);
  const uids = rows.map((r) => r.uid);
  const names = useOneShot(uids.length ? `newest-names|${uids.join(",")}` : null, () => fetchDisplayNames(uids));
  const short = newestShort(rows.length, users.truncated, NEWEST);

  return (
    <section aria-labelledby="newest-customers" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id="newest-customers" className="font-display text-[22px] font-bold tracking-[-0.02em] text-text">
          Newest customers
        </h2>
        <span className="text-[12px] text-text-3">Latest {NEWEST} sign-ups · phones masked</span>
      </div>
      {users.loading ? (
        <div aria-busy="true" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="glass rounded-card p-4" style={{ opacity: 1 - i * 0.08 }}>
              <div className="flex items-center gap-3">
                <Skeleton className="h-11 w-11 rounded-full" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-2/3 rounded-pill" />
                  <Skeleton className="h-3 w-1/2 rounded-pill" />
                </div>
              </div>
            </div>
          ))}
          <span className="sr-only" role="status">
            Loading customers…
          </span>
        </div>
      ) : users.error ? (
        <Card>
          <ErrorState message={users.error} onRetry={users.retry} />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <Empty emoji="🌱" title="No customers yet" body="People who sign up in the PULSE app and finish their profile appear here, newest first." />
        </Card>
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {rows.map((c, i) => {
              const name = names.loading ? null : customerName(names.value?.[c.uid]);
              return (
                <li key={c.uid}>
                  <Link
                    href={`/customers/${encodeURIComponent(c.uid)}`}
                    className="focus-ring glass group relative flex items-center gap-3 overflow-hidden rounded-card p-4 transition-[transform,border-color] duration-200 ease-[cubic-bezier(.2,.8,.2,1)] hover:border-[rgba(142,114,255,0.45)] motion-safe:hover:-translate-y-0.5"
                  >
                    {i === 0 ? <span aria-hidden className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full bg-primary opacity-[0.22] blur-2xl" /> : null}
                    {name ? <Avatar name={name} size={44} /> : <Skeleton className="h-11 w-11 rounded-full" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {name ? <span className="truncate font-display text-[15px] font-bold text-text">{name}</span> : <Skeleton className="h-4 w-24 rounded-pill" />}
                        {i === 0 ? <Badge tone="violet" className="shrink-0">Newest</Badge> : null}
                      </div>
                      <div className="mt-0.5 font-mono text-[12px] text-text-2">{maskPhone(c.phone)}</div>
                      <div className="text-[11.5px] text-text-3">Joined {now ? relTime(c.createdAt, now) : "—"}</div>
                    </div>
                    <ArrowUpRight aria-hidden className="h-4 w-4 shrink-0 text-text-3 transition-[color,transform] duration-200 group-hover:text-primary motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:translate-x-0.5" />
                  </Link>
                </li>
              );
            })}
          </ul>
          {short ? (
            <p className="flex items-center gap-2 rounded-control border border-dashed border-line px-3.5 py-2.5 text-[12px] text-text-3">
              <Info aria-hidden className="h-3.5 w-3.5 shrink-0 text-info" />
              Operators took up part of the newest {NEWEST_READ} accounts, so fewer than {NEWEST} customers show. Search by phone or ID to find anyone else.
            </p>
          ) : null}
          {names.error ? <p className="text-[12px] text-warn">Names couldn&apos;t load, so everyone shows as “PULSE member”. {names.error}</p> : null}
        </>
      )}
    </section>
  );
}
