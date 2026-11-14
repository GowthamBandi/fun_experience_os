/** Experience photo links must point into the organizer's own media folder. */
import { isOrgMediaUrl } from "../src/catalog/experiences";

const url = (object: string, host = "https://firebasestorage.googleapis.com") =>
  `${host}/v0/b/experience-os-staging.firebasestorage.app/o/${encodeURIComponent(object)}?alt=media&token=t`;

describe("isOrgMediaUrl", () => {
  test("accepts the org's own photos", () => {
    expect(isOrgMediaUrl(url("orgMedia/org-1/abc123.jpg"), "org-1")).toBe(true);
  });
  test("refuses other orgs, other folders, traversal, other hosts and junk", () => {
    expect(isOrgMediaUrl(url("orgMedia/org-2/abc.jpg"), "org-1")).toBe(false);
    expect(isOrgMediaUrl(url("kyc/org-1/abc.jpg"), "org-1")).toBe(false);
    expect(isOrgMediaUrl(url("orgMedia/org-1/../kyc/x.pdf"), "org-1")).toBe(false);
    expect(isOrgMediaUrl(url("orgMedia/org-1/sub/abc.jpg"), "org-1")).toBe(false);
    expect(isOrgMediaUrl(url("orgMedia/org-1/abc.jpg", "https://evil.example.com"), "org-1")).toBe(false);
    expect(isOrgMediaUrl("not a url", "org-1")).toBe(false);
    expect(isOrgMediaUrl("javascript:alert(1)", "org-1")).toBe(false);
  });
});
