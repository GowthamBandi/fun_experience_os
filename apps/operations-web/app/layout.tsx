import type { Metadata } from "next";
import type { ReactNode } from "react";
import { StoreProvider } from "@/lib/store";
import { AdminAuthProvider } from "@/lib/firebase/auth";
import "./globals.css";

// Browser tabs say which environment they point at (NEXT_PUBLIC_APP_ENV, inlined at build time).
const ENV_PREFIX = process.env.NEXT_PUBLIC_DATA_MODE === "firebase-emulator" ? "[Emulator] " : process.env.NEXT_PUBLIC_APP_ENV === "staging" ? "[Staging] " : "";

export const metadata: Metadata = {
  title: `${ENV_PREFIX}Experience OS`,
  description: "Marketplace governance, trust and financial control for Experience OS.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <StoreProvider><AdminAuthProvider>{children}</AdminAuthProvider></StoreProvider>
      </body>
    </html>
  );
}
