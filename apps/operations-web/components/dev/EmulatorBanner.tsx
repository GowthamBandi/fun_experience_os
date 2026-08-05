"use client";

/**
 * EmulatorBanner
 *
 * Displays a development-only banner when NEXT_PUBLIC_DATA_MODE=firebase-emulator.
 * Must NOT appear in prototype mode or firebase-live mode.
 * Must NOT claim a service is healthy — it only shows the configured endpoints.
 * SDK-level verification (checkHealth callable, rules denial) is done separately.
 */

const DATA_MODE = process.env.NEXT_PUBLIC_DATA_MODE;

const EMULATOR_PROJECT_ID = "demo-experience-os";
const AUTH_ENDPOINT = "127.0.0.1:9099";
const FIRESTORE_ENDPOINT = "127.0.0.1:8080";
const FUNCTIONS_ENDPOINT = "127.0.0.1:5001";

export function EmulatorBanner() {
  if (DATA_MODE !== "firebase-emulator") return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: "#1a1a2e",
        borderTop: "2px solid #ff6b35",
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "12px",
        padding: "6px 16px",
        display: "flex",
        alignItems: "center",
        gap: "24px",
        flexWrap: "wrap",
      }}
    >
      <span style={{ color: "#ff6b35", fontWeight: "bold" }}>
        ⚡ FIREBASE EMULATOR
      </span>
      <span>
        <span style={{ color: "#888" }}>project: </span>
        <span style={{ color: "#4fc3f7" }}>{EMULATOR_PROJECT_ID}</span>
      </span>
      <span>
        <span style={{ color: "#888" }}>auth: </span>
        <span style={{ color: "#aed581" }}>{AUTH_ENDPOINT}</span>
      </span>
      <span>
        <span style={{ color: "#888" }}>firestore: </span>
        <span style={{ color: "#aed581" }}>{FIRESTORE_ENDPOINT}</span>
      </span>
      <span>
        <span style={{ color: "#888" }}>functions: </span>
        <span style={{ color: "#aed581" }}>{FUNCTIONS_ENDPOINT}</span>
      </span>
      <span style={{ color: "#888", marginLeft: "auto" }}>
        UI →{" "}
        <a
          href="http://127.0.0.1:4000"
          target="_blank"
          rel="noreferrer"
          style={{ color: "#ce93d8" }}
        >
          127.0.0.1:4000
        </a>
      </span>
    </div>
  );
}
