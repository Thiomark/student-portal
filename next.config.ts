import type { NextConfig } from "next";

// Every school page is per-user and per-tenant, so we render on request and
// keep Cache Components off until a page proves it needs a static shell.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: {
    // Server actions carry form payloads; keep the default small so a slow
    // link fails fast instead of hanging on a runaway upload.
    serverActions: { bodySizeLimit: "1mb" },
    // Hold navigations and server actions while the connection drops and
    // retry them when it returns, instead of throwing on flaky school links.
    useOffline: true,
  },
};

export default nextConfig;
