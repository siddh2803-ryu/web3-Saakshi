import * as dotenv from "dotenv";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env.chain-local"), override: true });
dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

function buildCsp() {
  const pinataGateway = process.env.PINATA_GATEWAY || "https://gateway.pinata.cloud";
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || process.env.RPC_URL || "";
  const amoyRpcUrl = process.env.NEXT_PUBLIC_AMOY_RPC_URL || process.env.AMOY_RPC_URL || "";

  const connectOrigins = [
    "'self'",
    "https://*.tinyfish.ai",
    "wss://*.tinyfish.ai",
    "https://api.browser.tinyfish.ai",
    "https://agent.tinyfish.ai",
    "https://api.search.tinyfish.ai",
    "https://gateway.pinata.cloud",
    "https://api.pinata.cloud",
    "https://*.mypinata.cloud",
    "https://identitytoolkit.googleapis.com",
    "https://securetoken.googleapis.com",
    "https://*.googleapis.com",
    "https://*.firebaseio.com",
    "https://rpc-amoy.polygon.technology",
    "https://*.polygon.technology",
    "http://127.0.0.1:8545",
    "http://localhost:8545",
  ];
  if (pinataGateway && !connectOrigins.includes(pinataGateway)) connectOrigins.push(pinataGateway);
  if (rpcUrl && !connectOrigins.includes(rpcUrl)) connectOrigins.push(rpcUrl);
  if (amoyRpcUrl && !connectOrigins.includes(amoyRpcUrl)) connectOrigins.push(amoyRpcUrl);

  const directives = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      "'unsafe-eval'",
      "'unsafe-inline'",
      "https://apis.google.com",
      "https://*.firebaseapp.com",
      "https://*.googleapis.com",
    ],
    "style-src": [
      "'self'",
      "'unsafe-inline'",
      "https://fonts.googleapis.com",
    ],
    "font-src": [
      "'self'",
      "https://fonts.gstatic.com",
      "data:",
    ],
    "img-src": [
      "'self'",
      "data:",
      "blob:",
      "https://*.googleusercontent.com",
      "https://gateway.pinata.cloud",
      "https://*.mypinata.cloud",
      pinataGateway,
    ].filter(Boolean),
    "connect-src": connectOrigins.filter(Boolean),
    "frame-src": [
      "'self'",
      "https://stream.tinyfish.ai",
      "https://*.tinyfish.ai",
      "https://*.firebaseapp.com",
      "https://accounts.google.com",
    ],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };

  return Object.entries(directives)
    .map(([key, values]) => `${key} ${Array.from(new Set(values)).join(" ")}`)
    .join("; ");
}

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
    const globalSecurityHeaders = [
      {
        key: "Content-Security-Policy",
        value: buildCsp(),
      },
      {
        key: "Referrer-Policy",
        value: "strict-origin-when-cross-origin",
      },
      {
        key: "X-Content-Type-Options",
        value: "nosniff",
      },
      {
        key: "X-Frame-Options",
        value: "DENY",
      },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
      },
      {
        key: "X-DNS-Prefetch-Control",
        value: "on",
      },
    ];

    if (process.env.NODE_ENV === "production") {
      globalSecurityHeaders.push({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      });
    }

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
      {
        source: "/:path*",
        headers: globalSecurityHeaders,
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
