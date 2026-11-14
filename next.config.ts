import type { NextConfig } from "next";

// The public Vercel deployment uses the demo database until its environment
// variables are set. Local development and previews use their own configuration.
const usePublicDemoSupabase =
  process.env.VERCEL_ENV === "production" &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const nextConfig: NextConfig = {
  ...(usePublicDemoSupabase && {
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://drgbnsqnwmqphescosdt.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_KyhfPiAz6g5oe7Bm8zutCg_6cNeah2F",
    },
  }),
  cacheComponents: true,
  partialPrefetching: true,
  outputFileTracingExcludes: {
    "/*": [".local-replay/**/*"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
