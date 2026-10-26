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
