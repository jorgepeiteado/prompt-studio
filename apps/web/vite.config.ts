import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Design decision: loopback-only host + /api proxy to the local Hono server.
export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      // Browser never talks to ComfyUI directly — all /api goes to Hono :8787.
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});