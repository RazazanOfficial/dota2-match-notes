"""Build static ring colors from bundled icons. Development only; requires Pillow."""
from collections import defaultdict
import colorsys
import json
from pathlib import Path
import re
from PIL import Image

desktop = Path(__file__).resolve().parents[1]
hero_source = (desktop.parent / "web/data/heroes.ts").read_text()
heroes = re.findall(r'\{ id: (\d+), slug: "([^"]+)"', hero_source)


def image_pixels(path):
    image = Image.open(path).convert("RGBA")
    return image.get_flattened_data() if hasattr(image, "get_flattened_data") else image.getdata()


def palette(pixels):
    buckets = defaultdict(list)
    for red, green, blue, alpha in pixels:
        hue, saturation, value = colorsys.rgb_to_hsv(red / 255, green / 255, blue / 255)
        if alpha < 100 or value < .18 or saturation < .18:
            continue
        buckets[(int(hue * 18), int(value * 3))].append((red, green, blue, alpha / 255 * (.5 + saturation)))
    candidates = []
    for values in buckets.values():
        weight = sum(pixel[3] for pixel in values)
        rgb = tuple(round(sum(pixel[index] * pixel[3] for pixel in values) / weight) for index in range(3))
        candidates.append((weight, rgb))
    if not candidates:
        return ["#8a9cb4", "#b2bfd0", "#647b9a"]
    candidates.sort(reverse=True)
    chosen = [candidates[0][1]]
    while len(chosen) < 3:
        remaining = [(weight * min(sum((rgb[i] - old[i]) ** 2 for i in range(3)) for old in chosen) ** .5, rgb) for weight, rgb in candidates if rgb not in chosen]
        if not remaining:
            chosen.append(chosen[0])
        else:
            chosen.append(max(remaining)[1])
    return ["#%02x%02x%02x" % rgb for rgb in chosen]


hero_palettes = {}
for hero_id, slug in heroes:
    path = desktop / "public/icons" / (slug + ".png")
    # Fail on missing assets rather than assigning invented hero colors.
    hero_palettes[int(hero_id)] = palette(image_pixels(path))
position_palettes = {0: ["#8795ac", "#b0b8c4", "#59667d"]}
svg = (desktop / "public/positions/pos_1.svg").read_text()
swatches = re.findall(r'stop-color="(#[a-fA-F0-9]{6})"', svg)
position_palettes[1] = palette([tuple(int(color[i:i+2], 16) for i in (1, 3, 5)) + (255,) for color in swatches])
for position in range(2, 6):
    position_palettes[position] = palette(image_pixels(desktop / f"public/positions/pos_{position}.webp"))
output = desktop / "src/distributionPalettes.ts"
output.write_text("// Generated from local icons by scripts/generate-distribution-palettes.py.\n"
    "export type RingPalette = readonly [string, string, string];\n"
    "export const HERO_RING_PALETTES: Readonly<Record<number, RingPalette>> = " + json.dumps(hero_palettes, indent=2) + ";\n"
    "export const POSITION_RING_PALETTES: Readonly<Record<number, RingPalette>> = " + json.dumps(position_palettes, indent=2) + ";\n"
    "export function distributionPalette(id: number, hero: boolean): RingPalette {\n"
    "    return (hero ? HERO_RING_PALETTES : POSITION_RING_PALETTES)[id] || POSITION_RING_PALETTES[0];\n}\n")
print(f"Generated {len(hero_palettes)} hero and {len(position_palettes)} position palettes")
