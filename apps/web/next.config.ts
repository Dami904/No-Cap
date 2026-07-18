import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  transpilePackages: ["@nocap/shared"],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@nocap/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
    };
    return config;
  },
};

export default nextConfig;
