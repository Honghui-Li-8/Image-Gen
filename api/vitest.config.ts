import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "image-gen-shared": new URL("../shared/src/index.ts", import.meta.url).pathname,
    },
  },
  test: {
    fileParallelism: false,
    globals: true,
    include: ["src/**/*.test.ts"],
  },
});
