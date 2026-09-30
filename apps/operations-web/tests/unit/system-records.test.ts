import { describe, expect, it } from "vitest";
import { adaptJobRun, adaptLegalHold, jobErrorLines, latestJobRuns } from "@/lib/console/records";

describe("job runs", () => {
  it("renders {step, message} errors as readable lines", () => {
    expect(jobErrorLines([{ step: "holds", message: "DEADLINE_EXCEEDED" }, "plain"])).toEqual(["holds: DEADLINE_EXCEEDED", "plain"]);
    expect(jobErrorLines(undefined)).toEqual([]);
  });
  it("names rows by job and date and maps last status", () => {
    const ok = adaptJobRun("releaseExpiredHolds_2026-09-30", { job: "releaseExpiredHolds", date: "2026-09-30", runs: 288, failures: 0, lastStatus: "ok" });
    expect(ok).toMatchObject({ primary: "releaseExpiredHolds", secondary: "2026-09-30", status: "Approved", value: "288 runs · 0 failed" });
    expect(adaptJobRun("x", { job: "dataRetention", date: "2026-09-30", lastStatus: "failed" }).status).toBe("Blocked");
  });
  it("counts only each job's newest day", () => {
    const rows = [
      adaptJobRun("a1", { job: "a", date: "2026-09-01", lastStatus: "failed" }),
      adaptJobRun("a2", { job: "a", date: "2026-09-30", lastStatus: "ok" }),
      adaptJobRun("b1", { job: "b", date: "2026-09-30", lastStatus: "failed" }),
    ];
    const latest = latestJobRuns(rows).map((r) => r.id).sort();
    expect(latest).toEqual(["a2", "b1"]);
    expect(latestJobRuns(rows).filter((r) => r.raw.lastStatus !== "ok")).toHaveLength(1);
  });
});

describe("legal holds", () => {
  it("shows the subject and whether deletion is blocked", () => {
    expect(adaptLegalHold("user_u1", { subjectType: "user", subjectId: "u1", status: "active", reference: "CASE-42" }))
      .toMatchObject({ primary: "user u1", secondary: "CASE-42", status: "On hold", value: "active" });
    expect(adaptLegalHold("user_u1", { subjectType: "user", subjectId: "u1", status: "released" }).status).toBe("Hidden");
  });
});
