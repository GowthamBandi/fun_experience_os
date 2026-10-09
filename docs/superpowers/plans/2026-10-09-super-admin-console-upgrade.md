# Super Admin Console Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Operations Console UI/UX in the PULSE "Neon Bento" style, with the real-data Super Admin screens listed in the spec. Remove the prototype.

**Architecture:** Next.js 15 App Router client pages under `app/(console)/`.
- A new UI kit in `components/pulse/` and a new shell in `components/shell/`.
- Pure, unit-tested logic in `lib/` (`format`, `metrics`, `search`, `capabilities`).
- Reads use the existing Firestore subscriptions (`use-governance.ts`) plus new aggregation and bounded-read helpers.
- Writes only through the existing callables in `lib/governance-api.ts`.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind 3, Firebase JS SDK 12 (Firestore `getAggregateFromServer`, `count`, `sum`), lucide-react, framer-motion, Vitest (node env).

**Spec:** `docs/superpowers/specs/2026-10-09-super-admin-console-upgrade-design.md`. Read it before any task. Its token table, IA, screen list and metric table are requirements.

All paths below are relative to `apps/operations-web/` unless they start with `firebase/`.

## Global Constraints

- Palette:
  - Backgrounds: ink `#0B0A12`, night `#12101C`, surface `#1A1726`, surfaceHigh `#242033`, surfaceTop `#2E2941`.
  - Lines: line `#332E47`, lineSoft `rgba(255,255,255,.08)`.
  - Text: `#F6F4FF`, text2 `#BDB8D1`, text3 `#9590AD`.
  - Brand: primary `#8E72FF`, primaryStrong `#6E4DFF`, volt `#D9FF3F`, onVolt `#14160B`.
  - Status: success `#3FDD9A`, warning `#FFB84D`, error `#FF6178`, info `#63BEFF`.
- Fonts: Space Grotesk (display and numbers), Plus Jakarta Sans (UI), loaded with `next/font/google`.
- Volt is used **only** for the single primary action on a screen, count badges and highlight words.
- Radius: 24 for cards, 16 for controls and rows, 99 for pills. Motion is 150–250 ms `cubic-bezier(.2,.8,.2,1)`, and none under `prefers-reduced-motion`.
- No new runtime dependencies. No chart library: charts are SVG.
- No client writes to Firestore. Every decision goes through an existing callable in `lib/governance-api.ts` and needs a non-empty reason or note.
- Money is in minor units (paise), formatted en-IN: `₹1,84,320`, compact `₹1.84L` / `₹2.1Cr`.
- Time ranges are computed in **Asia/Kolkata** (IST, UTC+5:30).
- Every data view has skeleton, empty, error-with-retry and truncated states.
- A missing field shows "—". Never invent a value.
- AA contrast, a visible violet focus ring, everything reachable by keyboard, and usable from 768 px wide.
- `npm run verify` (typecheck, vitest, next build) and the repo-root `npm run check:indexes` must pass at the end of every task that touches their inputs.
- Commit after each task with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never commit `.env*`, `.emulator-data/` or `firebase.console-local.json`.

## Review Focus

1. **Day boundaries in IST.** "Today" at 00:30 IST must start at the previous UTC day's 18:30Z, not UTC midnight. Tested in Task 7.
2. **No previous-period baseline.** When the previous period is 0, the delta reads "new", not `Infinity%` or `NaN%`. Tested in Task 2 (`deltaPct`).
3. **Missing fields on older docs.** A booking without `amountMinor` or `createdAt` never produces `NaN`; the metric shows "—" when it can't be computed. Tested in Task 7 (`readNumber`).
4. **Missing index or permission error on one KPI.** That card shows an error with Retry; the rest of the dashboard still renders. Tested in Task 7 (`metricErrorMessage`).
5. **Phone search in any typed form.** "98765 43210", "+91 98765-43210", "09876543210" and "9876543210" all normalise to `+919876543210`. Tested in Task 5 (`classifyQuery`).

---

## Phase 1: Foundation

### Task 1: PULSE tokens, fonts and base styles

**Files:**
- Modify: `app/globals.css` (replace the `:root` tokens and base styles), `tailwind.config.ts`, `app/layout.tsx`.

**Interfaces:**
- Produces Tailwind colours `ink`, `night`, `surface`, `surface-high`, `surface-top`, `line`, `line-soft`, `text`, `text-2`, `text-3`, `primary`, `primary-strong`, `volt`, `on-volt`, `ok`, `warn`, `err`, `info`.
- Produces font families `font-display` and `font-ui`, radii `rounded-card` (24px), `rounded-control` (16px) and `rounded-pill`, shadow `shadow-glow`, and timing `ease-pulse`.
- Produces CSS utilities `.glass` (surface at 78% alpha + 14px blur + lineSoft border), `.page-glow` (fixed violet radial at top-left and volt at bottom-right), `.focus-ring`, `.num` (Space Grotesk, tabular, tracking −0.03em), `.overline` (12px uppercase, tracking .08em, text-3), and `.skeleton` (shimmer, static under reduced motion).

- [ ] **Step 1:** In `app/layout.tsx`:
  - load `Space_Grotesk` (weights 500, 600, 700) and `Plus_Jakarta_Sans` (400, 500, 600, 700) from `next/font/google` with `variable: "--font-display"` / `"--font-ui"` and `display: "swap"`;
  - put both variables on `<html>`, with `className="bg-ink text-text font-ui antialiased"`;
  - keep the `ENV_PREFIX` title logic, but change the title base to `PULSE Admin`;
  - leave `StoreProvider` in place for now (Task 4 removes it).
- [ ] **Step 2:** Rewrite the `:root` block in `globals.css` with the Global Constraints palette as CSS variables (`--ink`, `--night`, …, `--volt`), the utilities above, `::selection { background: rgba(142,114,255,.35) }`, a scrollbar styled on surfaceHigh, and `@media (prefers-reduced-motion: reduce) { *,*::before,*::after { animation-duration:.01ms!important; transition-duration:.01ms!important } }`. Keep any class that a file outside `lib/prototype`, `app/(console)/<archived>` and `components/shell/{RoleSimulator,DemoWalkthroughPanel,TerritorySwitcher,SignalCenter}` still uses. Find them with `grep -rhoE 'className="[^"]*"' components app/(auth) app/(console)/page.tsx` and carry over any custom class that is used (e.g. `overline`, `dusk-field`, `grain`), restyled on the new tokens.
- [ ] **Step 3:** Rewrite `tailwind.config.ts` `extend` with the colours, fonts, radii, shadow (`glow: "0 40px 120px -30px rgba(142,114,255,.35)"`) and timing above. Keep the old keys (`bg`, `edge`, `brand`, `ink.lum`, …) as aliases mapped to the nearest new tokens, so unconverted screens still compile until later tasks replace them.
- [ ] **Step 4:** Run `npm run typecheck && npm run build`. Expected: both succeed.
- [ ] **Step 5:** Commit: `Console: PULSE tokens, fonts and base styles`.

### Task 2: Formatting helpers

**Files:**
- Modify: `lib/format.ts`
- Test: `tests/unit/format.test.ts` (new)

