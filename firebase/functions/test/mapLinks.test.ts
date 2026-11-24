import { isGoogleMapsHost, parseMapsCoordinates, resolveMapsLinkCommand, Fetcher } from "../src/catalog/mapLinks";

describe("parseMapsCoordinates", () => {
  it("prefers the place pin (!3d!4d) over the map view (@)", () => {
    const url =
      "https://www.google.com/maps/place/Cubbon+Park/@12.9760,77.5900,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d12.9763472!4d77.5929284!16s";
    expect(parseMapsCoordinates(url)).toEqual({ lat: 12.976347, lng: 77.592928 });
  });

  it.each([
    ["https://maps.google.com/?q=12.9716,77.5946", { lat: 12.9716, lng: 77.5946 }],
    ["https://www.google.com/maps/search/?api=1&query=18.5204%2C73.8567", { lat: 18.5204, lng: 73.8567 }],
    ["https://www.google.com/maps/dir/?api=1&destination=17.385,78.4867", { lat: 17.385, lng: 78.4867 }],
    ["https://www.google.com/maps/place/12.9352,77.6245", { lat: 12.9352, lng: 77.6245 }],
    ["https://www.google.com/maps/@19.0760,72.8777,15z", { lat: 19.076, lng: 72.8777 }],
    ["12.9716, 77.5946", { lat: 12.9716, lng: 77.5946 }],
    ["-33.8688,151.2093", { lat: -33.8688, lng: 151.2093 }],
  ])("reads %s", (input, want) => {
    expect(parseMapsCoordinates(input)).toEqual(want);
  });

  it.each(["https://maps.app.goo.gl/abc123", "Cubbon Park", "0,0", "95.1, 77.5", "12.9, 190.2"])("finds nothing in %s", (input) => {
    expect(parseMapsCoordinates(input)).toBeNull();
  });
});

describe("isGoogleMapsHost", () => {
  it.each(["maps.app.goo.gl", "goo.gl", "google.com", "www.google.com", "maps.google.com", "www.google.co.in", "google.co.in"])(
    "allows %s",
    (h) => expect(isGoogleMapsHost(h)).toBe(true),
  );
  it.each(["evil.com", "google.com.evil.com", "googlex.com", "metadata.google.internal", "169.254.169.254", "localhost"])(
    "refuses %s",
    (h) => expect(isGoogleMapsHost(h)).toBe(false),
  );
});

describe("resolveMapsLinkCommand", () => {
  const chain = (hops: Record<string, string | null>): { fetcher: Fetcher; seen: string[] } => {
    const seen: string[] = [];
    return {
      seen,
      fetcher: async (url) => {
        seen.push(url);
        const location = hops[url] ?? null;
        return { status: location ? 302 : 200, location };
      },
    };
  };

  it("returns coordinates in the link without fetching", async () => {
    const { fetcher, seen } = chain({});
    await expect(resolveMapsLinkCommand({ link: "https://maps.google.com/?q=12.97,77.59" }, fetcher)).resolves.toEqual({
      lat: 12.97,
      lng: 77.59,
    });
    expect(seen).toHaveLength(0);
  });

  it("follows a share link to the place", async () => {
    const { fetcher, seen } = chain({
      "https://maps.app.goo.gl/AbC123": "https://www.google.com/maps/place/Turf/data=!4m2!3d12.9352!4d77.6245",
    });
    await expect(
      resolveMapsLinkCommand({ link: "Turf Park Koramangala https://maps.app.goo.gl/AbC123" }, fetcher),
    ).resolves.toEqual({ lat: 12.9352, lng: 77.6245 });
    expect(seen).toEqual(["https://maps.app.goo.gl/AbC123"]);
  });

  it("refuses to follow a redirect off Google", async () => {
    const { fetcher, seen } = chain({ "https://maps.app.goo.gl/x": "https://evil.example/@12.9,77.6" });
    await expect(resolveMapsLinkCommand({ link: "https://maps.app.goo.gl/x" }, fetcher)).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    expect(seen).toEqual(["https://maps.app.goo.gl/x"]);
  });

  it("refuses non-Google and non-https links", async () => {
    const { fetcher, seen } = chain({});
    for (const link of ["https://example.com/maps", "http://maps.app.goo.gl/x", "http://169.254.169.254/latest"]) {
      await expect(resolveMapsLinkCommand({ link }, fetcher)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    }
    expect(seen).toHaveLength(0);
  });

  it("stops after a few hops and says it found nothing", async () => {
    const loop: Fetcher = async (url) => ({ status: 302, location: url + "x" });
    await expect(resolveMapsLinkCommand({ link: "https://maps.app.goo.gl/a" }, loop)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("trip pickup pins (parseTripDraft)", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { parseTripDraft } = require("../src/trips/model") as typeof import("../src/trips/model");
  const base = { pickups: [{ id: "p1", name: "Majestic", landmark: "Gate 2", time: "9:30 PM" }] };

  it("keeps a pinned spot and leaves unpinned points without one", () => {
    const d = parseTripDraft({
      pickups: [
        { id: "p1", name: "Majestic", landmark: "Gate 2", time: "9:30 PM", lat: 12.9767, lng: 77.5713 },
        { id: "p2", name: "Silk Board", landmark: "Bus stop", time: "10:00 PM" },
      ],
    });
    expect(d.pickups[0]).toMatchObject({ lat: 12.9767, lng: 77.5713 });
    expect(d.pickups[1]).not.toHaveProperty("lat");
    expect(parseTripDraft(base).pickups[0]).not.toHaveProperty("lat");
  });

  it.each([
    [{ lat: 12.9 }],
    [{ lat: 95, lng: 77 }],
    [{ lat: "12.9", lng: "77.5" }],
  ])("refuses a half or bad pin %j", (pin) => {
    expect(() => parseTripDraft({ pickups: [{ ...base.pickups[0], ...pin }] })).toThrow();
  });
});
