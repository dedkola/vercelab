import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  allowedDevOrigins: ["10.10.0.86"],
};

export default nextConfig;
