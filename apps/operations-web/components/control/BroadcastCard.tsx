"use client";

import { useState } from "react";
import { Megaphone } from "lucide-react";
import { Button, Card, useToast } from "@/components/pulse";
import { sendBroadcast } from "@/lib/governance-api";

/** Push one announcement to everyone, or to people who chose one city. */
export function BroadcastCard() {
  const toast = useToast();
  const [audience, setAudience] = useState<"all" | "city">("city");
  const [city, setCity] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const valid = title.trim().length >= 3 && body.trim().length >= 5 && reason.trim().length >= 3 && (audience === "all" || city.trim().length >= 2);
  const input = "rounded-control border border-line bg-transparent px-3 py-2 text-text";

  const send = async () => {
    if (!window.confirm(audience === "all" ? "Send this push to everyone on PULSE?" : `Send this push to everyone in ${city}?`)) return;
    setSending(true);
    try {
      const r = await sendBroadcast({ audience, city: audience === "city" ? city.trim() : undefined, title: title.trim(), body: body.trim(), reason: reason.trim() });
      toast.show({ tone: "ok", title: "Broadcast sent", body: `Topic ${r.topic} · ${r.status}` });
      setTitle(""); setBody(""); setReason("");
    } catch (e) {
      toast.show({ tone: "err", title: "Couldn't send", body: e instanceof Error ? e.message : String(e) });
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="p-5" data-testid="broadcast">
      <div className="mb-4 flex items-center gap-2">
        <Megaphone aria-hidden className="h-4 w-4 text-text-3" />
        <h2 className="mr-auto font-display text-[16px] font-bold text-text">Broadcast</h2>
        <span className="text-[12px] text-text-3">At most 3 a day</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-[13px] text-text-2">
          Who
          <select value={audience} onChange={(e) => setAudience(e.target.value as "all" | "city")} className={input}>
            <option value="city">One city</option>
            <option value="all">Everyone</option>
          </select>
        </label>
        {audience === "city" ? (
          <label className="flex flex-col gap-1.5 text-[13px] text-text-2">
            City
            <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Bengaluru" className={input} />
          </label>
        ) : <div />}
        <label className="flex flex-col gap-1.5 text-[13px] text-text-2 sm:col-span-2">
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={65} className={input} />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] text-text-2 sm:col-span-2">
          Message
          <input value={body} onChange={(e) => setBody(e.target.value)} maxLength={240} className={input} />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] text-text-2 sm:col-span-2">
          Reason (for the audit trail)
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} className={input} />
        </label>
      </div>
      <div className="mt-4 flex justify-end">
        <Button variant="volt" onClick={send} loading={sending} disabled={!valid}>Send push</Button>
      </div>
    </Card>
  );
}
