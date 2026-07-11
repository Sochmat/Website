import type { NextConfig } from "next";
import { codeInspectorPlugin } from "code-inspector-plugin";

// code-inspector-plugin runs a click-to-open-in-editor bridge on a fixed port
// (5678). Under Turbopack every parallel loader worker tries to bind that port,
// so all but the first throw `EADDRINUSE :::5678`. It's a dev-only convenience,
// so it's off by default; set CODE_INSPECTOR=1 to opt in.
const enableCodeInspector = process.env.CODE_INSPECTOR === "1";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.figma.com",
        pathname: "/api/mcp/asset/**",
      },
    ],
  },
  ...(enableCodeInspector
    ? { turbopack: { rules: codeInspectorPlugin({ bundler: "turbopack" }) } }
    : {}),
  // Force HTTPS (transport-layer encryption of every request/response payload)
  // and basic hardening headers on all responses.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
