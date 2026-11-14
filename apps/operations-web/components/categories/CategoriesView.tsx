"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { collection, onSnapshot } from "firebase/firestore";
import { Badge, Button, Card, PageHeader, useToast } from "@/components/pulse";
import { PageContainer } from "@/components/shell/PageContainer";
import { useAdminSession } from "@/lib/firebase/auth";
import { getFirebaseClient } from "@/lib/firebase/client";
import { can } from "@/lib/console/capabilities";
import { setCategoryCover, uploadCategoryCover } from "@/lib/governance-api";

/** Same keys as the apps (ExperienceCategory) and the backend (CATEGORY_KEYS). */
const CATEGORIES: { key: string; label: string; emoji: string }[] = [
  { key: "sports", label: "Sports", emoji: "🏏" },
  { key: "music", label: "Music", emoji: "🎵" },
  { key: "trips", label: "Trips", emoji: "⛰️" },
  { key: "movies", label: "Movies", emoji: "🎬" },
  { key: "social", label: "Social", emoji: "🎉" },
  { key: "wellness", label: "Wellness", emoji: "🧘" },
  { key: "food", label: "Food", emoji: "🍜" },
  { key: "workshops", label: "Workshops", emoji: "🎨" },
];

/** Other images the apps show: banners. Same storage and rules as categories. */
const BANNERS: { key: string; label: string; emoji: string }[] = [
  { key: "host-promo", label: "“Host on PULSE” banner", emoji: "📣" },
];

/**
 * Category covers: the image customers see on an experience that has no
 * photo of its own, and on the category tiles. The apps ship no images.
 */
export function CategoriesView() {
  const { consoleRole } = useAdminSession();
  const toast = useToast();
  const canEdit = can(consoleRole, "governance.decide");
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    try {
      return onSnapshot(collection(getFirebaseClient().firestore, "categoryCovers"), (snap) => {
        const next: Record<string, string> = {};
        snap.forEach((d) => {
          const url = d.data().url;
          if (typeof url === "string") next[d.id] = url;
        });
        setCovers(next);
      });
    } catch {
      return undefined;
    }
  }, []);

  const upload = async (key: string, file: File | undefined) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.show({ tone: "err", title: "Choose a JPG, PNG or WebP image" });
      return;
    }
    if (file.size >= 8 * 1024 * 1024) {
      toast.show({ tone: "err", title: "The image must be smaller than 8 MB" });
      return;
    }
    setBusy(key);
    try {
      const url = await uploadCategoryCover(key, file);
      await setCategoryCover({ category: key, url, reason: `Cover for ${key}` });
      toast.show({ tone: "ok", title: "Cover updated", body: "Customers see it on experiences without their own photo." });
    } catch (e) {
      toast.show({ tone: "err", title: "Upload failed", body: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  const clear = async (key: string) => {
    setBusy(key);
    try {
      await setCategoryCover({ category: key, url: "", reason: `Cover removed for ${key}` });
      toast.show({ tone: "ok", title: "Cover removed" });
    } catch (e) {
      toast.show({ tone: "err", title: "That didn’t work", body: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader overline="Marketplace" title="Categories" subtitle="Every image the apps show that isn’t an organizer’s own photo: category covers (for experiences without photos and the category tiles) and app banners. The apps ship no images." />
      {[{ title: "Category covers", items: CATEGORIES }, { title: "App banners", items: BANNERS }].map((section) => (
      <section key={section.title} className="flex flex-col gap-3">
      <h2 className="font-display text-[18px] font-bold text-text">{section.title}</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {section.items.map((c) => {
          const url = covers[c.key];
          return (
            <Card key={c.key} className="overflow-hidden p-0" data-testid={`category-${c.key}`}>
              <div className="relative aspect-[16/10] bg-surface-high">
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt={`${c.label} cover`} className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full place-items-center text-[40px]" aria-hidden>{c.emoji}</div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 p-4">
                <span className="mr-auto font-display text-[16px] font-bold text-text">{c.label}</span>
                {url ? <Badge tone="ok">Cover set</Badge> : <Badge tone="warn">No cover</Badge>}
                {canEdit ? (
                  <>
                    <input
                      ref={(el) => { inputs.current[c.key] = el; }}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      aria-label={`Upload ${c.label} cover`}
                      onChange={(e) => { void upload(c.key, e.target.files?.[0]); e.target.value = ""; }}
                    />
                    <Button variant="ghost" size="sm" icon={<ImagePlus />} disabled={busy === c.key} onClick={() => inputs.current[c.key]?.click()}>
                      {url ? "Replace" : "Upload"}
                    </Button>
                    {url ? (
                      <Button variant="ghost" size="sm" icon={<Trash2 />} disabled={busy === c.key} onClick={() => void clear(c.key)}>Remove</Button>
                    ) : null}
                  </>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>
      </section>
      ))}
    </PageContainer>
  );
}
