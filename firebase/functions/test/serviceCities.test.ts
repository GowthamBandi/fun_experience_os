/**
 * Service cities (platform/serviceCities.ts): the super admin's list of
 * cities PULSE serves, and the server refusing event venues outside it.
 * No list yet → every city is allowed.
 */
import {
  ORG, U, call, codeOf, messageOf, clearFirestore, db, seedOrg, seedStandardTeam,
  experienceInput, eventInput, phoneCtx, adminCtx, rid,
} from "./catalog.fixtures";
import { saveExperience, saveEvent, submitEvent, publishEvent } from "../src/catalog";
import { setServiceCities, parseServiceCities, SERVICE_CITIES_DOC } from "../src/platform/serviceCities";

const owner = phoneCtx(U.owner);
const AGREEMENT = "ORG-EVENT-1.0";

const HYD = { name: "Hyderabad", state: "Telangana", active: true, lat: 17.385, lng: 78.4867 };
const BLR = { name: "Bengaluru", state: "Karnataka", active: true, lat: 12.9716, lng: 77.5946 };

async function approvedExperience() {
  const r = await call(saveExperience, experienceInput(), owner);
  await db().doc(`experiences/${r.experienceId}`).update({ status: "approved" });
  return r.experienceId as string;
}

const setCities = (cities: unknown[], ctx: unknown = adminCtx("admin-a")) =>
  call(setServiceCities, { cities, reason: "Launch cities" }, ctx);

let expId: string;

beforeEach(async () => {
  await clearFirestore();
  await seedOrg();
  await seedStandardTeam(["event-aaaa-0001"]);
  expId = await approvedExperience();
});

afterAll(async () => {
  await db().doc(SERVICE_CITIES_DOC).delete();
});

describe("setServiceCities", () => {
  test("admins only; writes the public list with cityKeys; audited", async () => {
    expect(await codeOf(setCities([HYD], owner))).toBe("NOT_PERMITTED");
    expect(await codeOf(setCities([HYD], { auth: { uid: "ops-1", token: { email_verified: true, roleId: "operations", firebase: { sign_in_second_factor: "totp" } } } }))).toBe("NOT_PERMITTED");
    expect(await codeOf(call(setServiceCities, { cities: [HYD] }, adminCtx("admin-a")))).toBe("INVALID_INPUT"); // no reason

    const r = await setCities([{ ...BLR, name: "  Bangalore " }, { ...HYD, active: false }, { name: "Mysuru", state: "Karnataka" }]);
    expect(r.cities).toEqual([
      { key: "bengaluru", name: "Bangalore", state: "Karnataka", active: true, lat: 12.9716, lng: 77.5946 },
      { key: "hyderabad", name: "Hyderabad", state: "Telangana", active: false, lat: 17.385, lng: 78.4867 },
      { key: "mysuru", name: "Mysuru", state: "Karnataka", active: true },
    ]);
    const doc = (await db().doc(SERVICE_CITIES_DOC).get()).data()!;
    expect(doc.cities).toEqual(r.cities);
    expect(doc.updatedBy).toBe("admin-a");
    expect(doc.updatedAt).toBeDefined();
    const audits = await db().collection("auditEvents").where("action", "==", "platform.service-cities-set").get();
    expect(audits.size).toBe(1);
    expect(audits.docs[0].data()).toMatchObject({
      reason: "Launch cities", resourceId: "cities", source: "operations-console",
      before: null, after: { count: 3, active: ["bengaluru", "mysuru"], inactive: ["hyderabad"] },
    });
  });

  test("validation: names, states, duplicates by cityKey, coordinates, size", () => {
    const bad = (cities: unknown) => {
      try {
        parseServiceCities(cities);
      } catch (e) {
        return (e as { code: string; operatorMessage: string });
      }
      return null;
    };
    expect(bad("Hyderabad")?.code).toBe("INVALID_INPUT");
    expect(bad([])?.operatorMessage).toMatch(/at least one city/);
    expect(bad([{ name: "H", state: "Telangana" }])?.code).toBe("INVALID_INPUT");
    expect(bad([{ name: "Hyd3rabad", state: "Telangana" }])?.operatorMessage).toMatch(/only have letters/);
    expect(bad([{ name: "Hyderabad" }])?.operatorMessage).toMatch(/State of Hyderabad/);
    expect(bad([BLR, { ...BLR, name: "Bangalore" }])?.operatorMessage).toMatch(/same city/);
    expect(bad([{ ...HYD, lng: undefined }])?.operatorMessage).toMatch(/both latitude and longitude/);
    expect(bad([{ ...HYD, lat: 123 }])?.code).toBe("INVALID_INPUT");
    expect(bad([{ ...HYD, active: "yes" }])?.code).toBe("INVALID_INPUT");
    expect(bad(Array.from({ length: 201 }, (_, i) => ({ name: `City ${"abcdefghij"[i % 10]}${"abcdefghijklmnopqrstu"[Math.floor(i / 10)]}`, state: "X State" })))?.operatorMessage).toMatch(/At most 200/);
    expect(parseServiceCities(Array.from({ length: 200 }, (_, i) => ({ name: `City ${"abcdefghij"[i % 10]}${"abcdefghijklmnopqrstu"[Math.floor(i / 10)]}`, state: "X State" })))).toHaveLength(200);
    expect(bad([{ name: "Navi Mumbai", state: "Maharashtra" }, { name: "Thiruvananthapuram", state: "Kerala" }])).toBeNull();
  });
});

