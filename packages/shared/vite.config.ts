import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["src/index.ts", "src/node.ts"],
    dts: true,
    format: ["esm"],
    outDir: "dist",
    clean: true,
    sourcemap: true,
  },
});
