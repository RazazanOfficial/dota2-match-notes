import { apiConfig, isApiConfigured } from "./api-config.js";

const GOOGLE_MESSAGE_ORIGINS = [
  "https://script.google.com",
  "https://script.googleusercontent.com",
];

function isGoogleMessageOrigin(origin) {
  try {
    const { hostname, protocol } = new URL(origin);
    return (
      protocol === "https:" &&
      (hostname === "script.google.com" || hostname.endsWith(".googleusercontent.com"))
    );
  } catch {
    return GOOGLE_MESSAGE_ORIGINS.includes(origin);
  }
}

function createChannel() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function jsonp(action, params = {}) {
  return new Promise((resolve, reject) => {
    const callbackName = `dotaNotes_${createChannel()}`;
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => cleanup(new Error("پاسخی از سرور دریافت نشد")), 20000);

    function cleanup(error, value) {
      window.clearTimeout(timeout);
      script.remove();
      delete window[callbackName];
      if (error) reject(error);
      else resolve(value);
    }

    window[callbackName] = (response) => {
      if (!response?.ok) {
        cleanup(new Error(response?.error || "دریافت اطلاعات انجام نشد"));
        return;
      }
      cleanup(null, response);
    };

    const url = new URL(apiConfig.webAppUrl);
    url.searchParams.set("action", action);
    url.searchParams.set("prefix", callbackName);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    script.src = url.toString();
    script.addEventListener("error", () => cleanup(new Error("ارتباط با سرور برقرار نشد")));
    document.head.appendChild(script);
  });
}

function post(action, payload = {}) {
  return new Promise((resolve, reject) => {
    const channel = createChannel();
    const frameName = `dotaNotesFrame_${channel}`;
    const iframe = document.createElement("iframe");
    const form = document.createElement("form");
    const input = document.createElement("input");
    const timeout = window.setTimeout(() => cleanup(new Error("پاسخی از سرور دریافت نشد")), 25000);

    function cleanup(error, value) {
      window.clearTimeout(timeout);
      window.removeEventListener("message", handleMessage);
      form.remove();
      iframe.remove();
      if (error) reject(error);
      else resolve(value);
    }

    function handleMessage(event) {
      if (!isGoogleMessageOrigin(event.origin) || event.data?.channel !== channel) return;
      if (!event.data?.ok) {
        cleanup(new Error(event.data?.error || "عملیات انجام نشد"));
        return;
      }
      cleanup(null, event.data);
    }

    window.addEventListener("message", handleMessage);
    iframe.name = frameName;
    iframe.hidden = true;
    form.hidden = true;
    form.method = "POST";
    form.action = apiConfig.webAppUrl;
    form.target = frameName;
    input.type = "hidden";
    input.name = "payload";
    input.value = JSON.stringify({ action, channel, ...payload });
    form.appendChild(input);
    document.body.append(iframe, form);
    form.submit();
  });
}

export function createDriveApiService() {
  let credentials = null;
  let cachedProfile = null;
  let pollTimer = null;

  if (!isApiConfigured) {
    return { configured: false };
  }

  async function readProfile(steamId) {
    const response = await jsonp("view", { steamId });
    cachedProfile = response.profile;
    return response.profile;
  }

  async function enterAsPlayer(steamId, password) {
    const response = await post("auth", { steamId, password });
    credentials = { steamId, password };
    cachedProfile = response.profile;
    return {
      mode: "player",
      steamId,
      isNew: Boolean(response.isNew),
    };
  }

  async function enterAsCoach(steamId) {
    credentials = null;
    await readProfile(steamId);
    return { mode: "coach", steamId, isNew: false };
  }

  function watchProfile(steamId, onData, onError) {
    let stopped = false;
    if (cachedProfile) queueMicrotask(() => onData(cachedProfile));

    async function refresh() {
      try {
        const profile = await readProfile(steamId);
        if (!stopped) onData(profile);
      } catch (error) {
        if (!stopped) onError?.(error);
      }
    }

    pollTimer = window.setInterval(refresh, 15000);
    return () => {
      stopped = true;
      window.clearInterval(pollTimer);
      pollTimer = null;
    };
  }

  async function saveDay(steamId, dateKey, day) {
    if (!credentials || credentials.steamId !== steamId) {
      throw new Error("دسترسی ثبت اطلاعات وجود ندارد");
    }

    const response = await post("saveDay", {
      steamId,
      password: credentials.password,
      dateKey,
      day: window.DotaNotesCore.serializeDay(day),
    });
    cachedProfile = response.profile;
  }

  async function leave() {
    credentials = null;
    cachedProfile = null;
    if (pollTimer) window.clearInterval(pollTimer);
    pollTimer = null;
  }

  return {
    configured: true,
    enterAsCoach,
    enterAsPlayer,
    leave,
    saveDay,
    watchProfile,
  };
}
