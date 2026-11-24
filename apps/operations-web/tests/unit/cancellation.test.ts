import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { experienceDiff, toPreview } from "@/lib/approvals";
import {
  cancellationFlags, cancellationLines, cancellationSummary, cancellationView, hoursLabel, presetRules, readCancellation, type CancellationRules,
} from "@/lib/cancellation";
import { caseTargetFields } from "@/lib/console/records";

const tiers = (...t: Array<[number, number]>) => t.map(([hoursBefore, refundPercent]) => ({ hoursBefore, refundPercent }));
const custom = (over: Partial<CancellationRules> = {}): CancellationRules => ({ allowed: true, cutoffHours: 0, tiers: tiers([48, 100], [24, 50]), preset: "custom", ...over });

describe("plain-words summary", () => {
  it.each([
    ["flexible", "Full refund if you cancel 24+ hours before. 50% back in the last 24 hours."],
    ["moderate", "Full refund if you cancel 3+ days before. 50% back from 3 days to 24 hours. No refund in the last 24 hours."],
    ["strict", "Full refund if you cancel 7+ days before. No refund in the last 7 days."],
    ["none", "No cancellations. Once booked, a spot can't be cancelled."],
  ] as const)("%s preset", (name, text) => {
    expect(cancellationSummary(presetRules(name))).toBe(text);
  });

  it("reads the contract's example word for word", () => {
    expect(cancellationLines(custom({ cutoffHours: 24 }))).toEqual([
      "Full refund if you cancel 48+ hours before.",
      "50% back from 48 to 24 hours.",
      "No cancelling in the last 24 hours.",
    ]);
  });

  it("clips tiers inside the cut-off, merges equal neighbours, says when nothing comes back", () => {
    expect(cancellationSummary(custom({ cutoffHours: 48, tiers: tiers([24, 100]) }))).toBe("Full refund if you cancel 48+ hours before. No cancelling in the last 48 hours.");
    expect(cancellationSummary(custom({ tiers: tiers([72, 100], [48, 100], [0, 50]) }))).toBe("Full refund if you cancel 48+ hours before. 50% back in the last 48 hours.");
    expect(cancellationSummary(custom({ tiers: tiers([0, 100]) }))).toBe("Full refund if you cancel any time before the start.");
    expect(cancellationSummary(custom({ cutoffHours: 6, tiers: tiers([24, 0]) }))).toBe("You can cancel until 6 hours before the start, but there's no refund.");
  });

  it("reads 72 h and longer whole days in days", () => {
    expect([1, 24, 48, 72, 100, 168, 720].map(hoursLabel)).toEqual(["1 hour", "24 hours", "48 hours", "3 days", "100 hours", "7 days", "30 days"]);
  });
});

describe("reviewer flags", () => {
  it("flags No cancellations", () => {
    expect(cancellationFlags(presetRules("none")).map((f) => f.key)).toEqual(["no-cancellations"]);
  });
  it("flags cut-offs over 48 hours, not 48 itself", () => {
    expect(cancellationFlags(custom({ cutoffHours: 72 }))).toEqual([
      expect.objectContaining({ key: "long-cutoff", label: "Cancelling closes 3 days before the start" }),
    ]);
    expect(cancellationFlags(custom({ cutoffHours: 49 }))[0]?.key).toBe("long-cutoff");
    expect(cancellationFlags(custom({ cutoffHours: 48 }))).toEqual([]);
  });
  it("never flags the three standard presets", () => {
    for (const p of ["flexible", "moderate", "strict"] as const) expect(cancellationFlags(presetRules(p))).toEqual([]);
  });
});

describe("reading old and new documents", () => {
  it("an old document with only the one-word policy reads as that preset", () => {
    expect(readCancellation({ cancellationPolicy: "moderate" })).toEqual({ rules: presetRules("moderate"), source: "preset" });
    expect(cancellationView({ cancellationPolicy: "flexible" })).toMatchObject({ label: "Flexible", legacy: true, flags: [] });
  });
  it("the rules object wins over the string; a malformed one falls back to the string", () => {
    expect(readCancellation({ cancellation: presetRules("none"), cancellationPolicy: "none" }).source).toBe("rules");
    expect(readCancellation({ cancellation: { allowed: true, tiers: tiers([24, 100], [48, 50]) }, cancellationPolicy: "strict" })).toMatchObject({ source: "preset", rules: { preset: "strict" } });
  });
  it("nothing usable reads as strict, labelled so", () => {
    expect(cancellationView({})).toMatchObject({ label: "Not set (read as Strict)", legacy: true });
    expect(cancellationView({ cancellationPolicy: "lenient" }).summary).toBe(cancellationSummary(presetRules("strict")));
  });
  it("a preset label is only kept when the rules match it", () => {
    expect(cancellationView({ cancellation: { ...presetRules("flexible"), cutoffHours: 2 } }).label).toBe("Custom");
    expect(cancellationView({ cancellation: { allowed: true, cutoffHours: 0, tiers: tiers([168, 100]) } }).label).toBe("Strict");
  });
});

