import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <div className="dusk-field h-screen w-screen overflow-y-auto">{children}</div>;
}
