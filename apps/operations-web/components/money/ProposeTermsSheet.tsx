"use client";

import { useEffect, useRef, useState } from "react";
import { Chip, Sheet, useToast } from "@/components/pulse";
import { PAYOUT_CADENCES, RequestIdBook, commissionPercentToBps, type PayoutCadence } from "@/lib/console/actions";
import { rethrowForSheet } from "@/lib/console/errors";
import { proposeCommercialAgreement } from "@/lib/governance-api";
import { commissionLabel } from "@/lib/organizers";
import { OrgPicker } from "./MoneyBits";

/**
 * Propose commercial terms (proposeCommercialAgreement). With `orgId` the organizer
 * is fixed (Organizer 360); without it the sheet shows an organizer picker (Commercials).
 * `terms` gives the terms in force for an organizer, to pre-fill the form.
 */
export function ProposeTermsSheet({
  open,
  orgId,
  name,
  terms,
  reasonLabel = "Note for the approving admin",
  onChanged,
  onClose,
}: {
  open: boolean;
  orgId?: string;
  name?: string;
  terms: (orgId: string) => { bps: number | null; cadence: string | null };
  reasonLabel?: string;
  onChanged?: () => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const [picked, setPicked] = useState("");
  const [percent, setPercent] = useState("");
  const [cadence, setCadence] = useState<PayoutCadence>("weekly");
  const book = useRef(new RequestIdBook("agreement"));
  const target = orgId ?? picked;
  const current = target ? terms(target) : { bps: null, cadence: null };

  useEffect(() => {
    if (!open) setPicked("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setPercent(current.bps !== null ? commissionLabel(current.bps).replace("%", "") : "");
    setCadence((PAYOUT_CADENCES as readonly string[]).includes(current.cadence ?? "") ? (current.cadence as PayoutCadence) : "weekly");
  }, [open, target, current.bps, current.cadence]);

  const confirm = async (note: string) => {
    if (!target) throw new Error("Choose the organizer these terms are for.");
    try {
      const result = await proposeCommercialAgreement({ requestId: book.current.idFor(`${target}-propose`), orgId: target, commissionPercent: percent, payoutCadence: cadence, note });
      book.current.reset();
      onChanged?.();
      toast.show({
        tone: "ok",
        title: `Terms proposed · ${percent.trim()}% ${cadence}`,
        body: `Agreement ${result.agreementId} is ${result.status}. Another admin approves it in Commercials; it then applies to newly published events.`,
      });
    } catch (cause) {
      rethrowForSheet(cause, book.current);
    }
  };

  const proposePct = (() => {
    try {
      return commissionPercentToBps(percent) / 100;
    } catch {
      return null;
    }
  })();

  return (
    <Sheet
      open={open}
      title="Propose commercial terms"
      description={`New terms for ${orgId ? name ?? orgId : "the organizer you choose"}. A different admin must approve them; approved terms apply to events published afterwards.`}
      confirmLabel="Propose terms"
      tone="volt"
      requireReason
      minReason={10}
      reasonLabel={reasonLabel}
      extra={
        <div className="flex flex-col gap-4">
          {orgId ? null : <OrgPicker value={picked} onChange={setPicked} enabled={open} />}
          <label className="block">
            <span className="text-[12px] font-semibold text-text-3">Commission</span>
            <span className="field mt-1.5 flex h-12 items-center rounded-control px-3.5">
              <input
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
                inputMode="decimal"
                autoComplete="off"
                aria-label="Commission percent"
                placeholder="10"
                className="num h-full min-w-0 flex-1 bg-transparent text-[20px] font-bold text-text outline-none placeholder:text-text-3"
              />
              <span aria-hidden className="font-display text-[18px] font-bold text-text-3">
                %
              </span>
            </span>
            <span className="mt-1.5 block text-[12px] text-text-3">
              {proposePct !== null
                ? `PULSE keeps ₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(proposePct * 10)} of every ₹1,000 booked.`
                : "0–50%, up to two decimals."}
              {!target ? "" : current.bps !== null ? ` Now ${commissionLabel(current.bps)}.` : " No terms in force yet."}
            </span>
          </label>
          <fieldset>
            <legend className="text-[12px] font-semibold text-text-3">Payout cadence</legend>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {PAYOUT_CADENCES.map((c) => (
                <Chip key={c} selected={cadence === c} onClick={() => setCadence(c)} className="capitalize">
                  {c}
                </Chip>
              ))}
            </div>
          </fieldset>
        </div>
      }
      onConfirm={confirm}
      onClose={onClose}
    />
  );
}