describe("review screens", () => {
  it("the experience preview shows the rules in plain words, with flags", () => {
    const p = toPreview({ title: "x", cancellation: custom({ cutoffHours: 72, tiers: tiers([96, 100]) }), cancellationPolicy: "custom" });
    expect(p.cancellation.label).toBe("Custom");
    expect(p.cancellation.rules).toEqual(["Full refund if you cancel 4+ days before.", "No refund from 4 to 3 days.", "No cancelling in the last 3 days."]);
    expect(p.cancellation.flags.map((f) => f.key)).toEqual(["long-cutoff"]);
  });

  it("case fields show the rules for experiences and events", () => {
    const x = caseTargetFields("experience-approval", { title: "x", cancellation: presetRules("none"), cancellationPolicy: "none" });
    expect(x.find((f) => f.label === "Cancellation")?.value).toBe("No cancellations · No cancellations. Once booked, a spot can't be cancelled.");
    const e = caseTargetFields("event-approval", { title: "x", cancellationPolicy: "strict" });
    expect(e.find((f) => f.label === "Cancellation")?.value).toBe("Strict · Full refund if you cancel 7+ days before. No refund in the last 7 days.");
    expect(caseTargetFields("event-approval", { title: "x" }).find((f) => f.label === "Cancellation")?.value).toBe("—");
  });

  it("a revision that changes the rules shows one Cancellation row, as customers read it", () => {
    const before = { title: "A", cancellationPolicy: "moderate" };
    const after = { title: "A", cancellationPolicy: "custom", cancellation: custom({ cutoffHours: 24 }) };
    expect(experienceDiff(before, after)).toEqual([
      {
        field: "cancellation",
        label: "Cancellation",
        before: "Moderate · Full refund if you cancel 3+ days before. 50% back from 3 days to 24 hours. No refund in the last 24 hours.",
        after: "Custom · Full refund if you cancel 48+ hours before. 50% back from 48 to 24 hours. No cancelling in the last 24 hours.",
      },
    ]);
    // An old string and the same preset as rules are no change.
    expect(experienceDiff(before, { title: "A", cancellationPolicy: "moderate", cancellation: presetRules("moderate") })).toEqual([]);
  });
});

// The console's copy must say exactly what the server (and the public event page) says.
const backendFile = resolve(__dirname, "../../../../firebase/functions/src/commerce/cancellation.ts");
describe.skipIf(!existsSync(backendFile))("parity with the server's rules (firebase/functions/src/commerce/cancellation.ts)", () => {
  const samples: unknown[] = [
    presetRules("flexible"), presetRules("moderate"), presetRules("strict"), presetRules("none"),
    custom(), custom({ cutoffHours: 24 }), custom({ cutoffHours: 72, tiers: tiers([96, 100]) }),
    custom({ cutoffHours: 2, tiers: tiers([168, 100], [48, 50]) }), custom({ tiers: tiers([720, 100], [72, 75], [24, 25], [0, 0]) }),
    custom({ tiers: tiers([0, 0]) }), custom({ cutoffHours: 6, tiers: tiers([24, 0]) }), custom({ cutoffHours: 720, tiers: tiers([720, 100]) }),
    custom({ tiers: tiers([72, 100], [48, 100], [0, 50]) }), custom({ cutoffHours: 49, tiers: tiers([1, 100]) }),
    { ...presetRules("flexible"), cutoffHours: 2 }, { allowed: true, cutoffHours: 0, tiers: tiers([168, 100]) },
    { allowed: true, tiers: tiers([24, 100], [48, 50]) }, { allowed: "yes" }, null, undefined,
  ];
  const docs = [
    ...samples.map((c) => ({ cancellation: c })),
    ...samples.map((c) => ({ cancellation: c, cancellationPolicy: "moderate" })),
    { cancellationPolicy: "flexible" }, { cancellationPolicy: "strict" }, { cancellationPolicy: "none" }, { cancellationPolicy: "lenient" }, {},
  ];

  it("reads every document to the same rules, words and flags", async () => {
    const server = await import(/* @vite-ignore */ backendFile);
    for (const d of docs) {
      const mine = readCancellation(d as Record<string, unknown>);
      const theirs = server.resolveCancellation(d);
      expect(mine.rules, JSON.stringify(d)).toEqual(theirs.rules);
      expect(mine.source, JSON.stringify(d)).toBe(theirs.source);
      expect(cancellationLines(mine.rules)).toEqual(server.cancellationLines(theirs.rules));
      expect(cancellationFlags(mine.rules).map((f) => [f.key, f.label])).toEqual(server.cancellationFlags(theirs.rules).map((f: { key: string; label: string }) => [f.key, f.label]));
    }
  });
});

describe("Event 360 cancellation panel renders", () => {
  it("shows the label, the plain words and the flag", async () => {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { CancellationPanel } = await import("@/components/events/CancellationPanel");
    const html = renderToStaticMarkup(createElement(CancellationPanel, { event: { cancellation: custom({ cutoffHours: 72, tiers: tiers([96, 100]) }), cancellationPolicy: "custom" } }));
    expect(html).toContain("Cancellation rules");
    expect(html).toContain("Custom");
    expect(html).toContain("Cancelling closes 3 days before the start");
    expect(html).toContain("No cancelling in the last 3 days.");
    const old = renderToStaticMarkup(createElement(CancellationPanel, { event: { cancellationPolicy: "flexible" } }));
    expect(old).toContain("Flexible");
    expect(old).toContain("50% back in the last 24 hours.");
  });
});
