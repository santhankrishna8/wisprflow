import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig({
  base: "./",
  define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
  plugins: [
    react(),
    tailwindcss(),
    {
      // The dev server's websocket origins are only needed in development.
      name: "strip-dev-csp",
      apply: "build",
      transformIndexHtml: (html) => html.replaceAll(" ws://localhost:5173 http://localhost:5173", ""),
    },
  ],
  server: { port: 5173, strictPort: true },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        overlay: resolve(__dirname, "overlay.html"),
        bubble: resolve(__dirname, "bubble.html"),
      },
    },
  },
});
