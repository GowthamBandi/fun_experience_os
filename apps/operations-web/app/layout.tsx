import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google";
import { StoreProvider } from "@/lib/store";
import { AdminAuthProvider } from "@/lib/firebase/auth";
import "./globals.css";

const display = Space_Grotesk({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display", display: "swap" });
const ui = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-ui", display: "swap" });

// Browser tabs say which environment they point at (NEXT_PUBLIC_APP_ENV, inlined at build time).
const ENV_PREFIX = process.env.NEXT_PUBLIC_DATA_MODE === "firebase-emulator" ? "[Emulator] " : process.env.NEXT_PUBLIC_APP_ENV === "staging" ? "[Staging] " : "";

export const metadata: Metadata = {
  title: `${ENV_PREFIX}PULSE Admin`,
  description: "Marketplace governance, trust and financial control for Experience OS.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${ui.variable} bg-ink text-text font-ui antialiased`}>
      <body>
        <StoreProvider><AdminAuthProvider>{children}</AdminAuthProvider></StoreProvider>
      </body>
    </html>
  );
}
