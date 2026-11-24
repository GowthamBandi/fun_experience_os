import { describe, expect, it } from "vitest";
import { mapsUrl, spotOf } from "@/lib/maps";
import { toTripRow } from "@/lib/trips";

describe("spotOf", () => {
  it("reads a pinned venue and an address guess", () => {
    expect(spotOf({ lat: 12.97, lng: 77.59, pinned: true })).toEqual({ lat: 12.97, lng: 77.59, pinned: true });
    expect(spotOf({ lat: 12.97, lng: 77.59 })).toEqual({ lat: 12.97, lng: 77.59, pinned: false });
  });
  it.each([null, {}, { lat: 12.9 }, { lat: "12.9", lng: "77.5" }, { lat: 95, lng: 77 }, { lat: NaN, lng: 1 }])("no spot in %j", (v) => {
    expect(spotOf(v)).toBeNull();
  });
});

describe("mapsUrl", () => {
  it("opens Google Maps on the spot", () => {
    expect(mapsUrl({ lat: 12.9763472, lng: 77.5929284 })).toBe("https://www.google.com/maps/search/?api=1&query=12.976347,77.592928");
  });
});

describe("trip pickup pins", () => {
  it("keeps an organizer's pin and marks unpinned points", () => {
    const row = toTripRow("t1", {
      draft: {
        pickups: [
          { id: "p1", name: "Majestic", landmark: "Gate 2", time: "9:30 PM", lat: 12.9767, lng: 77.5713 },
          { id: "p2", name: "Silk Board", landmark: "Bus stop", time: "10:00 PM" },
        ],
      },
    });
    expect(row.draft.pickups[0].spot).toEqual({ lat: 12.9767, lng: 77.5713, pinned: true });
    expect(row.draft.pickups[1].spot).toBeNull();
  });
});
