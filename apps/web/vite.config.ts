import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  server: {
    port: 5175,
    proxy: {
      "/api": "http://localhost:4000"
    }
  },
  plugins: [react()]
});
