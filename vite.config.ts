import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import themePlugin from "@replit/vite-plugin-shadcn-theme-json";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig(async () => {
  // themePlugin is a build-time-only npm package (no Replit runtime
  // dependency): it turns theme.json into the app's CSS theme variables.
  const plugins = [react(), themePlugin()];

  return {
    plugins,
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "client", "src"),
        "@shared": path.resolve(__dirname, "shared"),
        // ⚠ If you import images from outside /client, Vite may block them.
        // Prefer placing images under client/public or client/src/assets.
        "@assets": path.resolve(__dirname, "attached_assets"),
      },
    },
    // DEV SERVER (npm run dev): proxy /api → FastAPI on 8000
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: "http://localhost:8080", // ✅ CORRECT
          changeOrigin: true,
        },
      },
    },
    // Frontend root & build output
    root: path.resolve(__dirname, "client"),
    build: {
      outDir: path.resolve(__dirname, "dist/public"),
      emptyOutDir: true,
    },
  };
});
