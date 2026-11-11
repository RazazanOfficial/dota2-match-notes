# Replay playback media

Tutorial images are source assets. Nonessential media are downloaded through the
versioned desktop asset pack, not all bundled inside the installer. See the
[asset and installation guide](../../../../docs/desktop-assets-and-install.fa.md).

- Folder discovery is automatic; the old manual folder-selection walkthrough is
  retired from the client. Its old screenshots are retained as source history.
- `replay-folder/{language}/step-01.png` remains because playback step 1 reuses it.
- Playback images use `replay-playback/{language}/step-02.png` through `step-07.png`.
- Preserve the existing 1672 by 941 dimensions and readable fa/en UI labels.
- After changing media, regenerate and review `apps/desktop/asset-manifest.json`,
  publish the matching objects on Iran, then build the matching installer.
- Copying images beside an installed executable does not update its embedded
  manifest or the verified media cache.
- Previous/next arrows follow the UI language. Missing images must not expose a
  broken filesystem path or invent instructions.
