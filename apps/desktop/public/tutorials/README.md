# Local replay tutorials

All screenshots are shipped inside the desktop installer. No VPS image request is needed.

- Folder setup: `replay-folder/fa/step-01.png` through `step-06.png`, and matching `en` files.
- Playback: `replay-playback/fa/step-02.png` through `step-07.png`, and matching `en` files.
- Playback step 1 reuses `replay-folder/{language}/step-01.png`. Do not duplicate it.
- Use exact dimensions **1672 × 941** for both languages. Preserve readable UI labels.
- Playback images may be added locally at the paths above. No extra instructional captions are rendered below images. A missing image shows only a neutral icon, with no coming-soon text.
- Add the final images at the paths above **before rebuilding the installer**. Copying them beside an already installed executable does not update its bundled assets.
- Step 3 offers a small floating `-console` copy control over the image.
- Step 6 reads `replay-playback/{language}/step-06.png` directly; no special placeholder or hardcoded caption is shown.
- The guide renders only its current image. Icon-only previous/next arrows sit at the vertical center of its two sides, reversed for Persian.
