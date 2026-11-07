import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingRoot: path.resolve(__dirname),
  images: { unoptimized: true },
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ] }];
  },
};

export default nextConfig;
