/**
 * City names → the key events are matched on, so "Bangalore " and
 * "Bengaluru" are one city. Must stay identical to the PULSE app's
 * `cityKey` (experience_os lib/src/data/location/area.dart): the app
 * queries `venue.cityKey == cityKey(person's city)`. Shared vectors live in
 * test/cityKey.test.ts and the app's test/area_test.dart.
 */
export const CITY_ALIASES: Readonly<Record<string, string>> = {
  bangalore: "bengaluru",
  bombay: "mumbai",
  madras: "chennai",
  calcutta: "kolkata",
  gurgaon: "gurugram",
  "new delhi": "delhi",
  poona: "pune",
  trivandrum: "thiruvananthapuram",
  cochin: "kochi",
  ernakulam: "kochi",
  mysore: "mysuru",
  baroda: "vadodara",
  benares: "varanasi",
  banaras: "varanasi",
  vizag: "visakhapatnam",
  secunderabad: "hyderabad",
  mangalore: "mangaluru",
  pondicherry: "puducherry",
};

const ACCENTS: Readonly<Record<string, string>> = {
  "ā": "a", "á": "a", "à": "a", "â": "a", "ä": "a",
  "ē": "e", "é": "e", "è": "e", "ê": "e",
  "ī": "i", "í": "i", "ì": "i", "î": "i",
  "ō": "o", "ó": "o", "ò": "o", "ô": "o", "ö": "o",
  "ū": "u", "ú": "u", "ù": "u", "û": "u", "ü": "u",
  "ṇ": "n", "ṅ": "n", "ñ": "n", "ṭ": "t", "ḍ": "d", "ṣ": "s", "ś": "s",
};

export function cityKey(name: string): string {
  const plain = [...name.toLowerCase()]
    .map((c) => ACCENTS[c] ?? c)
    .join("")
    .replace(/[^a-z]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  return CITY_ALIASES[plain] ?? plain;
}
