"use client";

/** Last-resort boundary for errors in the root layout. Uses inline styles because global CSS may not have loaded. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-IN">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f4f5fa", color: "#101327", display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center" }}>
        <div style={{ background: "#fff", border: "1px solid #e4e7ef", borderRadius: 20, padding: 32, maxWidth: 440, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, margin: 0 }}>Experience OS could not start</h1>
          <p style={{ color: "#737a92", fontSize: 14, lineHeight: 1.6 }}>Your saved data is not affected. Reload the page to try again.</p>
          <button onClick={reset} style={{ background: "#5b4cf5", color: "#fff", border: 0, borderRadius: 12, padding: "10px 18px", fontWeight: 600, cursor: "pointer" }}>
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
