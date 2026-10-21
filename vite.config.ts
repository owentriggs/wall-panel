import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { resolve } from "node:path";

// Two modes:
//  - `vite` / `vite dev`  -> serves index.html (dev shell + mock HA), for `npm run dev`
//  - `vite build`         -> bundles src/panel.tsx into ONE file: dist/wall-panel.js
//                            (this is the file you copy to /config/www/wall-panel/)
export default defineConfig({
  plugins: [preact()],
  build: {
    target: "es2019",
    outDir: "dist",
    emptyOutDir: true,
    // Keep it a single self-contained JS file so install = copy one file.
    // Inline the bundled woff2 fonts as base64 (Task 5) so the panel makes no
    // external requests at runtime and stays one file; other assets keep the
    // 4 KB default so nothing unexpected balloons the bundle.
    assetsInlineLimit: (filePath: string) => (filePath.endsWith(".woff2") ? true : undefined),
    cssCodeSplit: false,
    rollupOptions: {
      input: resolve(__dirname, "src/panel.tsx"),
      output: {
        format: "es",
        inlineDynamicImports: true,
        entryFileNames: "wall-panel.js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
});
