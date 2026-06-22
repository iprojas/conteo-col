import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: import.meta.dirname,
  },
  async rewrites() {
    return [
      {
        source: "/pdf-source/v2/:path*",
        destination: "https://escrutinios2vueltapresidente2026.registraduria.gov.co/:path*",
      },
    ];
  },
};

export default nextConfig;
