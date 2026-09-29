import { describe, expect, it } from "vitest";
import { getInitialState } from "../scenarios";
import { createSession, type SessionInput } from "./create";

function baseInput(): SessionInput {
  const s = getInitialState();
  const src = s.sessions.find((x) => x.id === "s-1")!;
  const { id: _id, ...rest } = src;
  void _id;
  return { ...rest, status: "booking-open", date: "Next Monday", startTime: "07:00" };
}

describe("createSession validation", () => {
  it("schedules a valid session with an audit entry", () => {
    const s = getInitialState();
    const out = createSession(s, baseInput(), "op-5");
    expect(out.error).toBeUndefined();
    expect(out.state.sessions.some((x) => x.id === out.id)).toBe(true);
    expect(out.state.audits[0].action).toBe("Session Created");
  });

  it("refuses a double-booked playing area", () => {
    const s = getInitialState();
    const first = createSession(s, baseInput(), "op-5");
    const clash = createSession(first.state, { ...baseInput(), startTime: "07:30" }, "op-5");
    expect(clash.error).toMatch(/already booked/);
    expect(clash.state).toBe(first.state);
  });

  it("refuses capacity above the playing area and inconsistent limits", () => {
    const s = getInitialState();
    const area = s.playingAreas.find((p) => p.id === baseInput().playingAreaId)!;
    expect(createSession(s, { ...baseInput(), maxParticipants: area.maxCapacity + 1 }).error).toMatch(/holds at most/);
    expect(createSession(s, { ...baseInput(), minParticipants: 99 }).error).toMatch(/minimum cannot be more/);
    expect(createSession(s, { ...baseInput(), startTime: "7pm" }).error).toMatch(/HH:MM/);
  });

  it("refuses the same person as lead and safety, and unknown staff", () => {
    const s = getInitialState();
    expect(createSession(s, { ...baseInput(), safetyContactId: baseInput().leadCoordinatorId }).error).toMatch(/must be different/);
    expect(createSession(s, { ...baseInput(), leadCoordinatorId: "c-999" }).error).toMatch(/not on the staff list/);
  });
});
