/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
      throw new Error(
        "FATAL: Production build cannot run with TINYFISH_MODE=fixture. Please set TINYFISH_MODE=live."
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
