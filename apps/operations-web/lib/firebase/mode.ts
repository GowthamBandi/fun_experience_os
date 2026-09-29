/**
 * Data mode resolution. Kept free of Firebase imports so the local workspace
 * mode never loads the Firebase SDK.
 *
 *   prototype         — local workspace (IndexedDB). Default.
 *   firebase-emulator — Firebase Emulator Suite (project demo-experience-os).
 *   firebase-live     — a real Firebase project with App Check.
 */
export type DataMode = "prototype" | "firebase-emulator" | "firebase-live";

export function resolveDataMode(): DataMode {
  const raw = process.env.NEXT_PUBLIC_DATA_MODE;
  if (raw === "firebase-emulator") return "firebase-emulator";
  if (raw === "firebase-live") return "firebase-live";
  // Unknown values never select a Firebase mode.
  return "prototype";
}

export const DATA_MODE_LABEL: Record<DataMode, string> = {
  prototype: "Local workspace",
  "firebase-emulator": "Firebase emulator",
  "firebase-live": "Live",
};
