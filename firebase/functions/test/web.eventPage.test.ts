import { buildView, eventIdFromPath, renderEventPage, type Site } from "../src/web/eventPage";

const site: Site = {
  origin: "https://experience-os-staging.web.app",
  storeUrl: "https://play.google.com/store/apps/details?id=app.pulse.experience",
  androidPackage: "app.pulse.experience",
};
const NOW = Date.parse("2026-10-08T12:00:00+05:30");
const ts = (iso: string) => ({ toMillis: () => Date.parse(iso) });
const event = {
  status: "published",
  title: "Board Game Night",
  category: "social",
  orgId: "org1",
  experienceId: "exp1",
  startsAt: ts("2026-10-15T19:00:00+05:30"),
  endsAt: ts("2026-10-15T22:00:00+05:30"),
  venue: { name: "Dice Cafe", area: "Jubilee Hills", city: "Hyderabad", address: "Road 36, Plot 7", lat: 17.43, lng: 78.41 },
  capacity: { maxPhysicalCapacity: 12, blockedSlots: 0 },
  remainingSellableCapacity: 9,
  priceMinor: 49900,
  cancellationPolicy: "flexible",
};
const exp = { tagline: "Meet new friends over games" };
const org = { name: "Kiran Board Games" };
const ID = "lqMCpZnKemOjc8hfXOdP";

describe("eventIdFromPath", () => {
  it("accepts /e/{id}", () => expect(eventIdFromPath(`/e/${ID}`)).toBe(ID));
  it("accepts a trailing slash", () => expect(eventIdFromPath(`/e/${ID}/`)).toBe(ID));
  it.each(["/e/../x", "/e/<script>", "/e/", "/e/short", `/e/${"a".repeat(80)}`, "/x/abcdefghijk", "/e/abc def ghijk"])(
    "refuses %s",
    (p) => expect(eventIdFromPath(p)).toBeNull(),
  );
});

describe("cancellation rules in plain words", () => {
  const policy = (e: Record<string, unknown>, x: Record<string, unknown> | null = exp) => {
    const v = buildView(ID, { ...event, ...e }, x, org, NOW);
    return v.kind === "unavailable" ? null : v.policy;
  };
  it("an old event's one-word preset reads as its rules", () => {
    expect(policy({ cancellationPolicy: "moderate" })).toBe(
      "Full refund if you cancel 3+ days before. 50% back from 3 days to 24 hours. No refund in the last 24 hours. If the organizer cancels, you get a full refund.",
    );
  });
  it("the organizer's own rules, with a cut-off", () => {
    const cancellation = { allowed: true, cutoffHours: 24, tiers: [{ hoursBefore: 48, refundPercent: 100 }, { hoursBefore: 24, refundPercent: 50 }], preset: "custom" };
    expect(policy({ cancellation, cancellationPolicy: "custom" })).toBe(
      "Full refund if you cancel 48+ hours before. 50% back from 48 to 24 hours. No cancelling in the last 24 hours. If the organizer cancels, you get a full refund.",
    );
  });
  it("No cancellations, escaped on the page", () => {
    const v = buildView(ID, { ...event, cancellation: { allowed: false, cutoffHours: 0, tiers: [], preset: "none" }, cancellationPolicy: "none" }, exp, org, NOW);
    expect(renderEventPage(v, site).html).toContain("No cancellations. Once booked, a spot can&#39;t be cancelled. If the organizer cancels, you get a full refund.");
  });
  it("falls back to the experience's rules, then strict", () => {
    expect(policy({ cancellationPolicy: undefined }, { cancellationPolicy: "flexible" })).toMatch(/^Full refund if you cancel 24\+ hours before\./);
    expect(policy({ cancellationPolicy: undefined }, null)).toMatch(/^Full refund if you cancel 7\+ days before\. No refund in the last 7 days\./);
  });
});

describe("renderEventPage", () => {
  const view = buildView(ID, event, exp, org, NOW);
  const { status, html } = renderEventPage(view, site);

  it("is a 200 page with preview tags for WhatsApp/Instagram", () => {
    expect(status).toBe(200);
    expect(html).toContain('<meta property="og:title" content="Board Game Night · Thu, 15 Oct');
    expect(html).toContain(`<meta property="og:url" content="${site.origin}/e/${ID}">`);
    expect(html).toContain(`<meta property="og:image" content="${site.origin}/og/social.png">`);
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(html).toMatch(/og:description" content="[^"]*Jubilee Hills, Hyderabad · ₹499 · 9 spots left\. Hosted by Kiran Board Games\./);
  });

  it("shows the public facts and never the street address", () => {
    expect(html).toContain("Dice Cafe");
    expect(html).toContain("Full refund if you cancel 24+ hours before. 50% back in the last 24 hours. If the organizer cancels, you get a full refund.");
    expect(html).not.toContain("Road 36");
    expect(html).not.toContain("Plot 7");
    expect(html).not.toContain("17.43");
  });

  it("has schema.org Event data for Google", () => {
    const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)![1]);
    expect(ld["@type"]).toBe("Event");
    expect(ld.offers).toMatchObject({ price: "499.00", priceCurrency: "INR", availability: "https://schema.org/InStock" });
    expect(ld.location.address.addressLocality).toBe("Hyderabad");
  });

  it("opens the Android app, falling back to the store", () => {
    expect(html).toContain(`intent://experience-os-staging.web.app/e/${ID}#Intent;scheme=https;package=app.pulse.experience;`);
  });

  it("escapes hostile text in HTML and JSON-LD", () => {
    const evil = buildView(ID, { ...event, title: `"><script>alert(1)</script> & 🎲` }, exp, { name: "<b>x</b>" }, NOW);
    const out = renderEventPage(evil, site).html;
    expect(out).not.toContain("<script>alert(1)");
    expect(out).toContain("&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt; &amp; 🎲");
    expect(out).not.toContain("<b>x</b>");
    expect(out).toContain("\\u003c/script>"); // inside the JSON-LD
  });

  it("free and sold-out wording", () => {
    const free = renderEventPage(buildView(ID, { ...event, priceMinor: 0, remainingSellableCapacity: 0 }, exp, org, NOW), site).html;
    expect(free).toContain("Free");
    expect(free).toContain("Sold out");
  });
});

describe("not shareable", () => {
  it.each(["draft", "submitted", "approved", "cancelled", "rejected"])("%s → 404 'isn’t available'", (status) => {
    const { status: code, html } = renderEventPage(buildView(ID, { ...event, status }, exp, org, NOW), site);
    expect(code).toBe(404);
    expect(html).toContain("This experience isn’t available");
    expect(html).not.toContain("Board Game Night");
  });
  it("missing → 404", () => expect(renderEventPage(buildView(ID, null, null, null, NOW), site).status).toBe(404));
  it("past events say it has happened, without spots", () => {
    const later = Date.parse("2026-10-16T00:00:00+05:30");
    const { status, html } = renderEventPage(buildView(ID, event, exp, org, later), site);
    expect(status).toBe(200);
    expect(html).toContain("This one has happened");
    expect(html).not.toContain("spots left");
  });
});
