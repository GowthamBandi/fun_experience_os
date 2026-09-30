import { securityHeaders } from "./security-headers.mjs";

const headers = securityHeaders({
  dataMode: process.env.NEXT_PUBLIC_DATA_MODE,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  dev: process.env.NODE_ENV === "development",
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Lets the smoke test build a separate (unconfigured) bundle without clobbering .next.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  async headers() {
    return [{ source: "/:path*", headers }];
  },
};

export default nextConfig;
