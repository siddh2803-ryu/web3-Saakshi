import * as dotenv from "dotenv";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env.chain-local"), override: true });
dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_CHAIN_ID: process.env.NEXT_PUBLIC_CHAIN_ID || process.env.CHAIN_ID || "80002",
    NEXT_PUBLIC_RPC_URL: process.env.NEXT_PUBLIC_RPC_URL || process.env.RPC_URL || "",
    NEXT_PUBLIC_AMOY_RPC_URL: process.env.NEXT_PUBLIC_AMOY_RPC_URL || process.env.AMOY_RPC_URL || "",
    NEXT_PUBLIC_REGISTRY_ADDRESS: process.env.NEXT_PUBLIC_REGISTRY_ADDRESS || "",
    NEXT_PUBLIC_EXPLORER_URL: process.env.NEXT_PUBLIC_EXPLORER_URL || "",
  },
  experimental: {
    serverComponentsExternalPackages: [
      "playwright-core",
      "@react-pdf/renderer",
      "canvas",
      "firebase-admin",
    ],
  },
  async headers() {
    return [
      {
        source: "/s/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        source: "/api/shares/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
  webpack: (config, { isServer }) => {
    // Production Guards: fail production builds when any dev-only flag is set
    if (process.env.NODE_ENV === "production") {
      const devFlags = [
        { key: "TINYFISH_MODE", forbiddenValue: "fixture" },
        { key: "IPFS_FALLBACK", forbiddenValue: "dev" },
        { key: "CHAIN_MODE", forbiddenValue: "mock" },
        { key: "AI_FALLBACK", forbiddenValue: "dev" },
      ];
      const violations = devFlags
        .filter(({ key, forbiddenValue }) => process.env[key] === forbiddenValue)
        .map(({ key, forbiddenValue }) => `${key}=${forbiddenValue}`);

      if (violations.length > 0) {
        throw new Error(
          `[Production Guard Failure] Production build rejected: dev-only fallback flag(s) active: ${violations.join(
            ", "
          )}. Disable these flags before building for production.`
        );
      }
    }
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
      };
    }
    return config;
  },
};

export default nextConfig;
