import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a minimal .next/standalone folder (only the files actually
  // needed at runtime) - the Dockerfile copies just that + .next/static +
  // public/ into the final image, same idea as the backend's multi-stage
  // build/runtime split (Dockerfile.api).
  output: "standalone",
};

export default nextConfig;
