"use client";

import { PhoneFrame } from "@/components/pulse";
import { isHttpsUrl, linkTypeLabel, type NotificationForm } from "@/lib/notifications";

/** Lock-screen look-alike of the push (standard or rich), plus where a tap goes. */
export function PushPreview({ form }: { form: NotificationForm }) {
  const image = form.imageUrl.trim() && isHttpsUrl(form.imageUrl, { allowEmulator: true }) ? form.imageUrl.trim() : null;
  const rich = form.style === "rich" && image;
  const tap = form.target === "link" && form.linkId.trim() ? `Opens ${linkTypeLabel(form.linkType).toLowerCase()} ${form.linkId.trim()}` : form.target === "url" && form.url.trim() ? "Opens the web page" : "Opens PULSE";
  return (
    <div className="flex flex-col items-center gap-2">
      <PhoneFrame label="Push preview on a lock screen">
        <div aria-hidden className="relative h-full overflow-hidden bg-[radial-gradient(120%_80%_at_30%_0%,#3A2C82,#0B0A12_60%)] px-3 pt-16">
          <p className="text-center font-display text-[56px] font-bold leading-none tracking-[-0.04em] text-white/90">9:41</p>
          <p className="mt-1 text-center text-[13px] font-semibold text-white/70">Tuesday 24 November</p>
          <div className="mt-8 overflow-hidden rounded-[22px] bg-[rgba(30,27,44,0.82)] p-3 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.8)] backdrop-blur-[18px]">
            <div className="flex items-start gap-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[linear-gradient(135deg,#8E72FF,#6E4DFF)]">
                <svg width="20" height="14" viewBox="0 0 34 24">
                  <polyline points="0,13 9.5,13 13.6,3 18.7,22 23.1,9.6 25.8,13 34,13" fill="none" stroke="#D9FF3F" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-[13px] font-bold text-white">{form.title.trim() || "Your title"}</p>
                  <span className="shrink-0 text-[11px] text-white/50">now</span>
                </div>
                <p className="mt-0.5 line-clamp-4 break-words text-[12.5px] leading-[1.4] text-white/80">{form.body.trim() || "Your message"}</p>
              </div>
              {image && !rich ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt="" className="h-10 w-10 shrink-0 rounded-[8px] object-cover" />
              ) : null}
            </div>
            {rich ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image!} alt="" className="mt-2.5 h-36 w-full rounded-[14px] object-cover" />
            ) : null}
          </div>
        </div>
      </PhoneFrame>
      <p className="text-[12px] text-text-3">Tap: {tap}</p>
    </div>
  );
}
