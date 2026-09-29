import type { Metadata } from "next";
import type { ReactNode } from "react";
import { StoreProvider } from "@/lib/store";
import { AdminAuthProvider } from "@/lib/firebase/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Experience OS",
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
