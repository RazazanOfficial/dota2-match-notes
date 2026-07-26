import { createDriveApiService } from "./api-client.js";

(function initializeApp() {
  "use strict";

  const Core = window.DotaNotesCore;
  const ANCHOR_DATE = "2026-07-25";
  const FA_NUMBER = new Intl.NumberFormat("fa-IR");
  const FA_PERCENT = new Intl.NumberFormat("fa-IR", {
    style: "percent",
    maximumFractionDigits: 0,
  });
  const service = createDriveApiService();

  const elements = {
    loadingScreen: document.querySelector("#loadingScreen"),
    accessScreen: document.querySelector("#accessScreen"),
    accessKicker: document.querySelector("#accessKicker"),
    accessTitle: document.querySelector("#accessTitle"),
    roleChooser: document.querySelector("#roleChooser"),
    playerAccessForm: document.querySelector("#playerAccessForm"),
    playerSteamId: document.querySelector("#playerSteamId"),
    playerPassword: document.querySelector("#playerPassword"),
    playerAccessError: document.querySelector("#playerAccessError"),
    coachAccessForm: document.querySelector("#coachAccessForm"),
    coachSteamId: document.querySelector("#coachSteamId"),
    coachAccessError: document.querySelector("#coachAccessError"),
    setupState: document.querySelector("#setupState"),
    appShell: document.querySelector("#appShell"),
    modeBadge: document.querySelector("#modeBadge"),
    activeSteamId: document.querySelector("#activeSteamId"),
    syncStatus: document.querySelector("#syncStatus"),
    leaveButton: document.querySelector("#leaveButton"),
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
    confirmDialog: document.querySelector("#confirmDialog"),
    confirmTitle: document.querySelector("#confirmTitle"),
    confirmMessage: document.querySelector("#confirmMessage"),
    confirmCancelButton: document.querySelector("#confirmCancelButton"),
    confirmAcceptButton: document.querySelector("#confirmAcceptButton"),
    toast: document.querySelector("#toast"),
  };

  let state = Core.normalizeState(null, ANCHOR_DATE);
  state.activeWeek = Core.getWeekIndex(ANCHOR_DATE);
  let session = null;
  let stopProfileWatch = null;
  let editing = { dateKey: null, matchId: null };
  let confirmCallback = null;
  let toastTimer = null;

  function showAccessScreen() {
    elements.loadingScreen.hidden = true;
    elements.appShell.hidden = true;
    elements.accessScreen.hidden = false;
    resetAccessView();

    if (!service.configured) {
      elements.roleChooser.hidden = true;
      elements.accessTitle.textContent = "راه‌اندازی";
      elements.accessKicker.textContent = "پیکربندی";
      elements.setupState.hidden = false;
    }
  }

  function resetAccessView() {
    elements.accessKicker.textContent = "دسترسی";
    elements.accessTitle.textContent = "نوع ورود را انتخاب کنید";
    elements.roleChooser.hidden = false;
    elements.playerAccessForm.hidden = true;
    elements.coachAccessForm.hidden = true;
    elements.setupState.hidden = true;
    elements.playerAccessError.textContent = "";
    elements.coachAccessError.textContent = "";
    elements.playerPassword.value = "";
  }

  function showRoleForm(role) {
    elements.roleChooser.hidden = true;
    elements.playerAccessForm.hidden = role !== "player";
    elements.coachAccessForm.hidden = role !== "coach";
    elements.accessKicker.textContent = role === "player" ? "بازیکن" : "مربی";
    elements.accessTitle.textContent =
      role === "player" ? "ورود یا ساخت حساب" : "مشاهده گزارش بازیکن";

    window.setTimeout(() => {
      (role === "player" ? elements.playerSteamId : elements.coachSteamId).focus();
    }, 0);
  }

  function validateSteamId(rawValue, errorElement) {
    const steamId = Core.normalizeSteamId(rawValue);
    if (!Core.isValidSteamId(steamId)) {
      errorElement.textContent = "SteamID64 معتبر وارد کنید";
      return null;
    }
    errorElement.textContent = "";
    return steamId;
  }

  function setFormBusy(form, busy) {
    form.querySelectorAll("input, button").forEach((element) => {
      element.disabled = busy;
    });
  }

  async function handlePlayerAccess(event) {
    event.preventDefault();
    const steamId = validateSteamId(elements.playerSteamId.value, elements.playerAccessError);
    if (!steamId) return;

    const password = elements.playerPassword.value;
    if (password.length < 4) {
      elements.playerAccessError.textContent = "رمز باید حداقل ۴ نویسه داشته باشد";
      return;
    }

    setFormBusy(elements.playerAccessForm, true);
    elements.playerAccessError.textContent = "";

    try {
      const nextSession = await service.enterAsPlayer(steamId, password);
      await openSession(nextSession);
      if (nextSession.isNew) showToast("حساب بازیکن ساخته شد");
    } catch (error) {
      elements.playerAccessError.textContent = error.message;
    } finally {
      setFormBusy(elements.playerAccessForm, false);
    }
  }

  async function handleCoachAccess(event) {
    event.preventDefault();
    const steamId = validateSteamId(elements.coachSteamId.value, elements.coachAccessError);
    if (!steamId) return;

    setFormBusy(elements.coachAccessForm, true);
    elements.coachAccessError.textContent = "";

    try {
      const nextSession = await service.enterAsCoach(steamId);
      await openSession(nextSession);
    } catch (error) {
      elements.coachAccessError.textContent = error.message;
    } finally {
      setFormBusy(elements.coachAccessForm, false);
    }
  }

  async function openSession(nextSession) {
    session = nextSession;
    state = Core.normalizeState(null, ANCHOR_DATE);
    state.activeWeek = Core.getWeekIndex(ANCHOR_DATE);

    elements.accessScreen.hidden = true;
    elements.appShell.hidden = false;
    elements.modeBadge.textContent = session.mode === "player" ? "بازیکن" : "مربی";
    elements.modeBadge.classList.toggle("is-coach", session.mode === "coach");
    elements.activeSteamId.textContent = session.steamId;
    setSyncState("syncing");
    render();

    if (stopProfileWatch) stopProfileWatch();
    stopProfileWatch = service.watchProfile(
      session.steamId,
      (profile) => {
        const activeWeek = state.activeWeek;
        state = Core.normalizeState(profile, ANCHOR_DATE);
        state.activeWeek = activeWeek;
        render();
        setSyncState("synced");
      },
      (error) => {
        setSyncState("error");
        showToast(error.message);
      },
    );
  }

  async function leaveSession() {
    if (stopProfileWatch) {
      stopProfileWatch();
      stopProfileWatch = null;
    }
    await service.leave();
    session = null;
    state = Core.normalizeState(null, ANCHOR_DATE);
    showAccessScreen();
  }

  function setSyncState(status) {
    elements.syncStatus.classList.toggle("is-syncing", status === "syncing");
    elements.syncStatus.classList.toggle("is-error", status === "error");
    elements.syncStatus.lastChild.textContent =
      status === "syncing" ? "در حال ثبت" : status === "error" ? "خطا" : "همگام";
  }

  function isPlayer() {
    return session?.mode === "player";
  }

  function getDay(dateKey) {
    if (!state.days[dateKey]) {
      state.days[dateKey] = { completed: false, matches: [] };
    }
    return state.days[dateKey];
  }

  function cloneDay(day) {
    return JSON.parse(JSON.stringify(day || { completed: false, matches: [] }));
  }

  async function mutateDay(dateKey, mutation) {
    if (!isPlayer()) return false;
    const existed = Boolean(state.days[dateKey]);
    const previous = cloneDay(state.days[dateKey]);
    const day = getDay(dateKey);
    mutation(day);
    render();
    setSyncState("syncing");

    try {
      await service.saveDay(session.steamId, dateKey, day);
      setSyncState("synced");
      return true;
    } catch (error) {
      if (existed) state.days[dateKey] = previous;
      else delete state.days[dateKey];
      render();
      setSyncState("error");
      showToast(error.message);
      return false;
    }
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
    const completeControl = isPlayer()
      ? `<button class="day-complete-button" type="button" data-action="toggle-complete">
          ${day.completed ? "روز تکمیل شد" : "اتمام روز"}
        </button>`
      : `<span class="day-complete-readonly">${day.completed ? "روز تکمیل شد" : "روز باز"}</span>`;

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
          ${
            isPlayer()
              ? '<button class="add-match-button" type="button" data-action="add" aria-label="افزودن بازی">+</button>'
              : ""
          }
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
          ${completeControl}
        </footer>
      </article>
    `;
  }

  function renderMatch(match) {
    const resultLabel = match.result === "win" ? "برد" : "باخت";
    const resultClass = match.result === "win" ? "is-win" : "is-loss";
    const editAttributes = isPlayer()
      ? `data-action="edit" tabindex="0" role="button" aria-label="ویرایش بازی ${FA_NUMBER.format(match.number)}"`
      : "";

    return `
      <article class="match-card ${resultClass}" ${editAttributes} data-match-id="${escapeAttribute(match.id)}">
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
    if (!isPlayer()) return;
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

  async function handleMatchSubmit(event) {
    event.preventDefault();
    const formData = new FormData(elements.matchForm);
    const day = getDay(editing.dateKey);
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

    setFormBusy(elements.matchForm, true);
    const saved = await mutateDay(editing.dateKey, (nextDay) => {
      const index = nextDay.matches.findIndex((item) => item.id === editing.matchId);
      if (index >= 0) nextDay.matches[index] = match;
      else nextDay.matches.push(match);
      nextDay.completed = false;
    });
    setFormBusy(elements.matchForm, false);

    if (saved) {
      elements.matchDialog.close();
      showToast(existing ? "بازی ویرایش شد" : "بازی ثبت شد");
    }
  }

  function requestDeleteMatch() {
    if (!editing.matchId || !editing.dateKey) return;

    openConfirm("حذف بازی", "این بازی حذف شود؟", async () => {
      const saved = await mutateDay(editing.dateKey, (day) => {
        day.matches = day.matches.filter((match) => match.id !== editing.matchId);
        day.completed = false;
      });
      if (saved) {
        elements.matchDialog.close();
        showToast("بازی حذف شد");
      }
    });
  }

  async function toggleComplete(dateKey) {
    const day = getDay(dateKey);
    if (!day.matches.length && !day.completed) {
      showToast("بازی‌ای برای این روز ثبت نشده");
      return;
    }

    const nextCompleted = !day.completed;
    const saved = await mutateDay(dateKey, (nextDay) => {
      nextDay.completed = nextCompleted;
    });

    if (saved && nextCompleted) {
      const summary = Core.summarizeMatches(getDay(dateKey).matches);
      showToast(
        `${FA_NUMBER.format(summary.wins)} برد و ${FA_NUMBER.format(summary.losses)} باخت`,
      );
    }
  }

  function changeWeek(amount) {
    state.activeWeek = Math.max(0, state.activeWeek + amount);
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openWeekReport() {
    elements.reportWeekLabel.textContent = Core.getWeekLabel(state.activeWeek);
    elements.reportOutput.value = Core.buildWeekReport(state, state.activeWeek);
    elements.reportDialog.showModal();
  }

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(elements.reportOutput.value);
    } catch {
      elements.reportOutput.select();
      document.execCommand("copy");
    }
    showToast("گزارش کپی شد");
  }

  function downloadReport() {
    const filename = `dota2-${Core.getWeekLabel(state.activeWeek).replace(" ", "-")}.txt`;
    const blob = new Blob([elements.reportOutput.value], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("گزارش آماده شد");
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
    toastTimer = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 2300);
  }

  function escapeHtml(value) {
    const span = document.createElement("span");
    span.textContent = String(value);
    return span.innerHTML;
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/"/g, "&quot;");
  }

  elements.roleChooser.addEventListener("click", (event) => {
    const roleButton = event.target.closest("[data-role]");
    if (roleButton) showRoleForm(roleButton.dataset.role);
  });
  document
    .querySelectorAll(".access-back-button")
    .forEach((button) => button.addEventListener("click", resetAccessView));
  elements.playerAccessForm.addEventListener("submit", handlePlayerAccess);
  elements.coachAccessForm.addEventListener("submit", handleCoachAccess);
  elements.leaveButton.addEventListener("click", leaveSession);

  elements.calendar.addEventListener("click", (event) => {
    const card = event.target.closest(".day-card");
    const actionTarget = event.target.closest("[data-action]");
    if (!card || !actionTarget) return;

    if (actionTarget.dataset.action === "add") openMatchDialog(card.dataset.date);
    if (actionTarget.dataset.action === "edit") {
      openMatchDialog(card.dataset.date, actionTarget.dataset.matchId);
    }
    if (actionTarget.dataset.action === "toggle-complete") toggleComplete(card.dataset.date);
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
    render();
  });
  elements.weekReportButton.addEventListener("click", openWeekReport);
  elements.copyReportButton.addEventListener("click", copyReport);
  elements.downloadReportButton.addEventListener("click", downloadReport);

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

  showAccessScreen();
})();
