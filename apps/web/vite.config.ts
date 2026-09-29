import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    hmr: false,
    watch: { usePolling: false, ignored: ["**/node_modules/**", "**/.git/**"] },
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
        xfwd: true,
        timeout: 600_000,
        proxyTimeout: 600_000,
      },
      "/ws": { target: "http://127.0.0.1:3000", ws: true, changeOrigin: true, xfwd: true },
    },
  },
  preview: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
        xfwd: true,
        timeout: 600_000,
        proxyTimeout: 600_000,
      },
      "/ws": { target: "http://127.0.0.1:3000", ws: true, changeOrigin: true, xfwd: true },
    },
  },
});
