// Bundle size budget check. Run after `npm run build`.
// Warns above the target, fails above the hard cap (brief section 1 & 7).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSizeSync } from "gzip-size";

const TARGET_KB = 150; // aim under this
const HARD_CAP_KB = 250; // fail above this

const distDir = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");

function allFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...allFiles(p));
    else out.push(p);
  }
  return out;
}

let files;
try {
  files = allFiles(distDir).filter((f) => f.endsWith(".js") || f.endsWith(".css"));
} catch {
  console.error(`No dist/ found at ${distDir}. Run "npm run build" first.`);
  process.exit(1);
}

let totalGzip = 0;
const rows = [];
for (const f of files) {
  const buf = readFileSync(f);
  const gz = gzipSizeSync(buf);
  totalGzip += gz;
  rows.push({ file: f.slice(distDir.length + 1), raw: buf.length, gzip: gz });
}

const kb = (n) => (n / 1024).toFixed(1) + " KB";
rows.sort((a, b) => b.gzip - a.gzip);
console.log("\nWall Panel bundle size (JS + CSS):\n");
for (const r of rows) console.log(`  ${r.file.padEnd(28)} ${kb(r.raw).padStart(10)} raw   ${kb(r.gzip).padStart(10)} gzip`);
console.log("  " + "-".repeat(60));
console.log(`  ${"TOTAL".padEnd(28)} ${"".padStart(10)}       ${kb(totalGzip).padStart(10)} gzip\n`);

const totalKb = totalGzip / 1024;
if (totalKb > HARD_CAP_KB) {
  console.error(`FAIL: ${kb(totalGzip)} gzip exceeds hard cap of ${HARD_CAP_KB} KB.`);
  process.exit(1);
} else if (totalKb > TARGET_KB) {
  console.warn(`WARN: ${kb(totalGzip)} gzip is over the ${TARGET_KB} KB target (cap ${HARD_CAP_KB} KB).`);
} else {
  console.log(`OK: under the ${TARGET_KB} KB target.`);
}
