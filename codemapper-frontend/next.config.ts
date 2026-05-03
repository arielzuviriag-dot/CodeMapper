import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["monaco-editor"],
  outputFileTracingRoot: path.resolve(__dirname),
};

export default nextConfig;