**Interfaces:**
- Produces:
  - `inrMinor(minor: number | null | undefined): string` — full en-IN rupees, no decimals, "—" when not finite;
  - `inrCompact(minor: number | null | undefined): string` — `₹950`, `₹18.6k`, `₹1.84L`, `₹2.1Cr`, "—";
  - `countCompact(n: number | null | undefined): string` — `412`, `1.2k`, `3.4L`;
  - `deltaPct(current: number | null, previous: number | null): { label: string; tone: "up" | "down" | "flat" | "new" | "none" }`;
  - `relTime(date: Date | null, now: Date): string` — `just now`, `12 min ago`, `3 h ago`, `yesterday`, `4 Oct`, `in 2 h`;
  - `maskPhone(e164: string | null | undefined): string` — `+91 98•••••210`;
  - `normalizePhone(input: string): string | null` — returns E.164 for Indian mobiles, otherwise null.
- The existing `inr`, `pct`, `fillRate`, `sum` and `cn` stay unchanged.

- [ ] **Step 1: Write the failing tests.**

```ts
import { describe, expect, it } from "vitest";
import { countCompact, deltaPct, inrCompact, inrMinor, maskPhone, normalizePhone, relTime } from "@/lib/format";

describe("money", () => {
  it("formats paise as en-IN rupees", () => {
    expect(inrMinor(18432000)).toBe("₹1,84,320");
    expect(inrMinor(0)).toBe("₹0");
    expect(inrMinor(undefined)).toBe("—");
    expect(inrMinor(Number.NaN)).toBe("—");
  });
  it("compacts with k / L / Cr", () => {
    expect(inrCompact(95000)).toBe("₹950");
    expect(inrCompact(1864000)).toBe("₹18.6k");
    expect(inrCompact(18432000)).toBe("₹1.84L");
    expect(inrCompact(2100000000)).toBe("₹2.1Cr");
    expect(inrCompact(null)).toBe("—");
  });
  it("compacts counts", () => {
    expect(countCompact(412)).toBe("412");
    expect(countCompact(1200)).toBe("1.2k");
    expect(countCompact(340000)).toBe("3.4L");
  });
});

describe("deltaPct", () => {
  it("compares with the previous period", () => {
    expect(deltaPct(118, 100)).toEqual({ label: "▲ 18%", tone: "up" });
    expect(deltaPct(90, 100)).toEqual({ label: "▼ 10%", tone: "down" });
    expect(deltaPct(100, 100)).toEqual({ label: "0%", tone: "flat" });
  });
  it("never shows Infinity or NaN", () => {
    expect(deltaPct(5, 0)).toEqual({ label: "new", tone: "new" });
    expect(deltaPct(0, 0)).toEqual({ label: "0%", tone: "flat" });
    expect(deltaPct(null, 10)).toEqual({ label: "", tone: "none" });
  });
});

describe("relTime", () => {
  const now = new Date("2026-10-09T12:00:00Z");
  it("reads naturally", () => {
    expect(relTime(new Date("2026-10-09T11:59:40Z"), now)).toBe("just now");
    expect(relTime(new Date("2026-10-09T11:48:00Z"), now)).toBe("12 min ago");
    expect(relTime(new Date("2026-10-09T09:00:00Z"), now)).toBe("3 h ago");
    expect(relTime(new Date("2026-10-08T10:00:00Z"), now)).toBe("yesterday");
    expect(relTime(new Date("2026-10-04T10:00:00Z"), now)).toBe("4 Oct");
    expect(relTime(new Date("2026-10-09T14:00:00Z"), now)).toBe("in 2 h");
    expect(relTime(null, now)).toBe("—");
  });
});

describe("phones", () => {
  it("masks", () => {
    expect(maskPhone("+919876543210")).toBe("+91 98•••••210");
    expect(maskPhone(null)).toBe("—");
  });
  it("normalises every typed form", () => {
    for (const raw of ["98765 43210", "+91 98765-43210", "09876543210", "9876543210", "919876543210"]) {
      expect(normalizePhone(raw)).toBe("+919876543210");
    }
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("5876543210")).toBeNull(); // Indian mobiles start 6–9
  });
});
```

- [ ] **Step 2:** Run `npx vitest run tests/unit/format.test.ts`. Expected: FAIL (the exports are missing).
- [ ] **Step 3:** Implement in `lib/format.ts`:

```ts
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const trim = (s: string) => s.replace(/\.0+$|(\.\d*?)0+$/, "$1");

export const inrMinor = (minor: number | null | undefined): string =>
  finite(minor) ? inr(Math.round(minor) / 100) : "—";

export function inrCompact(minor: number | null | undefined): string {
  if (!finite(minor)) return "—";
  const r = minor / 100;
  const a = Math.abs(r);
  if (a >= 1e7) return `₹${trim((r / 1e7).toFixed(a >= 1e8 ? 1 : 2))}Cr`;
  if (a >= 1e5) return `₹${trim((r / 1e5).toFixed(2))}L`;
  if (a >= 1e3) return `₹${trim((r / 1e3).toFixed(1))}k`;
  return `₹${Math.round(r)}`;
}

export function countCompact(n: number | null | undefined): string {
  if (!finite(n)) return "—";
  if (Math.abs(n) >= 1e5) return `${trim((n / 1e5).toFixed(1))}L`;
  if (Math.abs(n) >= 1e3) return `${trim((n / 1e3).toFixed(1))}k`;
  return String(Math.round(n));
}

export function deltaPct(current: number | null, previous: number | null): { label: string; tone: "up" | "down" | "flat" | "new" | "none" } {
  if (!finite(current) || !finite(previous)) return { label: "", tone: "none" };
  if (previous === 0) return current === 0 ? { label: "0%", tone: "flat" } : { label: "new", tone: "new" };
  const p = Math.round(((current - previous) / previous) * 100);
  if (p === 0) return { label: "0%", tone: "flat" };
  return p > 0 ? { label: `▲ ${p}%`, tone: "up" } : { label: `▼ ${Math.abs(p)}%`, tone: "down" };
}

export function relTime(date: Date | null, now: Date): string {
  if (!date || Number.isNaN(date.getTime())) return "—";
  const s = Math.round((now.getTime() - date.getTime()) / 1000);
  if (s < 0) {
    const m = Math.round(-s / 60);
    return m < 60 ? `in ${Math.max(m, 1)} min` : `in ${Math.round(m / 60)} h`;
  }
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 172800) return "yesterday";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(date);
}

export function normalizePhone(input: string): string | null {
  let d = input.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? `+91${d}` : null;
}

export function maskPhone(e164: string | null | undefined): string {
  if (!e164) return "—";
  const m = /^\+91(\d{2})\d{5}(\d{3})$/.exec(e164);
  return m ? `+91 ${m[1]}•••••${m[2]}` : `${e164.slice(0, 4)}•••••`;
}
```

  If `deltaPct(100,100)` or the `trim` cases fail, adjust `trim` until all the expectations pass. The tests are the contract.
