import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // !! 주의 !!
    // 프로젝트에 타입 오류가 있어도 프로덕션 빌드를 강제로 성공시킵니다.
    ignoreBuildErrors: true,
  },
  eslint: {
    // ESLint 오류가 있어도 빌드를 무시하고 진행합니다.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;