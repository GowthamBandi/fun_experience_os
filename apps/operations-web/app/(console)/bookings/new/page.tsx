"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { sessionCapacityLedger } from "@/lib/prototype/selectors/capacity";
import { validateBookingCapacityEligibility } from "@/lib/prototype/validators/bookingValidation";
import { sessionTitle } from "@/lib/prototype/selectors/lookups";
import { inr } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { CapacityBar } from "@/components/geo/CapacityBar";
import { Button } from "@/components/ui/primitives";
import type { BookingType, BookingSource } from "@/lib/prototype/entities";

export default function NewReservationPage() {
  const router = useRouter();
  const { state, createBookingReservation, role } = useStore();

  const activeSessions = useMemo(
    () => state.sessions.filter((s) => s.status !== "cancelled" && s.status !== "archived"),
    [state.sessions]
  );

  const [selectedSessionId, setSelectedSessionId] = useState<string>(activeSessions[0]?.id || "");
  const [alias, setAlias] = useState("");
  const [phoneMask, setPhoneMask] = useState("•••• 42");
  const [bookingType, setBookingType] = useState<BookingType>("individual");
  const [source, setSource] = useState<BookingSource>("admin");
  const [customAmount, setCustomAmount] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const selectedSession = useMemo(
    () => state.sessions.find((s) => s.id === selectedSessionId),
    [state.sessions, selectedSessionId]
  );

  const ledger = useMemo(
    () => (selectedSessionId ? sessionCapacityLedger(state, selectedSessionId) : null),
    [state, selectedSessionId]
  );

  const validation = useMemo(
    () => (selectedSessionId ? validateBookingCapacityEligibility(state, selectedSessionId, bookingType) : null),
    [state, selectedSessionId, bookingType]
  );

  const handleDispatch = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!alias.trim()) {
      setErrorMsg("Participant alias is required.");
      return;
    }

    const amount = customAmount ? parseFloat(customAmount) : selectedSession?.basePrice ?? 0;

    const res = createBookingReservation({
      sessionId: selectedSessionId,
      alias,
      phoneMask,
      bookingType,
      source,
      amount,
      operatorId: role.id,
    });

    if (res.error) {
      setErrorMsg(res.error);
    } else {
      router.push("/bookings");
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 md:px-8 space-y-6">
      <PageHeader
        overline="Reservation Operations"
        title="Dispatch New Reservation"
        sub="Simulate Customer, Admin, or Complimentary reservation holds on authoritative sellable capacity."
        right={
          <Link href="/bookings" className="text-xs font-mono text-slate-400 hover:text-slate-200">
            ← Cancel & Return
          </Link>
        }
      />

      <form onSubmit={handleDispatch} className="space-y-6 font-mono text-xs">
        {/* Step 1: Select Session */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
          <label className="font-bold text-slate-200 block uppercase tracking-wider">
            1. Select Operational Session
          </label>
          <select
            value={selectedSessionId}
            onChange={(e) => setSelectedSessionId(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200"
          >
            {activeSessions.map((s) => (
              <option key={s.id} value={s.id}>
                {sessionTitle(state, s.id)} ({s.date} {s.startTime}) — ₹{s.basePrice}
              </option>
            ))}
          </select>

          {ledger && (
            <div className="pt-2">
              <CapacityBar ledger={ledger} />
            </div>
          )}
        </div>

        {/* Step 2: Booking Type & Source */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4">
          <label className="font-bold text-slate-200 block uppercase tracking-wider">
            2. Reservation Type & Source
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <span className="text-slate-400 block mb-1">Booking Type:</span>
              <select
                value={bookingType}
                onChange={(e) => setBookingType(e.target.value as BookingType)}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200"
              >
                <option value="individual">Individual Customer</option>
                <option value="group">Group Reservation</option>
                <option value="complimentary">Complimentary Allocation</option>
                <option value="admin">Admin Special Reservation</option>
              </select>
            </div>

            <div>
              <span className="text-slate-400 block mb-1">Channel Source:</span>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value as BookingSource)}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200"
              >
                <option value="customer-app">Customer App Simulation</option>
                <option value="admin">Admin Dispatch</option>
                <option value="complimentary">Complimentary Pass</option>
                <option value="campaign">Marketing Campaign</option>
              </select>
            </div>
          </div>
        </div>

        {/* Step 3: Participant & Price */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4">
          <label className="font-bold text-slate-200 block uppercase tracking-wider">
            3. Participant Details & Pricing
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <span className="text-slate-400 block mb-1">Participant Alias *:</span>
              <input
                type="text"
                placeholder="e.g. StrikeMaster, NightRider"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200"
                required
              />
            </div>
            <div>
              <span className="text-slate-400 block mb-1">Phone Mask:</span>
              <input
                type="text"
                value={phoneMask}
                onChange={(e) => setPhoneMask(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200"
              />
            </div>
            <div>
              <span className="text-slate-400 block mb-1">Custom Price (₹):</span>
              <input
                type="number"
                placeholder={`Default: ₹${selectedSession?.basePrice ?? 0}`}
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200"
              />
            </div>
          </div>
        </div>

        {/* Validation Errors & Warnings */}
        {validation && (validation.errors.length > 0 || validation.warnings.length > 0) && (
          <div className="space-y-2">
            {validation.errors.map((err, idx) => (
              <div key={idx} className="bg-red-950/80 border border-red-800 text-red-300 p-3 rounded text-xs">
                ❌ {err}
              </div>
            ))}
            {validation.warnings.map((warn, idx) => (
              <div key={idx} className="bg-amber-950/80 border border-amber-800 text-amber-300 p-3 rounded text-xs">
                ⚠️ {warn}
              </div>
            ))}
          </div>
        )}

        {errorMsg && (
          <div className="bg-red-950 border border-red-800 text-red-300 p-3 rounded text-xs">
            ❌ {errorMsg}
          </div>
        )}

        {/* Action Controls */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Link href="/bookings">
            <Button variant="ghost" className="h-9 px-4 text-xs font-mono">
              Cancel
            </Button>
          </Link>
          <Button
            type="submit"
            variant="lamp"
            disabled={validation?.isValid === false}
            className="h-9 px-6 text-xs font-mono font-bold"
          >
            Dispatch Reservation Hold
          </Button>
        </div>
      </form>
    </div>
  );
}