- [ ] **Step 4:** Run `npx vitest run tests/unit/format.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit: `Console: en-IN money, deltas, relative time, phone helpers`.

### Task 3: The `components/pulse` UI kit

**Files:** create `components/pulse/` with `Button.tsx`, `Card.tsx`, `Stat.tsx`, `Chip.tsx`, `Badge.tsx`, `Avatar.tsx`, `Kbd.tsx`, `Skeleton.tsx`, `States.tsx` (Empty, ErrorState, Truncated), `Sheet.tsx`, `Drawer.tsx`, `DataTable.tsx`, `Tabs.tsx`, `Toast.tsx`, `Tooltip.tsx`, `PhoneFrame.tsx`, `Timeline.tsx`, `charts.tsx` (Sparkline, AreaChart, BarList, ProgressBar), `Glyph.tsx`, `PageHeader.tsx` and `index.ts` (re-exports).

**Interfaces (Produces, exact props):**
- `Button({ variant: "volt" | "primary" | "ghost" | "danger" | "quiet", size?: "sm" | "md" | "lg", loading?: boolean, icon?: ReactNode, ...ButtonHTMLAttributes })`
  - Volt: bg-volt and text-on-volt.
  - `loading` disables the button and shows a spinner.
  - Every variant has the focus ring.
- `Card({ as?, className?, interactive?: boolean, children })` uses `.glass rounded-card p-5`. `interactive` adds a hover lift (−2px) and a border to `primary/40`.
- `Stat({ label: string, value: string, delta?: ReturnType<typeof deltaPct>, hint?: string, loading?: boolean, error?: string | null, onRetry?: () => void, children? })`
  - Value in `.num text-[38px]`.
  - Delta pill tones: up → ok, down → err, new → volt, flat → text3.
  - Count-up animation over 600 ms when the value is numeric-looking, skipped under reduced motion.
  - The `error` state shows the message and a "Retry" ghost button.
- `Chip({ selected?: boolean, onClick?, children })`. Selected is a white pill with ink text; otherwise outlined.
- `Badge({ tone: "violet" | "volt" | "ok" | "warn" | "err" | "info" | "muted", children })` with `rounded-pill px-2 py-0.5 text-[11px] font-display font-bold`.
- `Avatar({ name: string, size?: number })` shows initials on a gradient chosen deterministically from a hash of the name.
- `Kbd({ children })`.
- `Skeleton({ className })` and `SkeletonRows({ rows = 5 })`.
- `Empty({ emoji: string, title: string, body?: string, action?: ReactNode })`.
- `ErrorState({ message: string, onRetry?: () => void })`.
- `Truncated({ shown: number })` shows the note "Showing the newest {shown}. Narrow the filters to see older records."
- `Sheet({ open, title, description?, confirmLabel, tone: "volt" | "danger", requireReason?: boolean, reasonLabel?: string, minReason?: number (default 5), extra?: ReactNode, onConfirm: (reason: string) => Promise<void>, onClose })`
  - A modal dialog with a focus trap; Esc closes it unless a request is pending.
  - Confirm is disabled until the reason length is at least `minReason`.
  - While pending, confirm shows loading and nothing can be clicked twice.
  - A thrown error is shown inline and the sheet stays open.
- `Drawer({ open, title, onClose, width?: number (default 560), children })` is a right-side panel; Esc closes it.
- `DataTable<T>({ rows: T[], columns: Array<{ key: string; header: string; cell: (row: T) => ReactNode; sort?: (a: T, b: T) => number; width?: string; align?: "left" | "right" }>, rowKey: (row: T) => string, onRowClick?: (row: T) => void, loading?: boolean, empty?: ReactNode })`
  - Sticky header; clicking a sortable header toggles the sort direction.
  - Rows are focusable; Enter triggers `onRowClick`; ↑/↓ move focus.
- `Tabs({ tabs: Array<{ id: string; label: string; count?: number }>, value: string, onChange })`.
- `ToastProvider` with `useToast()`, returning `{ show(input: { tone: "ok" | "err" | "info"; title: string; body?: string }) }`. Toasts stack bottom-right, auto-dismiss after 5 s, and use `role="status"`.
- `Tooltip({ label: string, children })`, CSS-only on hover and focus.
- `PhoneFrame({ children })` is a 360×720 rounded-[44px] device frame with a notch, for experience previews.
- `Timeline({ items: Array<{ id: string; at: Date | null; title: string; body?: string; tone?: Badge tone; actor?: string }> })`.
- Charts:
  - `Sparkline({ values: number[], height?: number })`: a volt line with a gradient fill, and `aria-hidden` set.
  - `AreaChart({ points: Array<{ label: string; value: number }>, format: (n: number) => string, height?: number })`: shows a hover tooltip, and `role="img"` with an aria-label summarising min, max and latest.
  - `BarList({ items: Array<{ label: string; value: number; display: string }> })`: horizontal violet→volt bars.
  - `ProgressBar({ value: number, max: number, label?: string })`.
- `Glyph({ emoji: string, tone: Badge tone })` is a 40×40 rounded-[13px] tinted tile.
- `PageHeader({ overline?: string, title: ReactNode, subtitle?: ReactNode, actions?: ReactNode })`. The title is `font-display text-[40px] leading-[1.05] tracking-[-0.03em]`, and highlighted words use `<em className="hl">` (a volt→mint gradient text).

- [ ] **Step 1:** Implement the components exactly as specified. Use the Global Constraints tokens and the mockup at `.superpowers/brainstorm/*/content/look-and-feel.html` (repo root) as the visual reference: the card glass, chips, queue rows, the `.go` volt button and the delta pills.
- [ ] **Step 2:** Add `tests/unit/charts.test.ts` for the pure geometry helper `chartPath(values: number[], width: number, height: number): { line: string; area: string }`, exported from `charts.tsx` into `components/pulse/chart-math.ts` so it is node-testable.

```ts
import { describe, expect, it } from "vitest";
import { chartPath } from "@/components/pulse/chart-math";
describe("chartPath", () => {
  it("maps values into the box, top = max", () => {
    const { line } = chartPath([0, 10], 100, 50);
    expect(line).toBe("M0,50 L100,0");
  });
  it("handles flat and single series without NaN", () => {
    expect(chartPath([5, 5], 100, 50).line).not.toMatch(/NaN/);
    expect(chartPath([7], 100, 50).line).toBe("M0,25 L100,25");
    expect(chartPath([], 100, 50).line).toBe("");
  });
});
```

  Run it (it fails), implement `chartPath`, then run it again (it passes).
- [ ] **Step 3:** `npm run typecheck`. Expected: clean.
- [ ] **Step 4:** Commit: `Console: PULSE UI kit`.

### Task 4: Remove the prototype and keep access control intact

**Files:**
- Delete:
  - every directory under `app/(console)/` except `page.tsx`, `layout.tsx`, `approvals`, `partners`, `arenas`, `events`, `customers`, `risk`, `reviews`, `refunds`, `settlements`, `commercials`, `policies`, `audit`, `legal-holds`, `system` and `operators`;
  - `lib/prototype/`, `lib/store.tsx`, `lib/console/archived.ts`, `tests/unit/archived.test.ts`;
  - `components/shell/{RoleSimulator,DemoWalkthroughPanel,TerritorySwitcher,SignalCenter}.tsx`;
  - `components/console/ArchivedPrototypeNotice.tsx`;
  - every `components/*` folder that only the deleted pages import (`bookings`, `catalog`, `missions`, `setup`, `staff`, `geo`, `dev`, and `motion` if unused). Check each with `grep -r "@/components/<dir>" app components lib` before deleting.
  - `lib/governance.ts` (static sample data), if nothing imports it after the pages are deleted.
- Modify:
  - `lib/console/capabilities.ts`: inline `GOVERNANCE_ROUTES` as `CONSOLE_ROUTES`, add the new routes `/live` and `/revenue` (`governance.read`), and remove the `archived.view` capability.
  - `lib/nav.ts`: rewrite it to the spec IA, removing `canAccess`/`navFor` if unused.
  - `lib/firebase/auth.tsx`: remove the `prototypeStore` branch.
  - `app/layout.tsx`: remove `StoreProvider` and add `ToastProvider`.
  - `app/(console)/layout.tsx`: remove the archived branches.
  - `tests/unit/capabilities.test.ts`: import `CONSOLE_ROUTES` and drop the archived assertions.

**Interfaces:**
- Produces `export const CONSOLE_ROUTES = ["/", "/live", "/approvals", "/partners", "/events", "/arenas", "/customers", "/risk", "/reviews", "/revenue", "/refunds", "/settlements", "/commercials", "/audit", "/policies", "/legal-holds", "/system", "/operators"] as const;` and `isConsoleRoute(pathname: string): boolean` in `capabilities.ts`. `canViewRoute` = `isConsoleRoute(path) && can(role, routeCapability(path))`, failing closed.
- `lib/nav.ts` produces:
  - `NavGroup = "Overview" | "Marketplace" | "Trust" | "Money" | "Control"`;
  - `NavItem { href: string; label: string; group: NavGroup; icon: LucideIcon; keywords: string; badge?: "approvals" | "risk" | "refunds" | "live" }`;
  - `NAV: NavItem[]` (one item per `CONSOLE_ROUTES` entry, using the spec labels);
  - `consoleNav(role): NavItem[]`.

- [ ] **Step 1: Write the failing test** (add it to `tests/unit/capabilities.test.ts`):

```ts
import { CONSOLE_ROUTES, canViewRoute, isConsoleRoute } from "@/lib/console/capabilities";
import { NAV } from "@/lib/nav";
it("new console routes are governed and fail closed", () => {
  expect(canViewRoute("super-admin", "/live")).toBe(true);
  expect(canViewRoute("super-admin", "/revenue")).toBe(true);
  expect(canViewRoute("super-admin", "/partners/org123")).toBe(true);
  expect(canViewRoute("super-admin", "/customers/uid9")).toBe(true);
  expect(canViewRoute("auditor", "/live")).toBe(false);
  expect(canViewRoute("super-admin", "/missions")).toBe(false);
  expect(isConsoleRoute("/missions/abc")).toBe(false);
});
it("every nav item is a console route and vice versa", () => {
  expect(NAV.map((n) => n.href).sort()).toEqual([...CONSOLE_ROUTES].sort());
});
```

- [ ] **Step 2:** Run `npx vitest run tests/unit/capabilities.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Make the deletions and modifications listed above. Every 2-line route page that still exists keeps compiling (old components restyle in later tasks). Create placeholder-free stubs only where a new route needs to exist for the nav test to be meaningful; `/live` and `/revenue` pages are created in Tasks 9 and 16, so `canViewRoute` is tested without the pages.
- [ ] **Step 4:** Run `npm run verify`. Expected: typecheck clean, all tests pass, build succeeds. Fix any import of deleted modules.
- [ ] **Step 5:** Commit: `Console: remove archived prototype; console routes for the new IA`.

### Task 5: Shell (rail, top bar, ⌘K search, environment badge, notifications)

**Files:**
- Create: `components/shell/Rail.tsx`, `components/shell/TopBar.tsx`, `components/shell/EnvBadge.tsx`, `components/shell/NotificationsDrawer.tsx`, `lib/search.ts`, `lib/use-attention.ts`.
- Rewrite: `components/shell/AppShell.tsx`, `components/shell/CommandPalette.tsx`.
- Delete: `components/shell/Sidebar.tsx`, `components/shell/Topbar.tsx` (replaced).
- Test: `tests/unit/search.test.ts`.

**Interfaces:**
- `lib/search.ts` produces:
  - `type QueryKind = "phone" | "reference" | "id" | "text"`;
  - `classifyQuery(q: string): { kind: QueryKind; value: string }`:
    - phone → `normalizePhone` result;
    - reference: `/^PLS-[A-Z2-9]{6}$/i`, uppercased;
    - id: 20–40 chars matching `[A-Za-z0-9_-]`, with no spaces;
    - text: lowercased and trimmed.
  - `pageMatches(q: string, items: NavItem[]): NavItem[]`: a case-insensitive match on label + keywords, label matches first.
  - `searchEntities(q, deps)`, which returns `Promise<SearchHit[]>` with `SearchHit { kind: "organizer" | "event" | "experience" | "booking" | "customer"; id: string; title: string; subtitle: string; href: string }`. Behaviour:
    - Firestore reads, each with `limit(5)`;
    - phone → `users` where `phoneNumber == value`;
    - reference → `bookings` where `reference == value`;
    - id → a direct `getDoc` in `organizers`, `events`, `experiences`, `users` and `bookings`;
    - text → prefix queries on `publicOrganizers.displayName` and `events.title`, using `orderBy(field)`, `startAt(Capitalised)` and `endAt(Capitalised + "\uf8ff")`.
  - `href` mapping:
    - organizer → `/partners/{id}`;
    - event → `/events/{id}`;
    - experience → `/events?experience={id}`;
    - booking → `/events/{eventId}?booking={id}`;
    - customer → `/customers/{uid}`.
- `lib/use-attention.ts` produces `useAttention(): { items: AttentionItem[]; total: number; byRoute: Record<"approvals" | "risk" | "refunds", number>; loading: boolean }`, built from `useGovernanceCollection` with the existing `buildAttentionQueue`.
- `AppShell({ children })` renders the page glow, the Rail (left, 84px; expands to 240px on hover/focus or when pinned, with the pin state in `localStorage` under `pulse.rail.pinned`, wrapped in try/catch), the TopBar and `<main id="main">`, plus a skip link.
- The Rail shows the groups from `NAV` with icons, and the `badge` counts from `useAttention`/`live` in volt. The active item gets a violet tint, and `aria-current="page"`.
- The TopBar shows the date and "Good morning/afternoon/evening, {first name}" (IST), the search trigger (`⌘K` / `Ctrl K`), `EnvBadge`, the Live dot, the bell (opens `NotificationsDrawer`) and the operator menu (role label and Sign out).
- `EnvBadge` reads `NEXT_PUBLIC_DATA_MODE` / `NEXT_PUBLIC_APP_ENV`: EMULATOR (info), STAGING (warn), PRODUCTION (err).
- `CommandPalette`:
  - opens with ⌘K, Ctrl K or `/`;
  - shows a "Go to" section from `pageMatches` immediately;
  - runs `searchEntities` debounced by 250 ms, with sections by kind;
  - ↑/↓/Enter navigation and Esc to close;
  - shows hints when the input is empty ("Try a phone number, PLS-XXXXXX, or an organizer name").

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, expect, it } from "vitest";
import { classifyQuery, pageMatches } from "@/lib/search";
import { NAV } from "@/lib/nav";
describe("classifyQuery", () => {
  it("detects phones in any typed form", () => {
    for (const raw of ["98765 43210", "+91 98765-43210", "09876543210", "9876543210"]) {
      expect(classifyQuery(raw)).toEqual({ kind: "phone", value: "+919876543210" });
    }
  });
  it("detects booking references", () => {
    expect(classifyQuery("pls-7hk2qx")).toEqual({ kind: "reference", value: "PLS-7HK2QX" });
  });
  it("detects document ids", () => {
    expect(classifyQuery("wD6QcJ9C3nqQFjNwa1cLLqAj4kCQ").kind).toBe("id");
  });
  it("falls back to text", () => {
    expect(classifyQuery("  Weekend Cricket ")).toEqual({ kind: "text", value: "weekend cricket" });
  });
});
describe("pageMatches", () => {
  it("finds pages by label or keyword, label first", () => {
    expect(pageMatches("refund", NAV)[0]?.href).toBe("/refunds");
    expect(pageMatches("kyc", NAV).map((n) => n.href)).toContain("/approvals");
  });
});
```

- [ ] **Step 2:** Run `npx vitest run tests/unit/search.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `lib/search.ts` (pure parts first), then the shell components. `app/(console)/layout.tsx` keeps its session-gate logic and wraps the page in the new `AppShell`. `RoleRestricted` and `SessionStateScreen` are restyled with the kit (`Empty` + `Button`).
- [ ] **Step 4:** Run `npm run verify`. Expected: PASS.
- [ ] **Step 5:** Manual check: with the emulator console running (`npx next dev -p 13000`), sign in as `admin@pulse.test`. Check:
  - the rail, the badges (Approvals shows the pending count) and ⌘K (type "kyc", and type "+91 9000000001");
  - the EMULATOR badge;
  - sign out.
- [ ] **Step 6:** Commit: `Console: new shell with rail, top bar, real search, env badge, notifications`.

### Task 6: Sign-in and session screens

**Files:** rewrite `app/(auth)/login/page.tsx`, `app/(auth)/otp/page.tsx` (if it is the verify-email step) and `app/(auth)/verifying/page.tsx`, plus `components/console/{ConfigurationNotice,SessionStateScreen,EnvironmentBadge}.tsx` (restyle; reuse `EnvBadge`).

**Interfaces:** consumes `useAdminSession()`: `{ state, configProblem, user, roleId, consoleRole, error, signIn, signOut, resetPassword, sendVerification, refreshSession }`. Keep every existing behaviour and message; this task is visual and copy only.

- [ ] **Step 1:** Rebuild the login as the mockup's split layout:
  - Left: the heartbeat logo (SVG polyline `0,13 9.5,13 13.6,3 18.7,22 23.1,9.6 25.8,13 34,13` in volt), the headline "Run the city's *pulse.*" and the stickers (🪪 Approve hosts, 🛡 Keep it safe, 💸 Move the money, 📈 Watch it grow), with the footnote "Operators only · every action is audited".
  - Right: a glass card with "Welcome back 👋", email and password fields (with show/hide), a volt "Sign in →" button with a loading state, "Forgot password?" (calls `resetPassword` and toasts the result), and `EnvBadge`.
  - On narrow screens the left column collapses above the card.
  - Keep `ConfigurationNotice` when misconfigured, the disabled/role errors and the verify-email resend cooldown (`verificationCooldownRemaining`).
- [ ] **Step 2:** Run `npm run verify` and `npm run smoke` (login config smoke). Expected: PASS.
- [ ] **Step 3:** Manual check: try a wrong password (an inline error), then the real login, which lands on `/`.
- [ ] **Step 4:** Commit: `Console: PULSE sign-in and session screens`.

## Phase 2: Command Center and Live

### Task 7: Metrics engine

**Files:**
- Create: `lib/metrics.ts` (pure), `lib/metrics-firestore.ts` (runners), `lib/use-metric.ts` (hook).
- Modify: `firebase/firestore/firestore.indexes.json`, `firebase/scripts/check-indexes.mjs` (if it needs to learn the console's queries; read how it discovers queries first).
- Test: `tests/unit/metrics.test.ts`.

**Interfaces:**
- `lib/metrics.ts` produces:
  - `type RangeKey = "today" | "7d" | "30d"`;
  - `interface TimeRange { start: Date; end: Date }`;
  - `rangeFor(key: RangeKey, now: Date): TimeRange`: an IST day start; 7d/30d include today;
  - `previousRange(r: TimeRange): TimeRange`: the same length, immediately before;
  - `dailyBuckets(days: number, now: Date): TimeRange[]`: IST days, oldest first;
  - `readNumber(v: unknown): number | null`: finite numbers only;
  - `ratio(n: number | null, d: number | null): number | null`: null when either is null or d is 0;
  - `metricErrorMessage(err: unknown): string`. Mapping:
    - `failed-precondition` → "This number needs a Firestore index that isn't deployed yet."
    - `permission-denied` → "Your role can't read this."
    - `unavailable` → "Can't reach Firestore. Check your connection."
    - anything else → "This number couldn't load."
  - `METRIC_SPECS`, a record of query descriptors `{ collection: string; where: Array<[field, op, value]>; dateField: string; agg: { kind: "count" } | { kind: "sum"; field: string } }` for `grossBookings`, `confirmedBookings`, `refundsAmount`, `newCustomers`, `ticketsIssued`, `ticketsCheckedIn`, `activeOrganizers` (no date field) and `commission`. Field names come from the spec's metric table, verified against `firebase/functions/src` (bookings: `status`, `amountMinor`, `createdAt`; tickets: check the `checkedIn`/`status` field in `commerce/tickets.ts` and `checkin.ts`; refunds: `amountMinor`, `createdAt`; ledger: `account`, `kind`, `amountMinor`, `createdAt`).
- `lib/metrics-firestore.ts` produces `runMetric(spec, range?: TimeRange): Promise<number>`, which builds `query(collection(db, spec.collection), ...where..., where(dateField, ">=", Timestamp.fromDate(start)), where(dateField, "<", Timestamp.fromDate(end)))` and returns `getAggregateFromServer(q, { v: count() | sum(field) })`.
- `lib/use-metric.ts` produces `useMetric(specKey, range, compare?: boolean): { value: number | null; previous: number | null; loading: boolean; error: string | null; retry: () => void }`, with a module-level cache of 60 s keyed by spec, start and end. It also produces `useSeries(specKey, days = 30): { points: Array<{ label: string; value: number }>; loading; error; retry }`, which runs the daily buckets concurrently.

- [ ] **Step 1: Write the failing tests.**

```ts
import { describe, expect, it } from "vitest";
import { dailyBuckets, metricErrorMessage, previousRange, rangeFor, ratio, readNumber } from "@/lib/metrics";

describe("IST ranges", () => {
  it("today starts at IST midnight even just after it", () => {
    const now = new Date("2026-10-08T19:00:00Z"); // 00:30 IST on 9 Oct
    const r = rangeFor("today", now);
    expect(r.start.toISOString()).toBe("2026-10-08T18:30:00.000Z");
    expect(r.end.toISOString()).toBe("2026-10-09T18:30:00.000Z");
  });
  it("7d covers six previous days plus today", () => {
    const r = rangeFor("7d", new Date("2026-10-09T06:00:00Z"));
    expect(r.start.toISOString()).toBe("2026-10-02T18:30:00.000Z");
  });
  it("previous range is the same length right before", () => {
    const r = rangeFor("7d", new Date("2026-10-09T06:00:00Z"));
    const p = previousRange(r);
    expect(p.end.getTime()).toBe(r.start.getTime());
    expect(p.end.getTime() - p.start.getTime()).toBe(r.end.getTime() - r.start.getTime());
  });
  it("daily buckets are 30 contiguous IST days, oldest first", () => {
    const b = dailyBuckets(30, new Date("2026-10-09T06:00:00Z"));
    expect(b).toHaveLength(30);
    expect(b[29]!.start.toISOString()).toBe("2026-10-08T18:30:00.000Z");
    for (let i = 1; i < b.length; i++) expect(b[i]!.start.getTime()).toBe(b[i - 1]!.end.getTime());
  });
});

describe("defensive numbers", () => {
  it("reads only finite numbers", () => {
    expect(readNumber(5)).toBe(5);
    expect(readNumber(undefined)).toBeNull();
    expect(readNumber("12")).toBeNull();
    expect(readNumber(Number.NaN)).toBeNull();
  });
  it("ratio never divides by zero", () => {
    expect(ratio(1, 4)).toBe(0.25);
    expect(ratio(1, 0)).toBeNull();
    expect(ratio(null, 4)).toBeNull();
  });
});

describe("metric errors", () => {
  it("explains index, permission and network failures", () => {
    expect(metricErrorMessage({ code: "failed-precondition" })).toMatch(/index/);
    expect(metricErrorMessage({ code: "permission-denied" })).toMatch(/role/);
    expect(metricErrorMessage({ code: "unavailable" })).toMatch(/connection/);
    expect(metricErrorMessage(new Error("x"))).toBe("This number couldn't load.");
  });
});
```

- [ ] **Step 2:** Run `npx vitest run tests/unit/metrics.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `lib/metrics.ts`. IST start of day: `const IST = 330 * 60_000; const dayStart = (t: number) => Math.floor((t + IST) / 86_400_000) * 86_400_000 - IST;`. Then implement the runners and hooks.
- [ ] **Step 4:** Add composite indexes for every `METRIC_SPECS` query with an equality plus a date range (e.g. `bookings: status ASC, createdAt ASC`; `ledgerEntries: account ASC, kind ASC, createdAt ASC`). Skip any that already exist. Run `npm run check:indexes` from the repo root with `PULSE_DIR="D:/flutter works/experience_os"`. Expected: "all served".
- [ ] **Step 5:** Run `npm run verify`. Expected: PASS.
- [ ] **Step 6:** Commit: `Console: metrics engine (IST ranges, aggregation queries, indexes)`.

### Task 8: Command Center

**Files:** rewrite `app/(console)/page.tsx`. Create `components/overview/{KpiBento,NeedsYou,LiveNowCard,TopCities,PrivilegedActivity}.tsx`.

**Interfaces:** consumes `useMetric`, `useSeries`, `useAttention`, `useGovernanceCollection("auditEvents")`, `isPrivilegedAudit`, the kit, and `inrCompact` / `countCompact` / `deltaPct`. Produces `useLiveEvents()` in `lib/use-live-events.ts`, which subscribes to `events` where `startsAt` is between now − 12 h and now + 12 h (`orderBy startsAt`, `limit 100`). It returns `{ live: Ev[]; soon: Ev[]; loading; error; retry }`, where `Ev` has `{ id, title, orgId, city, startsAt, endsAt, status, capacity, taken, checkedIn? }` and `taken = confirmedPaidBookings + confirmedComplimentaryBookings` from `occupancy` (via `readNumber`). This hook is shared with Task 9.

- [ ] **Step 1:** Build the page from the mockup:
  - `PageHeader` with the greeting overline ("Thu, 9 Oct · Good evening, {name} ✦") and a headline picked from state:
    - "The city's *buzzing* tonight." when there are live events;
    - "All *quiet* right now." when there are none;
    - "*{n} things* need you." when the attention total is above 0 and nothing is live.
  - The subtitle reads `{attention} things need you · {live} events live · {inrCompact(gross today)} moved today`.
  - Range chips (Today / 7 days / 30 days, kept in `?range=` via `useSearchParams`).
  - Bento grid, 12 columns:
    - a gross card (span 5, with `Sparkline` from `useSeries("grossBookings")`);
    - bookings, check-in % (`ratio(checkedIn, issued)`), refund % (`ratio(refunds, gross)`), new customers and active organizers;
    - `NeedsYou` (span 7, row-span 2; queue rows with `Glyph` emoji by kind — 🪪 KYC, 🧩 experience, 🚨 risk, 💸 refund, 🏦 settlement — the title, `relTime` meta, and a volt "Review" on the first row only, ghost "Open" on the rest, linking to the item's route);
    - `LiveNowCard` (span 5);
    - `TopCities` (span 5; `BarList` of events by city in range, from `useLiveEvents`' wider query, or a bounded `events` read in range with `limit 250`, grouping on `venue.city`);
    - `PrivilegedActivity` (the last 6, as a `Timeline`).
  - Each card handles its own loading, error and empty states. Example empty state: "Nothing needs you 🎉 — the queue is clear."
- [ ] **Step 2:** Run `npm run verify`. Expected: PASS.
- [ ] **Step 3:** Manual check on the emulator: the KPI cards show 0 / "new" / "—" honestly; Needs-you lists the 3 seeded KYC applications; the range chips change the URL and the numbers.
- [ ] **Step 4:** Commit: `Console: Command Center bento dashboard`.

### Task 9: Live

**Files:** create `app/(console)/live/page.tsx` and `components/live/LiveEventRow.tsx`.

- [ ] **Step 1:**
  - The header shows "Live now" with a pulsing ok dot and the count.
  - Two sections, **Happening now** and **Starting in the next 12 h**.
  - Each row has: category emoji, title, city, organizer name (`useLiveDocument("publicOrganizers", orgId)`), a `ProgressBar` of taken vs capacity, `relTime` to start or end, a phase `Badge`, and "Open" (`/events/{id}`).
  - The "Cancel event" danger button opens `Sheet` (danger, `requireReason`, `minReason` 10) → `adminCancelEvent({ requestId: newRequestId("cancel"), eventId, reason })`, then a toast with the server result.
  - Errors use the existing `lib/console/errors.ts` describer.
  - Empty state: "No events running right now 🌙".
- [ ] **Step 2:** `npm run verify`. Expected: PASS.
- [ ] **Step 3:** Commit: `Console: Live events monitor`.

## Phase 3: Marketplace

### Task 10: Approvals split view

**Files:** rewrite `components/governance/ApprovalsWorkspace.tsx` as `components/approvals/{ApprovalsView,CaseList,CaseDetail,ExperiencePreview}.tsx`. Point `app/(console)/approvals/page.tsx` at `ApprovalsView`.

**Interfaces:**
- Consumes `useGovernanceCollection("governanceCases")`, `isOpenCase`, `caseTargetFields`, `useLiveDocument` (the case target: `organizerApplications/{uid}` or `experiences/{id}`), `decideCase`, `buildDecideCasePayload`, `RequestIdBook`, and `reissueOrganizerCode` / `canReissueOrganizerCode`.
- Read `ApprovalsWorkspace.tsx` first. It holds the current decision logic (`expectedVersion`, conflict handling), which must be preserved exactly.

- [ ] **Step 1:** Build the view:
  - Left list (360px):
    - tabs All / Hosts / Experiences / Info requested, with counts;
    - rows show a `Glyph`, the title, a meta line (city · category · `relTime`) and a status `Badge`;
    - J/K keys move the selection, which is kept in `?case=`.
  - Right detail:
    - header with the title, Badges and copyable IDs;
    - for KYC, every application answer (kind, display/legal name, city, categories as chips, about, contact);
    - for an experience, a `PhoneFrame` preview that renders the experience the way PULSE shows it (an art gradient from the category, title, tagline, chips for date/city/price, highlights, rules, safety), next to a fields table and the previous-version diff when `previousVersion` or revision data exists;
    - a sticky action bar: Approve (volt, key A), Request changes (ghost, key C) and Reject (danger, key R). Each opens a `Sheet` with a required note, then `decideCase`, then a toast;
    - on a version conflict: an inline "This changed since you opened it" plus a Refresh button.
  - Empty state: "Inbox zero 🎉 No one is waiting for approval."
- [ ] **Step 2:** `npm run verify`. Expected: PASS.
- [ ] **Step 3:** Manual check: approve "Weekend Cricket Club" on the emulator. The toast appears, the case leaves the open list, and the audit page shows the decision. Request changes on "Clay & Coffee".
- [ ] **Step 4:** Commit: `Console: Approvals split view with PULSE preview`.

### Task 11: Organizers and Organizer 360

**Files:**
- Create: `app/(console)/partners/[orgId]/page.tsx`, `components/organizers/{OrganizerGrid,Organizer360}.tsx`, `lib/use-query.ts`.
- Modify: `app/(console)/partners/page.tsx`.

**Interfaces:** produces `lib/use-query.ts` `useBoundedQuery<T>(key: string | null, build: () => Query, map: (id: string, data: DocumentData) => T, max = 250): { rows: T[]; loading; error; truncated; retry }`. It is a one-shot `getDocs` read with `limit(max + 1)` that sets `truncated` when more come back. Tasks 12–17 reuse it.

- [ ] **Step 1:** Build the grid:
  - cards with `Avatar`, display name, city, category chips, a status `Badge`, and since-date;
  - filter chips All / Active / Paused / Blocked;
  - a search box that filters the loaded rows.
  - Data: `useGovernanceCollection("organizers")` merged with `publicOrganizers` for display fields.
- [ ] **Step 2:** Build the 360 at `/partners/[orgId]`:
  - header (avatar, name, status, verified, city, copy orgId);
  - Stat row:
    - gross: sum of the org's bookings' `amountMinor` with status confirmed/completed, via aggregation with `where orgId ==`;
    - events count;
    - average rating, from `reviews` where `orgId ==` (bounded read, mean of `rating`);
    - refunds amount.
  - Tabs:
    - Events (DataTable → `/events/{id}`);
    - Experiences;
    - Money (`eventCommercials` / commercial agreement, settlements list);
    - Team (`memberships` where `orgId ==`);
    - Timeline (`auditEvents` where `entityId == orgId`, or the existing audit field; check the `auditEvents` doc shape).
  - Actions:
    - Pause / Block / Reactivate → `Sheet` → `setEntityStatus({ entityType: "organizer", … expectedVersion })`;
    - Reissue code (if `canReissueOrganizerCode`) → `OrganizerCodeModal` (restyled);
    - Propose terms → `Sheet` with commission % and cadence → `proposeCommercialAgreement`.
  - Add the composite indexes the new `where orgId ==` + order queries need, and run `check:indexes`.
- [ ] **Step 3:** `npm run verify` and `check:indexes`. Expected: PASS.
- [ ] **Step 4:** Commit: `Console: Organizers grid and Organizer 360`.

### Task 12: Experiences & Events and Event 360

**Files:**
- Create: `app/(console)/events/[eventId]/page.tsx`, `components/events/{EventsTable,Event360}.tsx`.
- Modify: `app/(console)/events/page.tsx`.

- [ ] **Step 1:** Build the table:
  - Tabs Upcoming / Live / Past / Drafts & review / Cancelled; filters for city and category chips;
  - `DataTable` columns: title (emoji + name), organizer, city, starts (`relTime` + date), fill (`ProgressBar`), price (`inrMinor(priceMinor)`), status `Badge`.
  - Data: `useBoundedQuery` on `events`, ordered by `startsAt`.
- [ ] **Step 2:** Build the 360:
  - header (title, status, organizer link, city, date, copy ID);
  - Stats: capacity vs taken, check-ins (count of tickets `eventId ==` and checked in), revenue (bookings sum), commission (ledger sum `eventId ==`), and refunds.
  - Tabs:
    - Bookings (DataTable: reference, alias, spots, amount, status, created; `?booking=` highlights a row);
    - Reviews;
    - Timeline (audit).
  - Actions: Cancel event (Sheet → `adminCancelEvent`), Pause/Block (`setEntityStatus` with `entityType: "event"`).
- [ ] **Step 3:** `npm run verify` and `check:indexes`. Expected: PASS.
- [ ] **Step 4:** Commit: `Console: Experiences & Events table and Event 360`.

### Task 13: Arenas

**Files:** `app/(console)/arenas/page.tsx`, `components/arenas/ArenasView.tsx`.

- [ ] **Step 1:**
  - Card list (name, city, capacity, status) with filter chips.
  - A Drawer shows the details and the status actions (`setEntityStatus` with `entityType: "arena"`).
  - Empty state: "No arenas yet 🏟".
- [ ] **Step 2:** `npm run verify`. Then commit: `Console: Arenas`.

## Phase 4: Trust and Money

### Task 14: Customers and Customer 360

**Files:**
- Create: `app/(console)/customers/[uid]/page.tsx`, `components/customers/{CustomerSearch,Customer360}.tsx`.
- Modify: `app/(console)/customers/page.tsx`.

- [ ] **Step 1:** The search page has one large input, using `classifyQuery`: a phone looks up `users` where `phoneNumber ==`, an id is a direct get, and text does a prefix search on `displayName` if that field exists on `users` (verify; otherwise show "Search by phone or ID"). Below the input, "Newest customers" lists `users` where `scope != platform`, ordered by `createdAt` desc, limit 20.
- [ ] **Step 2:** The 360 has:
  - a header with `Avatar`, display name or "PULSE member", the phone shown with `maskPhone` and a "Reveal" toggle, joined `relTime`, and status;
  - Stats: bookings count, spent (sum), refunds, reviews;
  - tabs Bookings / Payments / Refunds / Reviews / Safety (`customerSafety/{uid}` when readable) / Legal holds.
- [ ] **Step 3:** `npm run verify` and `check:indexes`. Commit: `Console: Customers search and Customer 360`.

### Task 15: Risk and Reviews

**Files:** `app/(console)/risk/page.tsx`, `app/(console)/reviews/page.tsx`, `components/trust/{RiskView,ReviewsFeed}.tsx`. They replace `GovernanceRoutePage`/`ReviewsWorkspace` usage for these routes.

- [ ] **Step 1:** **Risk:** a severity-sorted list (critical first) with `Glyph` 🚨/⚠️, the entity link, `relTime` and a status. A Drawer holds the details and the actions Resolve / Keep open / Block entity (`setEntityStatus` with `"risk-alert"`, or the existing action mapping in `GovernanceRoutePage`; read it and preserve it).
- [ ] **Step 2:** **Reviews:** a masonry-ish card feed with stars (★ in volt), text, event link, author alias and date. Filters All / Published / Hidden / Flagged. Hide/Publish → Sheet → `moderateReview`.
- [ ] **Step 3:** `npm run verify`. Commit: `Console: Risk and Reviews`.

### Task 16: Revenue

**Files:** `app/(console)/revenue/page.tsx`, `components/money/RevenueView.tsx`.

- [ ] **Step 1:**
  - Range chips.
  - Stats: gross, commission, refunds and net (gross − refunds), each with a delta.
  - An `AreaChart` of the 30-day gross (`useSeries`).
  - `BarList` "By city" and "By category" from a bounded `events` read with `startsAt` in range, `limit 250`, value = `taken × priceMinor`, captioned "Booked value by event date".
  - A `Truncated` note when the read is truncated.
- [ ] **Step 2:** `npm run verify`. Commit: `Console: Revenue`.

### Task 17: Refunds, Settlements and Commercials

**Files:** `components/money/{RefundsView,SettlementsView,CommercialsView}.tsx`, which replace the current workspaces; update the three route pages.

- [ ] **Step 1:** Read `RefundsWorkspace.tsx`, `SettlementsWorkspace.tsx` and `CommercialsWorkspace.tsx`, and keep **all** of their logic: dual control (`needsRefundDualControl`, `needsSettlementDualControl`, `refundStage`), `settlementActionsFor`, `CONFIRM_PHRASES` / `isConfirmed` typed confirmations, `periodEndFromDate`, and the payout reference. Only the presentation is rebuilt:
  - Tabs by stage, with counts.
  - A DataTable (amount in `.num`, reason label, age, stage Badge, "Needs 2nd approver" in warn).
  - A Drawer with the details and actions; volt for the single primary action.
  - Sheets for notes and typed confirmations.
- [ ] **Step 2:** `npm run verify` (the existing `money.test.ts` and `actions.test.ts` must stay green). Commit: `Console: Refunds, Settlements, Commercials`.

## Phase 5: Control, seed data and polish

### Task 18: Control screens

**Files:** `components/control/{AuditTimeline,PoliciesView,LegalHoldsView,SystemHealthView,OperatorsView}.tsx`. They replace the existing workspaces; update the routes `/audit`, `/policies`, `/legal-holds`, `/system` and `/operators`.

- [ ] **Step 1:** Preserve all of the existing logic (`fetchOlderAuditEvents` paging, `latestJobRuns`, `jobErrorLines`, operator role/status rules, legal hold place/release). New presentation:
  - **Audit:** a `Timeline` grouped by IST day, with filter chips for actor role, action and entity, a search box, and "Load older".
  - **System health:** a card per job with a status dot, last run `relTime`, counts and expandable errors.
  - **Operators:** a table with role and status pickers in a Sheet.
  - **Legal holds:** a list with a Drawer.
  - **Policies:** readable cards from `policyVersions`.
- [ ] **Step 2:** `npm run verify` (`audit.test.ts`, `system-records.test.ts` and `operator-access.test.ts` stay green). Commit: `Console: Control screens`.

### Task 19: Emulator seed

**Files:**
- Rewrite: `firebase/scripts/seed-emulator.ts` (keep the guards), plus `firebase/scripts/reset-emulator.ts` if needed.
- Modify: the root `package.json` (`"seed:emulator": "node --experimental-strip-types firebase/scripts/seed-emulator.ts"`, or run it through `tsx` if strip-types is unavailable on Node 22; check the `node --version` behaviour) and `apps/operations-web/README` or `DEPLOYMENT.md` (a "Local data" section).

**Interfaces:** it uses only the real callables over HTTP against `127.0.0.1:5001/demo-experience-os/asia-south1/<name>`, the Auth emulator (custom tokens via firebase-admin with `FIREBASE_AUTH_EMULATOR_HOST`) and the admin-claims path. Payments are confirmed with the dev HMAC key `dev-only-razorpay_key_secret-not-for-production` through the existing `confirmPayment` contract; read `commerce/payments.ts` for the signature format.

- [ ] **Step 1:** In order, create:
  1. the platform owner `admin@pulse.test` / `PulseAdmin#2026` (verified, `roleId` platform-owner, users doc and audit, the same shape as `bootstrap-platform-owner.mjs`), plus a second super-admin `ops@pulse.test` for dual control;
  2. organizer applicants (5) via `submitOrganizerApplication`; approve 3 with `decideCase` as the admin, and redeem their codes (`redeemOrganizerCode`; the code comes from the decision result or `reissueOrganizerCode`);
  3. for each approved organizer, 2 experiences (`saveExperience`, `submitExperience`, then admin `decideCase` approve), and events with `saveEvent`, `submitEvent`/`publishEvent` in Bengaluru, Pune and Hyderabad: one live now (`startsAt` = now − 1 h), the rest in the next 7 days;
  4. 12 customers, each `reserveSeat` then `createPaymentOrder`/`confirmPayment` (HMAC) on random events, with 2 spots for some;
  5. door check-ins via `scanTicket` for the live event's bookings (around 60%);
  6. one `requestRefund`; two `submitReview` on a completed event (or skip, with a log line, if no completed event can be made legitimately);
  7. `buildSettlement` for one organizer.

  Print a summary table. The run must be idempotent: re-running detects existing users and data by phone/email and skips.
- [ ] **Step 2:** Run it against the running emulator. Expected: the summary prints with no thrown errors, and the console Command Center shows non-zero numbers.
- [ ] **Step 3:** Commit: `Emulator seed through real callables`.

### Task 20: Polish and full walkthrough

- [ ] **Step 1:** Accessibility and detail pass on every route:
  - focus order and ring, an aria-label on icon buttons;
  - headings in order; contrast of text3 on surface;
  - reduced motion (toggle the OS setting or emulate it in Chrome DevTools);
  - 768 px and 1440 px layouts;
  - an empty state on every list;
  - no layout shift when skeletons resolve;
  - en-IN formatting everywhere (grep for `toLocaleString(` and `inr(` and convert).
- [ ] **Step 2:** Use Chrome (claude-in-chrome) to sign in on `http://localhost:13000` and visit every route in `CONSOLE_ROUTES`, plus one Organizer 360, one Event 360 and one Customer 360. Take a screenshot of each. Fix the issues found.
- [ ] **Step 3:** Run `npm run verify` and `npm run check:indexes`. Expected: PASS.
- [ ] **Step 4:** Update `fun_experience_os/README.md` and `apps/operations-web/DEPLOYMENT.md` to describe the new console screens and the `seed:emulator` flow. Remove the mentions of the archived prototype.
- [ ] **Step 5:** Commit: `Console: polish pass and docs`.
