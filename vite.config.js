import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev: vite serves the UI on 5173 and proxies API + WS to the Node server
// on 8080. Production: the Node server serves dist/ itself — one origin.
export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": "http://localhost:8080",
      "/ws": { target: "ws://localhost:8080", ws: true },
    },
  },
  build: { outDir: "dist" },
});
