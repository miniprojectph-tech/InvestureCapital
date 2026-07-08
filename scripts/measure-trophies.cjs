// Scan specific horizontal rows to find trophy edges precisely.
const sharp = require("sharp");

(async () => {
  const path = "public/tongits/table.png";
  const { data, info } = await sharp(path).raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, ch = info.channels;
  const at = (x, y) => {
    const i = (y * W + x) * ch;
    return [data[i], data[i + 1], data[i + 2]];
  };

  // A trophy interior is a very specific dark blue: distinct from felt and wood.
  // Felt: r<30, g in 90-180, b in 200-250
  // Wood: r 100-200, g 50-100, b 20-50
  // Trophy interior: r < 20, g in 35-60, b in 130-165
  const isTrophyInner = (x, y) => {
    const [r, g, b] = at(x, y);
    return r < 30 && g >= 30 && g <= 70 && b >= 120 && b <= 170;
  };

  // Scan a middle row of the trophy vertically to find its exact width.
  // The trophies are centered vertically around ~9% of canvas height.
  // Let's find the vertical extent first by scanning column x=~28% (should hit trophy1 interior).
  const findVerticalExtent = (xPx) => {
    let top = -1, bottom = -1;
    for (let y = 0; y < H * 0.25; y++) {
      if (isTrophyInner(xPx, y)) {
        if (top === -1) top = y;
        bottom = y;
      }
    }
    return { top, bottom };
  };

  const findHorizontalExtent = (yPx, xLo, xHi) => {
    let left = -1, right = -1;
    for (let x = xLo; x < xHi; x++) {
      if (isTrophyInner(x, yPx)) {
        if (left === -1) left = x;
        right = x;
      }
    }
    return { left, right };
  };

  // Try scanning near expected trophy 1 center (~28%, ~9%)
  const scan = (label, xPct, xLoPct, xHiPct) => {
    const xPx = Math.round(W * xPct);
    const v = findVerticalExtent(xPx);
    if (v.top === -1) {
      console.log(`${label}: no trophy interior at column x=${xPx}`);
      return;
    }
    const midY = Math.round((v.top + v.bottom) / 2);
    const h = findHorizontalExtent(midY, Math.round(W * xLoPct), Math.round(W * xHiPct));
    const px = { l: h.left, t: v.top, w: h.right - h.left, h: v.bottom - v.top };
    const pct = {
      l: (px.l / W) * 100,
      t: (px.t / H) * 100,
      w: (px.w / W) * 100,
      h: (px.h / H) * 100,
    };
    console.log(`${label}: px[${px.l},${px.t} ${px.w}x${px.h}]  pct[l=${pct.l.toFixed(2)} t=${pct.t.toFixed(2)} w=${pct.w.toFixed(2)} h=${pct.h.toFixed(2)}]  center(${((px.l + px.w/2)/W*100).toFixed(2)}%,${((px.t + px.h/2)/H*100).toFixed(2)}%)`);
  };

  scan("Trophy1", 0.28, 0.20, 0.35);
  scan("Trophy2", 0.72, 0.65, 0.80);
})();
