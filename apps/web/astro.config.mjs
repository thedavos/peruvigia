import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "astro/config";
import vue from "@astrojs/vue";
import tailwindcss from "@tailwindcss/vite";

const webRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  integrations: [vue()],
  vite: {
    resolve: {
      alias: {
        "@api": path.resolve(webRoot, "../api/src"),
        "@peruvigia/shared": path.resolve(webRoot, "../../packages/shared/src"),
        "@web": path.resolve(webRoot, "src"),
        "~": path.resolve(webRoot, "src"),
      },
    },
    plugins: [tailwindcss()],
  },
});
