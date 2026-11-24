import { describe, expect, it } from "vitest";
import {
  activeCount, addCity, newCityProblem, parseCoord, readServiceCities, removeCity, saveProblem, setActive, toPayload,
  type ServiceCityRow,
} from "@/lib/service-cities";

const HYD: ServiceCityRow = { key: "hyderabad", name: "Hyderabad", state: "Telangana", active: true, lat: 17.385, lng: 78.4867 };
const BLR: ServiceCityRow = { key: "bengaluru", name: "Bengaluru", state: "Karnataka", active: false, lat: null, lng: null };

describe("readServiceCities", () => {
  it("reads the stored list and tolerates partial documents", () => {
    expect(readServiceCities(null)).toEqual([]);
    expect(readServiceCities({ cities: "nope" })).toEqual([]);
    expect(readServiceCities({
      cities: [
        { key: "hyderabad", name: "Hyderabad", state: "Telangana", active: true, lat: 17.385, lng: 78.4867 },
        { key: "bengaluru", name: "Bengaluru", state: "Karnataka", active: false, lat: 12.9 },
        { name: "" },
        null,
        { name: "Pune" },
      ],
    })).toEqual([
      HYD,
      BLR,
      { key: null, name: "Pune", state: "", active: true, lat: null, lng: null },
    ]);
  });
});

describe("adding a city", () => {
  const ok = { name: "  Mysuru ", state: "Karnataka", lat: "", lng: "" };
  it("validates name, state, duplicates and coordinates", () => {
    expect(newCityProblem([HYD], ok)).toBeNull();
    expect(newCityProblem([HYD], { ...ok, name: "M" })).toMatch(/2–60/);
    expect(newCityProblem([HYD], { ...ok, name: "Mys0re" })).toMatch(/only have letters/);
    expect(newCityProblem([HYD], { ...ok, state: "" })).toMatch(/State/);
    expect(newCityProblem([HYD], { ...ok, name: "hyderabad " })).toBe("hyderabad is already on the list.");
    expect(newCityProblem([HYD], { ...ok, lat: "12.3" })).toMatch(/both latitude and longitude/);
    expect(newCityProblem([HYD], { ...ok, lat: "95", lng: "77" })).toMatch(/between -90 and 90/);
    expect(newCityProblem([HYD], { ...ok, lat: "abc", lng: "77" })).toMatch(/between -90 and 90/);
    expect(newCityProblem([HYD], { ...ok, lat: "12.2958", lng: "76.6394" })).toBeNull();
    const full = Array.from({ length: 200 }, (_, i) => ({ ...HYD, name: `City ${i}` }));
    expect(newCityProblem(full, ok)).toMatch(/At most 200/);
  });
  it("adds it active, trimmed, with an optional map point", () => {
    expect(addCity([HYD], { ...ok, lat: "12.2958", lng: "76.6394" })).toEqual([
      HYD,
      { key: null, name: "Mysuru", state: "Karnataka", active: true, lat: 12.2958, lng: 76.6394 },
    ]);
    expect(addCity([], ok)[0]).toMatchObject({ lat: null, lng: null });
  });
  it("parseCoord", () => {
    expect(parseCoord(" ", 90)).toBeNull();
    expect(parseCoord("-12.5", 90)).toBe(-12.5);
    expect(parseCoord("181", 180)).toBeNaN();
  });
});

describe("editing and saving", () => {
  it("toggles, removes and builds the callable payload", () => {
    const rows = setActive([HYD, BLR], 1, true);
    expect(rows[1].active).toBe(true);
    expect(rows[0]).toBe(HYD);
    expect(activeCount(rows)).toBe(2);
    expect(removeCity(rows, 0)).toEqual([rows[1]]);
    expect(toPayload([HYD, BLR])).toEqual([
      { name: "Hyderabad", state: "Telangana", active: true, lat: 17.385, lng: 78.4867 },
      { name: "Bengaluru", state: "Karnataka", active: false },
    ]);
  });
  it("needs a change, at least one city and a reason", () => {
    expect(saveProblem([], [HYD], "Pausing", true)).toMatch(/at least one city/);
    expect(saveProblem([HYD], [HYD], "Pausing", true)).toBe("No changes yet.");
    expect(saveProblem([{ ...HYD, active: false }], [HYD], " a ", true)).toMatch(/reason/);
    expect(saveProblem([{ ...HYD, active: false }], [HYD], "Pausing Hyderabad", true)).toBeNull();
    // First save: the unchanged (empty → typed) list can be saved.
    expect(saveProblem([HYD], [], "Launch", false)).toBeNull();
  });
});
