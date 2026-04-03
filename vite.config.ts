import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*.{js,ts,mts,cts,tsx,vue,css,json,md}": "vp check --fix",
  },
});
