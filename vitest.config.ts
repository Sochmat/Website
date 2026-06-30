import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts", "src/**/*.test.ts", "scripts/**/*.test.ts"],
    testTimeout: 30000, // memory-mongo first boot
  },
});