describe("events need a service city", () => {
  const submit = (eventId: string) => call(submitEvent, { agreementVersion: AGREEMENT, requestId: rid(), orgId: ORG, eventId }, owner);

  test("no list yet → any city is allowed", async () => {
    const r = await call(saveEvent, eventInput(expId, { venue: { name: "Hall", area: "Kothrud", city: "Pune", address: "FC Road, Kothrud" } }), owner);
    expect(await codeOf(submit(r.eventId))).toBe("RESOLVED");
  });

  test("submit refuses a city that isn't served or is switched off; a served one (any spelling) passes", async () => {
    await setCities([{ ...HYD, active: false }, BLR]);
    const pune = await call(saveEvent, eventInput(expId, { venue: { name: "Hall", area: "Kothrud", city: "Pune", address: "FC Road, Kothrud" } }), owner);
    expect(await messageOf(submit(pune.eventId))).toBe("PULSE isn't available in Pune yet. Choose one of the cities PULSE serves.");
    expect(await codeOf(submit(pune.eventId))).toBe("PRECONDITION");
    expect((await db().doc(`events/${pune.eventId}`).get()).data()!.status).toBe("draft");

    const hyd = await call(saveEvent, eventInput(expId), owner);
    expect(await messageOf(submit(hyd.eventId))).toMatch(/isn't available in Hyderabad/);

    const blr = await call(saveEvent, eventInput(expId, { venue: { name: "Turf", area: "Koramangala", city: "bangalore", address: "80 Feet Road" } }), owner);
    expect(await codeOf(submit(blr.eventId))).toBe("RESOLVED");
  });

  test("live edit: a published event can't go back for review in a city PULSE doesn't serve; it stays on sale", async () => {
    const id = (await call(saveEvent, eventInput(expId), owner)).eventId as string;
    await db().doc(`events/${id}`).update({ status: "approved" });
    await call(publishEvent, { requestId: rid("pub"), orgId: ORG, eventId: id }, owner);
    await setCities([HYD, BLR]);
    const ev = (await db().doc(`events/${id}`).get()).data()!;
    const same = { ...eventInput(expId, { eventId: id }), startsAt: ev.startsAt.toDate().toISOString() };

    const moved = { ...same, requestId: rid(), venue: { name: "Hall", area: "Kothrud", city: "Pune", address: "FC Road, Kothrud" } };
    expect(await messageOf(call(saveEvent, moved, owner))).toMatch(/isn't available in Pune yet/);
    expect((await db().doc(`events/${id}`).get()).data()).toMatchObject({ status: "published", venue: { city: "Hyderabad" } });

    // Hyderabad switched off: a re-review edit (price) is refused, a capacity tweak (no review) still saves.
    await setCities([{ ...HYD, active: false }, BLR]);
    expect(await codeOf(call(saveEvent, { ...same, requestId: rid(), priceMinor: 10_000 }, owner))).toBe("PRECONDITION");
    expect(await codeOf(call(saveEvent, { ...same, requestId: rid(), capacity: { max: 30, min: 6 } }, owner))).toBe("RESOLVED");
    expect((await db().doc(`events/${id}`).get()).data()).toMatchObject({ status: "published", capacity: { maxPhysicalCapacity: 30 } });

    // Moving it to a served city is allowed (re-review).
    const toBlr = { ...same, requestId: rid(), venue: { name: "Turf", area: "Koramangala", city: "Bengaluru", address: "80 Feet Road" } };
    expect((await call(saveEvent, toBlr, owner)).status).toBe("draft");
    expect(await codeOf(submit(id))).toBe("RESOLVED");
  });

  test("draft saves are never blocked (the organizer keeps their work)", async () => {
    await setCities([BLR]);
    expect(await codeOf(call(saveEvent, eventInput(expId), owner))).toBe("RESOLVED");
  });
});
