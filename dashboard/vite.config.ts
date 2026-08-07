import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api/v1": {
        target: process.env.VITE_DEV_API_PROXY ?? "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
