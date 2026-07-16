import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,   // reachable from a tablet on your LAN
    port: 5173,
  },
});
