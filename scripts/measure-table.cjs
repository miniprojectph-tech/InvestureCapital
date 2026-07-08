// Measure placeholder positions in the new tongits table.png.
const sharp = require("sharp");

(async () => {
  const path = "public/tongits/table.png";
  const meta = await sharp(path).metadata();
  console.log(`dims: ${meta.width}x${meta.height}  channels: ${meta.channels}`);

  const { data, info } = await sharp(path).raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, ch = info.channels;
  const at = (x, y) => {
    const i = (y * W + x) * ch;
    return [data[i], data[i + 1], data[i + 2]];
  };

  const isWhite = (x, y) => {
    const [r, g, b] = at(x, y);
    return r > 235 && g > 235 && b > 235;
  };

  const runs = [];
  const step = 2;
  for (let y = 0; y < H; y += step) {
    let inRun = false, xs = 0;
    for (let x = 0; x < W; x += step) {
      if (isWhite(x, y)) {
        if (!inRun) { xs = x; inRun = true; }
      } else if (inRun) {
        const runLen = x - xs;
        if (runLen > 20 && runLen < 250) runs.push({ x0: xs, x1: x, y });
        inRun = false;
      }
    }
  }

  const clusters = [];
  for (const r of runs) {
    const cx = (r.x0 + r.x1) / 2, cy = r.y;
    let match = null;
    for (const c of clusters) {
      if (Math.abs(c.cx - cx) < 70 && Math.abs(c.maxY - cy) < 40) { match = c; break; }
    }
    if (match) {
      match.minX = Math.min(match.minX, r.x0);
      match.maxX = Math.max(match.maxX, r.x1);
      match.minY = Math.min(match.minY, r.y);
      match.maxY = Math.max(match.maxY, r.y);
      match.cx = (match.minX + match.maxX) / 2;
      match.n++;
    } else {
      clusters.push({ cx, cy, minX: r.x0, maxX: r.x1, minY: r.y, maxY: r.y, n: 1 });
    }
  }
  const big = clusters
    .filter((c) => c.maxX - c.minX > 60 && c.maxY - c.minY > 60)
    .sort((a, b) => a.minY - b.minY || a.minX - b.minX);

  console.log("\nLarge white regions:");
  for (const c of big) {
    const w = c.maxX - c.minX, h = c.maxY - c.minY;
    const pctL = ((c.minX / W) * 100).toFixed(2);
    const pctT = ((c.minY / H) * 100).toFixed(2);
    const pctW = ((w / W) * 100).toFixed(2);
    const pctH = ((h / H) * 100).toFixed(2);
    console.log(`  px[${c.minX},${c.minY} ${w}x${h}]  pct[l=${pctL} t=${pctT} w=${pctW} h=${pctH}]`);
  }

  console.log("\nAnchor color samples:");
  const samples = [
    ["POT bar center", 0.50, 0.055],
    ["Trophy1 center", 0.29, 0.055],
    ["Trophy2 center", 0.71, 0.055],
    ["Stock center", 0.44, 0.29],
    ["Discard center", 0.54, 0.29],
    ["Right rail 1", 0.94, 0.49],
    ["Right rail 2", 0.94, 0.60],
    ["Right rail 3", 0.94, 0.71],
    ["Right rail 4", 0.94, 0.82],
  ];
  for (const [label, xp, yp] of samples) {
    const x = Math.round(W * xp), y = Math.round(H * yp);
    const [r, g, b] = at(x, y);
    console.log(`  ${label.padEnd(20)}  px(${x},${y})  rgb(${r},${g},${b})`);
  }
})();
