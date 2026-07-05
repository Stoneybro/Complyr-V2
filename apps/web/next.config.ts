import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ── Exclude Zama SDK from server-side bundling ────────────────────────────
  // @zama-fhe/relayer-sdk ships WebAssembly + WebWorker code that can only
  // run in the browser. Marking it as a server external prevents Turbopack
  // from attempting to bundle it during SSR compilation.
  serverExternalPackages: ["@zama-fhe/relayer-sdk"],

  // ── Turbopack configuration ───────────────────────────────────────────────
  // Next.js 16 uses Turbopack by default. An empty turbopack object tells
  // Next.js we're aware and have no custom rules needed — Turbopack handles
  // WASM (.wasm) imports natively without additional configuration.
  turbopack: {},

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
};

export default nextConfig;
