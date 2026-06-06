import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 親ディレクトリにも lockfile があるため、ワークスペースルートを明示する
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
