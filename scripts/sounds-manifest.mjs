// Lists every mp3 under public/sounds into public/sounds/manifest.json so the
// game knows which real samples exist; any sound without a file falls back to
// the built-in synthesized one. Runs before every build (npm "prebuild").
import { readdirSync, statSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(process.cwd(), "public", "sounds");
if (!existsSync(root)) mkdirSync(root, { recursive: true });
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(mp3|ogg|wav|m4a)$/i.test(name)) files.push(relative(root, p).split("\\").join("/"));
  }
};
walk(root);
files.sort();
writeFileSync(join(root, "manifest.json"), JSON.stringify(files, null, 2) + "\n");
console.log(`sounds manifest: ${files.length} file(s)`);
