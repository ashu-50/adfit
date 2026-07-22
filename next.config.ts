import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // Traced standalone bundle: the Docker image copies .next/standalone instead
  // of a 700MB node_modules tree.
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["@prisma/client", "jsdom", "pdf-lib"],
  experimental: { optimizePackageImports: ["lucide-react", "recharts", "framer-motion"] },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
};

export default config;
