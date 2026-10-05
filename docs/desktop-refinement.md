# Desktop refinement

This patch applies over the previously delivered desktop redesign. Archive paths are relative to the monorepo root. It contains source changes only, with no apply scripts or build output.

The dashboard uses a compact profile toolbar, four small statistics, six shortcuts, recent matches and an independently filtered playstyle chart. The empty win/activity panels are removed. Avatar data comes from the supplied Session; offline profiles use a generic user icon.

Match rows share fixed table columns: hero portrait, position, W/L, K/D/A, the existing performance score as IMP, mode icon, compact analysis action, one duration and a copyable bare match ID. Only eight history rows are rendered per page. The profile and chart periods have independent state. Ring sweep angles come from actual segment counts, and both position and hero tooltips include count, percentage, wins, losses and win rate. SVG paths also support a single 100% segment.

The custom Persian calendar reuses `buildPersianCalendarMonth` and the original Saturday week convention. The production manual-sync service rejects requests before the Saturday of the registration week. Desktop selection follows that same boundary, clips month ranges to the tracking boundary and clips every range to today. Day/week/month preview cooldowns remain independent at 90 seconds / 3 minutes / 120 minutes. Account connection and production match-sync IPC are still absent in this foundation: history is explicitly fictional and the fetch dialog submits preview requests, not a real server sync. The existing web sync API supports day/week scopes; a production monthly scope must be connected with the later account/backend integration.

Match summary now has ten readable selectable hero cards and one large selected-player detail/inventory region. The original inventory artwork, slot coordinates, backpack, neutral item, level and Aghanim states are reused at the correct 1672:941 aspect ratio. Duplicate IDs and the selected-metrics/summary-focus panels are removed. Journal and images remain Coming soon.

The full-analysis UI is new desktop code, with no import of MatchAnalysisPanel, MatchMapEngine or their legacy styles. The numerical engines and typed values are preserved:

| Area | Preserved values |
| --- | --- |
| Performance | Existing score, role weights, six domains, context fallbacks, all twelve benchmarks, raw/formatted values, totals, percentiles, quality, metric weights, confidence and source |
| Lane | All eight efficiency parts, actual/reference values, maximum weights, covered subtotal, bonus, reference month/version/cohort/sample counts, notes; ten-minute lane comparison and evidence |
| Reference | Hero-position/position samples and blend weight, patch/rank/mode, applicability, position shares, snapshot and limitations; manual role swapping uses the existing override engine |
| Progression | Gold, XP, LH, deny, damage, healing, impact, gains, state and labels; same-position/all-player comparison, milestones/cohort, events, item timings and team gold/XP advantage |
| Map | Original map/landmarks, type and landmark filters, timed trail and minute control; farm source mix/windows/totals/recovery/travel/impact, objectives/conversion/delay/events, ward lifetime/dewards/productivity, invisibility/detection gaps, stacks/smoke/dust/gem and responsibility/contribution values |
| Ownership | Purchaser, holder, purchase/transfer timing, transfer type, confidence, evidence and limitations |
| Comparison | All ten players, position, existing score, lane score, K/D/A and every benchmark |

The replay library has Find & download / Downloaded replays tabs. Tauri selects and persists the Dota installation directory, creates its `game/dota/replays` directory, and lists valid numeric-ID `.dem` files from disk. A numeric-ID native download obtains a public OpenDota replay URL, accepts only the corresponding Valve replay host/path, streams bzip2 decoding, validates demo magic, limits output to 2 GiB, and publishes `<matchId>.dem` without overwriting an existing file. Failed downloads are cleaned up and are not added to the library. Copyable play commands are `playdemo replays/<matchId>`. Public replay links can expire or be unavailable; account/archive-server integration is not implied.

Validation: frontend production build, workspace type checks, 273 existing web tests and 24 root tests passed. Root tests include 17 desktop cases covering the redesign, registration boundaries, independent chart controls, clipboard and mocked native replay success/failure. Rust unit tests are included for IDs, allowed URLs, Dota folder detection, bzip2/demo decoding and invalid content. Rust compilation, those native tests and Windows filesystem/download behavior could not be executed here because cargo/rustc are unavailable. Browser screenshot verification is also unavailable in this environment.
