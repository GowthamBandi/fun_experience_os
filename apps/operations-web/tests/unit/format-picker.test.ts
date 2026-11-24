/**
 * The composer's format cards (components/notifications/FormatPicker.tsx): the
 * selected card must follow the chosen format for all five, rendered on the
 * server (no browser) and read back from the markup.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FormatPicker, formatCardClass } from "@/components/notifications/FormatPicker";
import { FORMATS, FORMAT_META, type AnnouncementFormat } from "@/lib/notifications";

const render = (value: AnnouncementFormat, disabled = false) =>
  renderToStaticMarkup(createElement(FormatPicker, { value, onChange: () => undefined, disabled }));

/** [format, aria-checked, data-selected, tabindex, class] per rendered card, in order. */
function cards(html: string) {
  return [...html.matchAll(/<button([^>]*)>/g)].map((m) => {
    const attr = (name: string) => new RegExp(`${name}="([^"]*)"`).exec(m[1]!)?.[1] ?? null;
    return { format: attr("data-format"), checked: attr("aria-checked"), selected: attr("data-selected"), tabIndex: attr("tabindex"), className: attr("class") ?? "" };
  });
}

describe("FormatPicker", () => {
  it.each(FORMATS.map((f) => [f]))("selecting %s highlights exactly that card", (value) => {
    const html = render(value);
    const rows = cards(html);
    expect(rows.map((r) => r.format)).toEqual([...FORMATS]);
    for (const r of rows) {
      const on = r.format === value;
      expect(r.checked).toBe(on ? "true" : "false");
      expect(r.selected).toBe(on ? "true" : "false");
      // Roving tabindex: only the selected card is in the tab order.
      expect(r.tabIndex).toBe(on ? "0" : "-1");
      expect(r.className).toBe(formatCardClass(on, false));
    }
    expect(rows.filter((r) => r.checked === "true")).toHaveLength(1);
    expect(html).toContain('role="radiogroup"');
    for (const f of FORMATS) expect(html).toContain(FORMAT_META[f].label);
  });

  it("switching from Centre popup to Full screen moves the highlight (the reported bug)", () => {
    const before = cards(render("modal"));
    const after = cards(render("fullscreen"));
    expect(before.find((r) => r.format === "modal")!.selected).toBe("true");
    expect(after.find((r) => r.format === "modal")!.selected).toBe("false");
    expect(after.find((r) => r.format === "fullscreen")!.selected).toBe("true");
    expect(after.find((r) => r.format === "modal")!.className).not.toContain("bg-[rgba(142,114,255,0.14)]");
    expect(after.find((r) => r.format === "fullscreen")!.className).toContain("bg-[rgba(142,114,255,0.14)]");
  });

  it("selected and unselected cards never share the highlight classes; disabled cards are disabled", () => {
    const on = formatCardClass(true, false).split(" ");
    const off = formatCardClass(false, false).split(" ");
    expect(on).toContain("border-[rgba(142,114,255,0.6)]");
    expect(off).not.toContain("border-[rgba(142,114,255,0.6)]");
    expect(off).not.toContain("bg-[rgba(142,114,255,0.14)]");
    const html = render("sheet", true);
    expect(cards(html)).toHaveLength(5);
    expect((html.match(/disabled=""/g) ?? []).length).toBe(5);
    expect(formatCardClass(true, true)).toContain("cursor-not-allowed");
  });
});
