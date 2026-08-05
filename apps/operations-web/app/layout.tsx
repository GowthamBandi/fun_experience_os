import type { Metadata } from "next";
import type { ReactNode } from "react";
import { StoreProvider } from "@/lib/store";
import { EmulatorBanner } from "@/components/dev/EmulatorBanner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Experience OS",
  description: "The night runs on Experience OS.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <StoreProvider>{children}</StoreProvider>
        <EmulatorBanner />
      </body>
    </html>
  );
}
