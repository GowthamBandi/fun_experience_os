/**
 * Category cover images, set by PULSE operations in the super admin.
 * `categoryCovers/{categoryKey}` = { url, path, updatedAt, updatedBy }.
 * An experience without its own photo shows its category's cover; the apps
 * ship no images of their own. Files live in Storage at
 * `categoryMedia/{categoryKey}-{random}.{jpg|png|webp}` (admin-write).
 */
import { callable, oneOf, str } from "../platform/callable";
import { requireAdmin } from "../platform/auth";
import { DomainError } from "../platform/errors";
import { db, serverNow } from "../platform/firestore";
import { writeAudit } from "../platform/audit";
import { isEmulator } from "../platform/security";
import { CATEGORY_KEYS } from "./categories";

/** Category keys plus app banner slots (the "Host on PULSE" banner). */
const CATEGORY_COVER_KEYS = [...CATEGORY_KEYS, "trips", "host-promo"] as const;

/** A Storage download URL for `categoryMedia/{key}-…`. */
export function isCategoryMediaUrl(url: string, key: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const hostOk = (u.protocol === "https:" && u.hostname === "firebasestorage.googleapis.com") || (u.protocol === "http:" && isEmulator());
  const m = u.pathname.match(/^\/v0\/b\/[^/]+\/o\/(.+)$/);
  if (!hostOk || !m) return false;
  let object: string;
  try {
    object = decodeURIComponent(m[1]!);
  } catch {
    return false;
  }
  return new RegExp(`^categoryMedia/${key}-[A-Za-z0-9_-]{4,64}\\.(jpg|jpeg|png|webp)$`).test(object);
}

/** Console: set (url) or clear (url = "") a category's cover. */
export const setCategoryCover = callable(async (data, context) => {
  const admin = requireAdmin(context, "categories.cover");
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const key = oneOf(d.category, "category", CATEGORY_COVER_KEYS as unknown as readonly string[]);
  const url = typeof d.url === "string" ? d.url.trim() : "";
  if (url && !isCategoryMediaUrl(url, key)) throw new DomainError("INVALID_INPUT", "Upload the image through the console first.");
  const reason = str(d.reason ?? "Category cover updated", "Reason", 3, 200);
  const ref = db().collection("categoryCovers").doc(key);
  const batch = db().batch();
  if (url) batch.set(ref, { url, updatedAt: serverNow(), updatedBy: admin.uid });
  else batch.delete(ref);
  writeAudit(batch, {
    action: url ? "catalog.category-cover-set" : "catalog.category-cover-cleared",
    actorUid: admin.uid, actorRole: `platform:${admin.roleId}`, resourceType: "category", resourceId: key,
    after: { url: url || null }, reason, source: "operations-console",
  });
  await batch.commit();
  return { category: key, url: url || null };
});
