import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // The major-cves route makes two NVD calls per request (v3 + v4
    // severity queries), serialized by the shared module-level throttle
    // (~6s gap unauthenticated) — the default 5s timeout isn't enough.
    testTimeout: 15000,
  },
});
