"use client";

import { useState, useEffect } from "react";
import type { Booking } from "@/lib/prototype/entities";

export function EmergencyAccessModal({
  booking,
  operatorRole,
  onConfirm,
  onClose,
}: {
  booking: Booking;
  operatorRole: string;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [unmasked, setUnmasked] = useState(false);
  const [countdown, setCountdown] = useState(300); // 5 minutes (300 seconds)
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!unmasked) return;
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setUnmasked(false);
          onClose();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [unmasked, onClose]);

  const isAllowedRole =
    operatorRole === "super-admin" ||
    operatorRole === "safety" ||
    operatorRole === "ops-manager" ||
    operatorRole === "platform-owner";

  const handleRequest = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!isAllowedRole) {
      setErrorMsg(`Access Denied: Role '${operatorRole}' is not authorized to request emergency identity access.`);
      return;
    }

    if (!reason.trim() || reason.trim().length < 5) {
      setErrorMsg("A valid, detailed operational/safety reason is required.");
      return;
    }

    onConfirm(reason.trim());
    setUnmasked(true);
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-50 backdrop-blur-sm flex items-center justify-center p-4 font-mono text-xs">
      <div className="bg-slate-50 border border-purple-200 rounded-lg p-6 max-w-lg w-full space-y-4 shadow-2xl">
        {/* Header & Mandatory Banner */}
        <div className="space-y-2">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <span className="font-bold text-purple-700 text-sm flex items-center gap-1.5">
              <span>🛡️ Emergency Identity Access</span>
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] bg-purple-50 text-purple-600 border border-purple-200 uppercase font-bold">
              ROLE: {operatorRole}
            </span>
          </div>

          <div className="bg-purple-200 border border-purple-300 p-2.5 rounded text-[11px] text-purple-700 italic">
            “Prototype emergency-access simulation — no real participant data and no production authorization.”
          </div>
        </div>

        {!unmasked ? (
          <form onSubmit={handleRequest} className="space-y-4">
            <p className="text-slate-700">
              You are requesting temporary unmasked identity access for participant{" "}
              <strong className="text-emerald-600">{booking.alias}</strong> (Ref: {booking.bookingCode || booking.id}).
            </p>

            <div>
              <label className="text-slate-500 block mb-1 font-bold uppercase">
                Mandatory Operational / Incident Justification *:
              </label>
              <textarea
                rows={3}
                placeholder="e.g. Medical emergency on court 2; Safety incident verification requested by Lead Coordinator."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800"
                required
              />
            </div>

            {errorMsg && (
              <div className="bg-red-50 border border-red-200 text-red-700 p-2 rounded">
                ❌ {errorMsg}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded"
              >
                Authorize & Unmask (5 Mins)
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="bg-amber-200 border border-amber-200 p-3 rounded text-amber-700 flex items-center justify-between">
              <span>UNMASKED ACCESS GRANTED</span>
              <span className="font-bold font-mono text-sm bg-amber-100 px-2 py-0.5 rounded">
                Timer: {formatTimer(countdown)}
              </span>
            </div>

            <div className="bg-slate-50 border border-slate-200 p-4 rounded space-y-2 text-slate-800">
              <div><strong className="text-slate-500">Participant Alias:</strong> {booking.alias}</div>
              <div><strong className="text-slate-500">Simulated Name:</strong> {booking.alias} (Prototype Seeded Fake Identity)</div>
              <div><strong className="text-slate-500">Simulated Phone:</strong> +91 {booking.phoneMask}</div>
              <div><strong className="text-slate-500">Emergency Contact:</strong> +91 98765 00000 (Simulated)</div>
              <div><strong className="text-slate-500">Audit Reference:</strong> Emergency Access Logged to Central Ledger</div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded"
              >
                Re-Mask Immediately & Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
