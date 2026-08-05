"use client";

import { useState } from "react";

export function CheckInQRScannerSimulator({
  onScan,
}: {
  onScan: (scannedCode: string) => void;
}) {
  const [inputCode, setInputCode] = useState("");
  const [simulating, setSimulating] = useState(false);

  const handleSimulateScan = (code: string) => {
    setSimulating(true);
    setTimeout(() => {
      onScan(code);
      setSimulating(false);
    }, 400);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4 font-mono text-xs">
      <div className="flex items-center justify-between">
        <span className="font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <span>📷 Door Check-In Scanner Simulator</span>
        </span>
        <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800">
          HARDWARE SIMULATOR ONLINE
        </span>
      </div>

      <div className="bg-slate-950 border border-slate-800 rounded-lg p-6 text-center space-y-3 relative overflow-hidden">
        {/* Simulated Camera Viewframe */}
        <div className="w-48 h-32 mx-auto border-2 border-dashed border-emerald-500/60 rounded-md flex flex-col items-center justify-center p-2 relative bg-slate-900/50">
          <div className={`w-full h-0.5 bg-emerald-400/80 shadow-[0_0_8px_rgba(52,211,153,0.8)] ${simulating ? "animate-bounce" : ""}`} />
          <span className="text-[10px] text-slate-500 mt-2">Align Participant QR / Code</span>
        </div>

        <div className="flex items-center justify-center gap-2 max-w-sm mx-auto pt-2">
          <input
            type="text"
            placeholder="e.g. CR-01, MX-014, b-1"
            value={inputCode}
            onChange={(e) => setInputCode(e.target.value)}
            className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-slate-200"
          />
          <button
            onClick={() => inputCode.trim() && handleSimulateScan(inputCode.trim())}
            disabled={simulating || !inputCode.trim()}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-bold rounded"
          >
            Simulate Scan
          </button>
        </div>
      </div>
    </div>
  );
}
