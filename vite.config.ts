import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  // Allow Vite to bundle Web Workers as ES modules
  worker: {
    format: "es",
  },

  server: {
    headers: {
      // Required for SharedArrayBuffer / WASM cross-origin isolation
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },

  // Pre-bundle @mediapipe/hands so it is rewritten as ESM
  optimizeDeps: {
    include: ["@mediapipe/hands"],
  },

  build: {
    target: "esnext",
    commonjsOptions: {
      include: [/@mediapipe\/hands/],
    },
  },
});
