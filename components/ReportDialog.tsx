"use client";

import { heroById, heroImage } from "@/data/heroes";
import { queueLabel, roleLabel } from "@/lib/constants";
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
} from "@/lib/date";
import { buildWeekReport } from "@/lib/report";
import type { Profile } from "@/lib/types";

interface ReportDialogProps {
  open: boolean;
  profile: Profile;
  anchorDate: string;
  weekIndex: number;
  onClose: () => void;
  onToast: (message: string) => void;
}

export default function ReportDialog({
  open,
  profile,
  anchorDate,
  weekIndex,
  onClose,
  onToast,
}: ReportDialogProps) {
  if (!open) return null;
  const dates = getWeekDates(anchorDate, weekIndex);
  const summary = summarizeWeek(profile.days, dates);
  const text = buildWeekReport(profile, anchorDate, weekIndex);

  async function copy() {
    await navigator.clipboard.writeText(text);
    onToast("گزارش کپی شد");
  }

  function download() {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `dota2-week-${weekIndex + 1}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    onToast("گزارش آماده شد");
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal report-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <p className="modal-kicker">{getWeekLabel(weekIndex)}</p>
            <h2 id="report-title">گزارش هفتگی</h2>
          </div>
          <button className="close-button" type="button" onClick={onClose} aria-label="بستن">
            ×
          </button>
        </header>

        <div className="report-scroll">
          <section className="report-summary">
            <div>
              <span>بازه</span>
              <strong>{formatWeekRange(dates)}</strong>
            </div>
            <div><span>بازی</span><strong>{faNumber.format(summary.games)}</strong></div>
            <div><span>برد</span><strong>{faNumber.format(summary.wins)}</strong></div>
            <div><span>باخت</span><strong>{faNumber.format(summary.losses)}</strong></div>
            <div><span>نرخ برد</span><strong>{faPercent.format(summary.winRate)}</strong></div>
          </section>

          <div className="report-days">
            {dates.map((date) => {
              const day = profile.days[toDateKey(date)] || { completed: false, matches: [] };
              const daySummary = summarizeMatches(day.matches);
              return (
                <article className="report-day" key={toDateKey(date)}>
                  <header>
                    <div>
                      <h3>{formatFullDate(date)}</h3>
                      <span>{day.completed ? "روز جمع‌بندی شد" : "هنوز جمع‌بندی نشده"}</span>
                    </div>
                    <strong>
                      {faNumber.format(daySummary.wins)} برد · {faNumber.format(daySummary.losses)} باخت
                    </strong>
                  </header>
                  {day.matches.length ? (
                    <div className="report-matches">
                      {day.matches
                        .slice()
                        .sort((a, b) => a.number - b.number)
                        .map((match) => (
                          <div className="report-match" key={match.id}>
                            {match.heroId && heroById(match.heroId) && (
                              <img src={heroImage(heroById(match.heroId)!)} alt="" />
                            )}
                            <div>
                              <strong lang="en">{match.heroName || "—"}</strong>
                              <span lang="en">
                                {roleLabel(match.role)} · {queueLabel(match.queueType)}
                              </span>
                              {match.notes && <p>{match.notes}</p>}
                            </div>
                            <span className={`result-badge is-${match.result}`}>
                              بازی {faNumber.format(match.number)} ·{" "}
                              {match.result === "win" ? "برد" : "باخت"}
                            </span>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className="report-empty">هنوز مچی ثبت نشده</p>
                  )}
                </article>
              );
            })}
          </div>
        </div>

        <footer className="modal-actions">
          <button className="secondary-button" type="button" onClick={download}>
            دریافت گزارش
          </button>
          <span className="action-spacer" />
          <button className="primary-button" type="button" onClick={copy}>
            کپی گزارش
          </button>
        </footer>
      </section>
    </div>
  );
}
