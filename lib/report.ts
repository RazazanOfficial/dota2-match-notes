import { heroImage } from "@/data/heroes";
import { queueLabel, roleLabel } from "./constants";
import {
  faNumber,
  faPercent,
  formatFullDate,
  formatWeekRange,
  getWeekDates,
  getWeekLabel,
  summarizeMatches,
  summarizeWeek,
  toDateKey,
} from "./date";
import type { Profile } from "./types";

export function buildWeekReport(profile: Profile, anchorDate: string, weekIndex: number) {
  const dates = getWeekDates(anchorDate, weekIndex);
  const week = summarizeWeek(profile.days, dates);
  const lines = [
    `گزارش ${getWeekLabel(weekIndex)}`,
    formatWeekRange(dates),
    "",
    `مجموع: ${faNumber.format(week.games)} بازی | ${faNumber.format(week.wins)} برد | ${faNumber.format(week.losses)} باخت | نرخ برد ${faPercent.format(week.winRate)}`,
  ];

  dates.forEach((date) => {
    const day = profile.days[toDateKey(date)] || { completed: false, matches: [] };
    const summary = summarizeMatches(day.matches);
    lines.push("", `— ${formatFullDate(date)}`);
    if (!day.matches.length) {
      lines.push("بدون بازی");
      return;
    }
    day.matches
      .slice()
      .sort((a, b) => a.number - b.number)
      .forEach((match) => {
        lines.push(
          "",
          `بازی ${faNumber.format(match.number)} | ${match.result === "win" ? "برد" : "باخت"}`,
          `هیرو: ${match.heroName || "—"}`,
          `رول: ${roleLabel(match.role)}`,
          `نوع صف: ${queueLabel(match.queueType)}`,
          `بن‌ها: ${match.bans.map((ban) => ban.name).join("، ") || match.legacyBans || "—"}`,
          `یادداشت: ${match.notes || "—"}`,
        );
      });
    lines.push(
      "",
      `جمع روز: ${faNumber.format(summary.wins)} برد، ${faNumber.format(summary.losses)} باخت، نرخ برد ${faPercent.format(summary.winRate)}`,
    );
  });

  return lines.join("\n");
}

export { heroImage };
