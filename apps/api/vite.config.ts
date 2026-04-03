import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite-plus";

const apiRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "#api": path.resolve(apiRoot, "src"),
      "@peruvigia/shared": path.resolve(apiRoot, "../../packages/shared/src"),
    },
  },
  pack: {
    entry: ["src/server.ts"],
    format: ["esm"],
    outDir: "dist",
    clean: true,
    sourcemap: true,
    deps: {
      alwaysBundle: [/^@peruvigia\/shared(?:\/node)?$/],
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
  },
});
