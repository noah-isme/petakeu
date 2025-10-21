import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  server: {
    port: 5175,
    // Proxy disabled - using MSW for development
    // proxy: {
    //   "/api": "http://localhost:4000"
    // }
  },
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts"
  }
});
