import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:3001", // points to the Express backend
      "/auth": "http://localhost:3001",
      "/trainer": "http://localhost:3001",
    },
  },
});
