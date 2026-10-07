# Stage 2: desktop connection to Express

This patch connects the installed Tauri app to the Express API. It expects the Stage 1 patch to be present at the project root.

## Changes

- Steam login opens in the system browser. The API returns a short-lived, single-use code to `dota-notes://auth/callback`; the desktop exchanges it with a PKCE verifier and keeps its API bearer only in memory. Restarting the app requires a new login.
- `GET /api/matches/me` returns eight rows per page and filtered match, hero, and position totals. The dashboard and matches screen use live server data. IMP remains empty when the API does not have a real score.
- Day/week/month match requests use the existing calendar and the API cooldowns. Match details and analysis use the existing journal/analysis endpoints.
- Replay lookup and archive requests use the API. Once archived, the native command downloads the authenticated archive, decompresses the bzip2 stream, checks the demo header and writes a `.dem` into the selected Dota `game/dota/replays` directory atomically.
- Migration `0025_desktop_auth_codes.sql` adds ephemeral authorization codes. It needs to be applied before desktop login is tested against a server.

## Configuration and verification

- Set `API_PUBLIC_ORIGIN` to the public HTTPS Express origin used by the desktop build, currently `https://api.dota2notes.ir`.
- Set `API_ALLOWED_ORIGINS` to include `http://tauri.localhost,tauri://localhost` for installed desktop variants. For local Vite development, also allow `http://127.0.0.1:1420`.
- On the desktop build, `VITE_API_ORIGIN` defaults to that production API origin; in development it defaults to `http://127.0.0.1:4100`. The native command intentionally allows only these origins. A different production domain requires changing the native origin allowlist and rebuilding the installer.
- The repo root lockfile was not supplied in this workspace. Run the root `npm install` after applying this patch to record the new deep-link dependency, then run the root workspace checks. Install and test the Windows Tauri build on Windows; Rust/Cargo and a Windows installer were unavailable in this workspace.
- After server migration and configuration, verify browser Steam login, deep-link return, paginated matches, manual sync cooldowns, analysis, and actual replay download against the VPS. Those live Steam/replay integrations were not executed here.
