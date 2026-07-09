// Detect slot bounds in victory-popup.png so overlays can snap to them.
const sharp = require("sharp");

(async () => {
  const path = "public/tongits/victory-popup.png";
  const meta = await sharp(path).metadata();
  console.log(`dims: ${meta.width}x${meta.height}  channels: ${meta.channels}  alpha: ${meta.hasAlpha}`);

  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, ch = info.channels;
  const at = (x, y) => {
    const i = (y * W + x) * ch;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  };

  // Sample points to inspect colors at various expected slot locations.
  const samples = [
    ["Winner avatar center", 0.30, 0.42],
    ["Winner name banner center", 0.63, 0.40],
    ["Points banner center (below name)", 0.63, 0.55],
    ["Runner-up 1 avatar", 0.31, 0.68],
    ["Runner-up 2 avatar", 0.31, 0.79],
    ["Runner-up 1 text row", 0.55, 0.68],
    ["Runner-up 2 text row", 0.55, 0.79],
    ["Timer badge center", 0.50, 0.93],
    ["CONTINUE button center", 0.31, 0.93],
    ["QUIT button center", 0.69, 0.93],
  ];
  for (const [label, xp, yp] of samples) {
    const x = Math.round(W * xp), y = Math.round(H * yp);
    const [r, g, b, a] = at(x, y);
    console.log(`  ${label.padEnd(35)}  px(${x},${y})  rgba(${r},${g},${b},${a})`);
  }

  // Horizontal scan for the NAME BANNER — big tan/cream slot next to the winner.
  const isTan = (x, y) => {
    const [r, g, b, a] = at(x, y);
    return a > 200 && r > 200 && g > 180 && b > 100 && b < 200 && r >= g && g >= b;
  };
  const isBlueDeep = (x, y) => {
    const [r, g, b, a] = at(x, y);
    return a > 200 && r < 60 && g < 90 && b > 100 && b < 180;
  };

  const findBounds = (matcher, y0Pct, y1Pct, x0Pct, x1Pct, label) => {
    const y0 = Math.round(H * y0Pct), y1 = Math.round(H * y1Pct);
    const x0 = Math.round(W * x0Pct), x1 = Math.round(W * x1Pct);
    let minX = W, minY = H, maxX = 0, maxY = 0, count = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (matcher(x, y)) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          count++;
        }
      }
    }
    if (count === 0) return console.log(`${label}: no match in window`);
    console.log(
      `${label}: px[${minX},${minY} ${maxX - minX}x${maxY - minY}] pct[l=${((minX / W) * 100).toFixed(1)} t=${((minY / H) * 100).toFixed(1)} w=${(((maxX - minX) / W) * 100).toFixed(1)} h=${(((maxY - minY) / H) * 100).toFixed(1)}] count=${count}`
    );
  };

  console.log("\nSlot bounds:");
  findBounds(isTan, 0.32, 0.5, 0.45, 0.95, "Winner name banner (tan)");
  findBounds(isBlueDeep, 0.48, 0.62, 0.45, 0.95, "Points banner (blue)");
  findBounds(isBlueDeep, 0.83, 0.98, 0.06, 0.32, "CONTINUE button region (blue?)");
  findBounds(isBlueDeep, 0.83, 0.98, 0.55, 0.95, "QUIT button (blue)");
})();
