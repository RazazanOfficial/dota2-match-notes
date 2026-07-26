(function initializeApp() {
  "use strict";

  const Core = window.DotaNotesCore;
  const STORAGE_KEY = "dota2-match-notes:v1";
  const ANCHOR_DATE = "2026-07-25";
  const FA_NUMBER = new Intl.NumberFormat("fa-IR");
  const FA_PERCENT = new Intl.NumberFormat("fa-IR", {
    style: "percent",
    maximumFractionDigits: 0,
  });

  const elements = {
    calendar: document.querySelector("#calendar"),
    weekLabel: document.querySelector("#weekLabel"),
    weekTitle: document.querySelector("#weekTitle"),
    weekGames: document.querySelector("#weekGames"),
    weekWins: document.querySelector("#weekWins"),
    weekLosses: document.querySelector("#weekLosses"),
    weekWinRate: document.querySelector("#weekWinRate"),
    previousWeekButton: document.querySelector("#previousWeekButton"),
    nextWeekButton: document.querySelector("#nextWeekButton"),
    currentWeekButton: document.querySelector("#currentWeekButton"),
    weekReportButton: document.querySelector("#weekReportButton"),
    matchDialog: document.querySelector("#matchDialog"),
    matchForm: document.querySelector("#matchForm"),
    matchDialogDate: document.querySelector("#matchDialogDate"),
    matchDialogTitle: document.querySelector("#matchDialogTitle"),
    matchNumber: document.querySelector("#matchNumber"),
    hero: document.querySelector("#hero"),
    bans: document.querySelector("#bans"),
    notes: document.querySelector("#notes"),
    deleteMatchButton: document.querySelector("#deleteMatchButton"),
    reportDialog: document.querySelector("#reportDialog"),
    reportWeekLabel: document.querySelector("#reportWeekLabel"),
    reportOutput: document.querySelector("#reportOutput"),
    copyReportButton: document.querySelector("#copyReportButton"),
    downloadReportButton: document.querySelector("#downloadReportButton"),
    dataMenuButton: document.querySelector("#dataMenuButton"),
    dataMenu: document.querySelector("#dataMenu"),
    exportDataButton: document.querySelector("#exportDataButton"),
    importDataButton: document.querySelector("#importDataButton"),
    importDataInput: document.querySelector("#importDataInput"),
    saveStatus: document.querySelector("#saveStatus"),
    confirmDialog: document.querySelector("#confirmDialog"),
    confirmTitle: document.querySelector("#confirmTitle"),
    confirmMessage: document.querySelector("#confirmMessage"),
    confirmCancelButton: document.querySelector("#confirmCancelButton"),
    confirmAcceptButton: document.querySelector("#confirmAcceptButton"),
    toast: document.querySelector("#toast"),
  };

  let state = loadState();
  let editing = { dateKey: null, matchId: null };
  let confirmCallback = null;
  let toastTimer = null;

  if (!localStorage.getItem(STORAGE_KEY)) {
    state.activeWeek = Core.getWeekIndex(ANCHOR_DATE);
  }

  function loadState() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return Core.normalizeState(stored, ANCHOR_DATE);
    } catch {
      return Core.normalizeState(null, ANCHOR_DATE);
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    elements.saveStatus.classList.add("is-saved");
    window.setTimeout(() => elements.saveStatus.classList.remove("is-saved"), 450);
  }

  function getDay(dateKey) {
    if (!state.days[dateKey]) {
      state.days[dateKey] = { completed: false, matches: [] };
    }
    return state.days[dateKey];
  }

  function render() {
    const dates = Core.getWeekDates(state.anchorDate, state.activeWeek);
    const summary = Core.summarizeWeek(state.days, dates);

    elements.weekLabel.textContent = Core.getWeekLabel(state.activeWeek);
    elements.weekTitle.textContent = Core.formatWeekRange(dates);
    elements.weekGames.textContent = FA_NUMBER.format(summary.games);
    elements.weekWins.textContent = FA_NUMBER.format(summary.wins);
    elements.weekLosses.textContent = FA_NUMBER.format(summary.losses);
    elements.weekWinRate.textContent = FA_PERCENT.format(summary.winRate);
    elements.previousWeekButton.disabled = state.activeWeek === 0;
    elements.calendar.innerHTML = dates.map(renderDay).join("");
  }

  function renderDay(date) {
    const dateKey = Core.toDateKey(date);
    const day = state.days[dateKey] || { completed: false, matches: [] };
    const summary = Core.summarizeMatches(day.matches);
    const todayKey = Core.toDateKey(new Date());
    const isToday = dateKey === todayKey;
    const sortedMatches = day.matches.slice().sort((a, b) => a.number - b.number);

    return `
      <article class="day-card${isToday ? " is-today" : ""}${day.completed ? " is-complete" : ""}" data-date="${dateKey}">
        <header class="day-header">
          <div>
            <p class="day-name">
              ${escapeHtml(Core.formatWeekday(date))}
              ${isToday ? '<span class="today-badge">امروز</span>' : ""}
            </p>
            <h3 class="day-date">${escapeHtml(Core.formatDayDate(date))}</h3>
          </div>
          <button class="add-match-button" type="button" data-action="add" aria-label="افزودن بازی">+</button>
        </header>

        <div class="matches">
          ${
            sortedMatches.length
              ? sortedMatches.map((match) => renderMatch(match)).join("")
              : '<div class="empty-day">بدون بازی ثبت‌شده</div>'
          }
        </div>

        <footer class="day-summary">
          <div class="day-stat"><span>برد</span><strong>${FA_NUMBER.format(summary.wins)}</strong></div>
          <div class="day-stat"><span>باخت</span><strong>${FA_NUMBER.format(summary.losses)}</strong></div>
          <button class="day-complete-button" type="button" data-action="toggle-complete">
            ${day.completed ? "روز تکمیل شد" : "اتمام روز"}
          </button>
        </footer>
      </article>
    `;
  }

  function renderMatch(match) {
    const resultLabel = match.result === "win" ? "برد" : "باخت";
    const resultClass = match.result === "win" ? "is-win" : "is-loss";

    return `
      <article
        class="match-card ${resultClass}"
        data-action="edit"
        data-match-id="${escapeAttribute(match.id)}"
        tabindex="0"
        role="button"
        aria-label="ویرایش بازی ${FA_NUMBER.format(match.number)}"
      >
        <div class="match-topline">
          <span class="match-number">بازی ${FA_NUMBER.format(match.number)}</span>
          <span class="result-badge ${resultClass}">${resultLabel}</span>
        </div>
        <h4 class="match-hero">${escapeHtml(match.hero || "بدون هیرو")}</h4>
        ${match.bans ? `<p class="match-bans">بن‌ها: ${escapeHtml(match.bans)}</p>` : ""}
        ${match.notes ? `<p class="match-notes">${escapeHtml(match.notes)}</p>` : ""}
      </article>
    `;
  }

  function openMatchDialog(dateKey, matchId = null) {
    const day = getDay(dateKey);
    const match = day.matches.find((item) => item.id === matchId);
    const date = Core.parseDateKey(dateKey);

    editing = { dateKey, matchId };
    elements.matchForm.reset();
    elements.matchDialogDate.textContent = Core.formatFullDate(date);
    elements.matchDialogTitle.textContent = match ? "ویرایش بازی" : "ثبت بازی";
    elements.deleteMatchButton.hidden = !match;

    if (match) {
      elements.matchNumber.value = match.number;
      elements.hero.value = match.hero;
      elements.bans.value = match.bans;
      elements.notes.value = match.notes;
      const resultInput = elements.matchForm.querySelector(
        `input[name="result"][value="${match.result}"]`,
      );
      if (resultInput) resultInput.checked = true;
    } else {
      const nextNumber = day.matches.reduce((max, item) => Math.max(max, item.number), 0) + 1;
      elements.matchNumber.value = nextNumber;
      elements.matchForm.querySelector('input[name="result"][value="win"]').checked = true;
    }

    elements.matchDialog.showModal();
    window.setTimeout(() => elements.hero.focus(), 0);
  }

  function handleMatchSubmit(event) {
    event.preventDefault();
    const day = getDay(editing.dateKey);
    const formData = new FormData(elements.matchForm);
    const existingIndex = day.matches.findIndex((match) => match.id === editing.matchId);
    const existing = existingIndex >= 0 ? day.matches[existingIndex] : null;
    const match = Core.sanitizeMatch(
      {
        id: existing?.id,
        createdAt: existing?.createdAt,
        number: Core.toEnglishDigits(formData.get("matchNumber")),
        hero: formData.get("hero"),
        bans: formData.get("bans"),
        notes: formData.get("notes"),
        result: formData.get("result"),
      },
      day.matches.length + 1,
    );

    if (existingIndex >= 0) {
      day.matches[existingIndex] = match;
    } else {
      day.matches.push(match);
    }

    day.completed = false;
    saveState();
    render();
    elements.matchDialog.close();
    showToast(existing ? "بازی ویرایش شد" : "بازی ثبت شد");
  }

  function requestDeleteMatch() {
    if (!editing.matchId || !editing.dateKey) return;

    openConfirm("حذف بازی", "این بازی حذف شود؟", () => {
      const day = getDay(editing.dateKey);
      day.matches = day.matches.filter((match) => match.id !== editing.matchId);
      day.completed = false;
      saveState();
      render();
      elements.matchDialog.close();
      showToast("بازی حذف شد");
    });
  }

  function toggleComplete(dateKey) {
    const day = getDay(dateKey);

    if (!day.matches.length && !day.completed) {
      showToast("بازی‌ای برای این روز ثبت نشده");
      return;
    }

    day.completed = !day.completed;
    saveState();
    render();

    if (day.completed) {
      const summary = Core.summarizeMatches(day.matches);
      showToast(
        `${FA_NUMBER.format(summary.wins)} برد و ${FA_NUMBER.format(summary.losses)} باخت`,
      );
    }
  }

  function changeWeek(amount) {
    state.activeWeek = Math.max(0, state.activeWeek + amount);
    saveState();
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openWeekReport() {
    const report = Core.buildWeekReport(state, state.activeWeek);
    elements.reportWeekLabel.textContent = Core.getWeekLabel(state.activeWeek);
    elements.reportOutput.value = report;
    elements.reportDialog.showModal();
  }

  async function copyReport() {
    const value = elements.reportOutput.value;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      elements.reportOutput.select();
      document.execCommand("copy");
    }
    showToast("گزارش کپی شد");
  }

  function downloadReport() {
    const filename = `dota2-${Core.getWeekLabel(state.activeWeek).replace(" ", "-")}.txt`;
    downloadFile(filename, elements.reportOutput.value, "text/plain;charset=utf-8");
    showToast("گزارش آماده شد");
  }

  function exportData() {
    const exportState = {
      ...state,
      exportedAt: new Date().toISOString(),
    };
    const content = JSON.stringify(exportState, null, 2);
    downloadFile(
      `dota2-match-notes-${Core.toDateKey(new Date())}.json`,
      content,
      "application/json",
    );
    closeDataMenu();
    showToast("فایل پشتیبان آماده شد");
  }

  function importData(file) {
    if (!file) return;
    const reader = new FileReader();

    reader.addEventListener("load", () => {
      try {
        const parsed = JSON.parse(reader.result);
        const normalized = Core.normalizeState(parsed, ANCHOR_DATE);
        openConfirm("بازیابی پشتیبان", "داده‌های فعلی جایگزین شوند؟", () => {
          state = normalized;
          saveState();
          render();
          showToast("پشتیبان بازیابی شد");
        });
      } catch {
        showToast("فایل پشتیبان معتبر نیست");
      } finally {
        elements.importDataInput.value = "";
      }
    });

    reader.readAsText(file);
  }

  function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function openConfirm(title, message, callback) {
    confirmCallback = callback;
    elements.confirmTitle.textContent = title;
    elements.confirmMessage.textContent = message;
    elements.confirmDialog.showModal();
  }

  function closeConfirm() {
    confirmCallback = null;
    elements.confirmDialog.close();
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => {
      elements.toast.classList.remove("is-visible");
    }, 2300);
  }

  function closeDataMenu() {
    elements.dataMenu.hidden = true;
  }

  function escapeHtml(value) {
    const span = document.createElement("span");
    span.textContent = String(value);
    return span.innerHTML;
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/"/g, "&quot;");
  }

  elements.calendar.addEventListener("click", (event) => {
    const card = event.target.closest(".day-card");
    if (!card) return;

    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) return;

    const action = actionTarget.dataset.action;
    if (action === "add") openMatchDialog(card.dataset.date);
    if (action === "edit") openMatchDialog(card.dataset.date, actionTarget.dataset.matchId);
    if (action === "toggle-complete") toggleComplete(card.dataset.date);
  });

  elements.calendar.addEventListener("keydown", (event) => {
    const matchCard = event.target.closest('.match-card[data-action="edit"]');
    if (matchCard && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      const dayCard = matchCard.closest(".day-card");
      openMatchDialog(dayCard.dataset.date, matchCard.dataset.matchId);
    }
  });

  elements.matchForm.addEventListener("submit", handleMatchSubmit);
  elements.deleteMatchButton.addEventListener("click", requestDeleteMatch);
  elements.previousWeekButton.addEventListener("click", () => changeWeek(-1));
  elements.nextWeekButton.addEventListener("click", () => changeWeek(1));
  elements.currentWeekButton.addEventListener("click", () => {
    state.activeWeek = Core.getWeekIndex(state.anchorDate);
    saveState();
    render();
  });
  elements.weekReportButton.addEventListener("click", openWeekReport);
  elements.copyReportButton.addEventListener("click", copyReport);
  elements.downloadReportButton.addEventListener("click", downloadReport);

  elements.dataMenuButton.addEventListener("click", (event) => {
    event.stopPropagation();
    elements.dataMenu.hidden = !elements.dataMenu.hidden;
  });
  elements.dataMenu.addEventListener("click", (event) => event.stopPropagation());
  elements.exportDataButton.addEventListener("click", exportData);
  elements.importDataButton.addEventListener("click", () => {
    closeDataMenu();
    elements.importDataInput.click();
  });
  elements.importDataInput.addEventListener("change", () => {
    importData(elements.importDataInput.files[0]);
  });
  document.addEventListener("click", closeDataMenu);

  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelector(`#${button.dataset.closeDialog}`).close();
    });
  });

  elements.confirmCancelButton.addEventListener("click", closeConfirm);
  elements.confirmAcceptButton.addEventListener("click", () => {
    const callback = confirmCallback;
    closeConfirm();
    if (callback) callback();
  });

  [elements.matchDialog, elements.reportDialog, elements.confirmDialog].forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }

  render();
})();
