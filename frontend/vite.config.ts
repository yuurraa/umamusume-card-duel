import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    ...(command === "build"
      ? [visualizer({ filename: "dist/stats.html", gzipSize: true, brotliSize: true, open: false })]
      : []),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("react")) return "react-vendor";
            return "vendor";
          }
          if (id.includes("/src/screens/")) return "screens";
          if (id.includes("/src/match/")) return "match";
          if (id.includes("/shared/")) return "shared";
          return undefined;
        }
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8787"
    }
  }
}));
