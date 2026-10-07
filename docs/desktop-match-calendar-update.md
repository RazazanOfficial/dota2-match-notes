# Desktop match history and calendar update

Base: GitHub main `6bf978b063b4bd8c8e7d561727a1eb8a05fdbfbc`.

## Changes

- Loading screen during saved-session restoration, history, replay settings/history and lazy analysis loading. Initial placeholder stats and empty lists are not shown before their data arrives.
- Fetch calendar: styled selectable mode cards, Latin Gregorian digits, Persian Jalali digits, correct RTL arrows, close after a successful enqueue. Old completed jobs no longer display an up-to-date claim.
- Compact live fetch card: queue/processing state, date range, checked/imported counters and an animated activity indicator. A fetch completion triggers fresh history queries.
- Table: readable aligned headers; distinct icon-and-label mode chips; yellow Start analysis queues processing directly; progress stages and transfer metrics appear under the active row. Completed analyses are green. A separate eye button opens details, on the right in Persian and the left in English.
- Unknown position and unavailable IMP use localized question-mark hints. Position and IMP come from the same analysis builder used by full match details, rather than the old role/analyzedAt fields.
- Hero/position distribution includes the unknown-position group and its count, percentage and wins/losses. The chart keeps only its independent weekly/monthly switch.
- SQL migration `0029_match_analysis_summary.sql` adds a compact projection. Existing analyses are hydrated in bounded batches, without sending raw replay payloads in history responses. Position edits, raw replay updates and promoted monthly reference snapshots invalidate the projection.
- Release generation preserves standalone maintenance scripts, including the existing own-account reset script.

No files require manual deletion. No new environment variables or dependency changes are required.

## Local checks and Windows installer

Run from the project root:

```powershell
npm test
npm run typecheck
npm run desktop:installer
```

The installer is generated under `apps/desktop/src-tauri/target/release/bundle/nsis/`.

This ZIP includes freshly built Express runtime files under `apps/api/release/dist/`, plus the migration and updated parser import script. These runtime files can be copied as supplied; they do not need another local API build. Generated dist files are ignored by Git, so Git-based deployment must build them on the VPS.

To regenerate the runtime from source locally:

```powershell
npm run api:build
npm run release:prepare -w @dota-notes/api
```

## VPS deployment from GitHub

This update was deployed on October 7 in the existing `/var/www/dota2notes` Git checkout. The previous separate-source-directory instructions are obsolete. Use [the current deployment routine](deployment-ubuntu.md#۱۲-روال-هر-انتشار-بعدی) and [the replay task commands](replay-validation-progress.fa.md). The live API runtime is `apps/api/release`; the existing Next website remains in `apps/web`.

## Real-data acceptance checks

1. Open the installed app with a saved account, then reload it. Loading should appear before the dashboard; Login should not flash.
2. Fetch an eligible day/week/month. The calendar closes once queued; the live card shows progress, and rows refresh when imports finish.
3. Start analysis from a yellow table button. It must stay in the table and show stages. After completion the button turns green and position/IMP update.
4. Open details with the eye button and compare the profile player's position/IMP with the row.
5. Check unknown position slices, mode labels, both languages and calendar arrows/digit fonts.

Automated regression suites, workspace TypeScript checks and API/desktop builds are run in the implementation environment. The Windows NSIS installer and production VPS/data checks are performed on your machines.
