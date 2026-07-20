import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pg"],
  allowedDevOrigins: ["10.10.0.86"],
  outputFileTracingExcludes: {
    "*": [
      "app/**",
      "components/**",
      "lib/**",
      "tests/**",
      "scripts/**",
      "server/**",
      "README.md",
      "Dockerfile",
      "docker-compose*.yml",
      "install.sh",
      "uninstall.sh",
      "components.json",
      "tsconfig.json",
      "vitest.config.ts",
      "eslint.config.mjs",
      "postcss.config.mjs",
      "pnpm-workspace.yaml",
    ],
  },
};

export default nextConfig;
