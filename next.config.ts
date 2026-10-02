import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  basePath: "/admin",
  serverExternalPackages: ["mongoose"],
  turbopack: {
    root: path.resolve(__dirname),
  },
  env: {
    AUTH_TRUST_HOST: "true",
  },
  async headers() {
    return [
      {
        // _next/static（ハッシュ付きJS/CSS）はキャッシュOK。HTMLページは毎回再取得させる
        source: "/((?!_next/static).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          { key: "Pragma", value: "no-cache" },
          { key: "Expires", value: "0" },
        ],
      },
    ];
  },
};

export default nextConfig;
