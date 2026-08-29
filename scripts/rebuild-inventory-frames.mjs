import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frameDirectory = path.join(root, "public", "match-details");
const frameNames = [
  "inventory-none.png",
  "inventory-scepter.png",
  "inventory-shard.png",
  "inventory-scepter-shard.png",
];

const slotWidth = 275;
const slotHeight = 200;
const slotLefts = [350, 694, 1_038];
const slotTops = [148, 377, 606];

const slots = slotTops.flatMap((top) => slotLefts.map((left) => `
  <g>
    <rect x="${left - 24}" y="${top - 8}" width="323" height="216" rx="2"
      fill="url(#gold)" stroke="#2b1608" stroke-width="4"/>
    <rect x="${left - 15}" y="${top - 2}" width="305" height="207" rx="1"
      fill="none" stroke="#f0ae34" stroke-width="3" opacity=".9"/>
    <rect x="${left}" y="${top}" width="${slotWidth}" height="${slotHeight}"
      fill="url(#slot)" stroke="#050607" stroke-width="7"/>
    <path d="M ${left + 5} ${top + slotHeight - 6} H ${left + slotWidth - 5}"
      stroke="#1683aa" stroke-width="4" opacity=".92"/>
    <path d="M ${left + 7} ${top + slotHeight - 2} H ${left + slotWidth - 7}"
      stroke="#062f45" stroke-width="3" opacity=".9"/>
  </g>`)).join("");

const overlay = Buffer.from(`
<svg width="1672" height="941" viewBox="0 0 1672 941" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#d78a20"/>
      <stop offset=".24" stop-color="#f0a62b"/>
      <stop offset=".55" stop-color="#9f5313"/>
      <stop offset=".78" stop-color="#d77d1b"/>
      <stop offset="1" stop-color="#6c330c"/>
    </linearGradient>
    <radialGradient id="slot" cx="50%" cy="40%" r="75%">
      <stop offset="0" stop-color="#272b2d"/>
      <stop offset=".58" stop-color="#1b1f21"/>
      <stop offset="1" stop-color="#0a0c0d"/>
    </radialGradient>
  </defs>
  ${slots}
</svg>`);

for (const frameName of frameNames) {
  const framePath = path.join(frameDirectory, frameName);
  const output = await sharp(framePath)
    .composite([{ input: overlay, left: 0, top: 0 }])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  await sharp(output).toFile(framePath);
}

console.log(`Rebuilt ${frameNames.length} inventory frames with ${slotWidth}x${slotHeight} slots.`);
