import { cityKey } from "../src/catalog/cityKey";

// Mirrors experience_os test/area_test.dart: app and backend must agree.
const VECTORS: Record<string, string> = {
  "Bengaluru": "bengaluru",
  "Bangalore ": "bengaluru",
  "GURGAON": "gurugram",
  "Gurugram": "gurugram",
  "New Delhi": "delhi",
  "Navi-Mumbai": "navi mumbai",
  "Bombay": "mumbai",
  "Hyderābād": "hyderabad",
  "Secunderabad": "hyderabad",
  "Cochin": "kochi",
  "  Pune  ": "pune",
  "Vizag": "visakhapatnam",
};

describe("cityKey", () => {
  for (const [input, key] of Object.entries(VECTORS)) {
    it(`"${input}" → ${key}`, () => expect(cityKey(input)).toBe(key));
  }
});
