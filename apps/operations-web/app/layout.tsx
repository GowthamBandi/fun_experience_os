import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/inter";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/jetbrains-mono";
import { StoreProvider } from "@/lib/store";
import { AdminAuthProvider } from "@/lib/firebase/auth";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Experience OS", template: "%s · Experience OS" },
  description: "Marketplace governance, operations, trust and financial control for Experience OS.",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN">
      <body>
        <ToastProvider>
          <StoreProvider>
            <AdminAuthProvider>{children}</AdminAuthProvider>
          </StoreProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
