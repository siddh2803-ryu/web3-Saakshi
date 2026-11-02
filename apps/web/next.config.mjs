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
  webpack: (config, { isServer }) => {
    if (process.env.NODE_ENV === "production" && process.env.TINYFISH_MODE === "fixture") {
      console.warn(
        "[Notice] Production build running with TINYFISH_MODE=fixture (demo / offline verification mode)."
      );
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
