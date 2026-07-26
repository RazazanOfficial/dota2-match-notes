"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const Core = require("../core.js");

test("week one starts on Saturday 25 July 2026", () => {
  const dates = Core.getWeekDates("2026-07-25", 0);
  assert.equal(Core.toDateKey(dates[0]), "2026-07-25");
  assert.equal(Core.formatWeekday(dates[0]), "شنبه");
  assert.equal(Core.toDateKey(dates[6]), "2026-07-31");
  assert.equal(Core.getWeekLabel(0), "هفته اول");
});

test("next weeks advance by seven days", () => {
  const dates = Core.getWeekDates("2026-07-25", 1);
  assert.equal(Core.toDateKey(dates[0]), "2026-08-01");
  assert.equal(Core.getWeekLabel(1), "هفته دوم");
});

test("match summary counts wins, losses and win rate", () => {
  const summary = Core.summarizeMatches([
    { result: "win" },
    { result: "loss" },
    { result: "win" },
  ]);

  assert.deepEqual(summary, {
    games: 3,
    wins: 2,
    losses: 1,
    winRate: 2 / 3,
  });
});

test("state normalization keeps safe match data", () => {
  const state = Core.normalizeState(
    {
      activeWeek: -2,
      days: {
        "2026-07-25": {
          completed: true,
          matches: [
            {
              id: "one",
              number: "۲",
              hero: "Axe",
              bans: "Puck",
              notes: "Good lane",
              result: "win",
            },
          ],
        },
      },
    },
    "2026-07-25",
  );

  assert.equal(state.activeWeek, 0);
  assert.equal(state.days["2026-07-25"].matches[0].number, 2);
  assert.equal(state.days["2026-07-25"].matches[0].hero, "Axe");
});

test("report includes daily and weekly totals", () => {
  const state = Core.normalizeState(
    {
      days: {
        "2026-07-25": {
          completed: true,
          matches: [
            {
              id: "one",
              number: 1,
              hero: "Axe",
              bans: "Puck",
              notes: "کنترل بهتر لین",
              result: "win",
            },
          ],
        },
      },
    },
    "2026-07-25",
  );

  const report = Core.buildWeekReport(state, 0);
  assert.match(report, /گزارش هفته اول/);
  assert.match(report, /۱ بازی/);
  assert.match(report, /هیرو: Axe/);
  assert.match(report, /کنترل بهتر لین/);
});
