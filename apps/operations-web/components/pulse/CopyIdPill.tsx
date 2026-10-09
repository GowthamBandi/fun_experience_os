"use client";

import { Copy } from "lucide-react";
import { Tooltip } from "./Tooltip";
import { useToast } from "./Toast";

/** A monospace ID pill that copies the ID and confirms with a toast. `noun` names it ("event", "organizer"). */
export function CopyIdPill({ id, noun }: { id: string; noun: string }) {
  const toast = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(id);
      toast.show({ tone: "ok", title: `${noun.charAt(0).toUpperCase()}${noun.slice(1)} ID copied`, body: id });
    } catch {
      toast.show({ tone: "err", title: "Couldn't copy", body: "Select the ID and copy it manually." });
    }
  };
  return (
    <Tooltip label={`Copy ${noun} ID`}>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${noun} ID ${id}`}
        className="focus-ring inline-flex items-center gap-1.5 rounded-pill border border-line-soft bg-[rgba(255,255,255,0.04)] px-2.5 py-1 font-mono text-[11.5px] text-text-2 transition-colors duration-150 hover:border-line hover:text-text"
      >
        {id}
        <Copy aria-hidden className="h-3 w-3" />
      </button>
    </Tooltip>
  );
}
