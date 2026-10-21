// After `vite build`, copy the single JS bundle into the integration folder so
// HACS ships it (HACS does not run a build — it distributes the repo files).
// This committed copy at custom_components/wall_panel/wall-panel.js is what
// Home Assistant actually serves.
import { copyFileSync, mkdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "dist", "wall-panel.js");
const destDir = join(root, "custom_components", "wall_panel");
const dest = join(destDir, "wall-panel.js");

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);

const kb = (statSync(dest).size / 1024).toFixed(1);
console.log(`Copied bundle -> custom_components/wall_panel/wall-panel.js (${kb} KB raw)`);
