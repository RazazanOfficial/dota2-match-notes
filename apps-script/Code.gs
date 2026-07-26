const DATA_FILE_ID = "1ZkKqZ6w7PipCxv0843PgwsSBY9omg5yN";
const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;
const RESERVED_USERNAMES = ["__proto__", "prototype", "constructor"];

function doGet(e) {
  const prefix = String(e.parameter.prefix || "");
  if (!/^[A-Za-z_$][\w$]*$/.test(prefix)) {
    return jsonOutput_({ ok: false, error: "Invalid callback" });
  }

  try {
    if (e.parameter.action !== "view") throw new Error("درخواست نامعتبر است");
    const username = normalizeUsername_(e.parameter.username);
    const db = readDatabase_();
    const user = db.users[username];
    if (!user) throw new Error("بازیکنی با این نام کاربری پیدا نشد");
    return jsonpOutput_(prefix, { ok: true, profile: publicProfile_(user) });
  } catch (error) {
    return jsonpOutput_(prefix, { ok: false, error: error.message });
  }
}

function doPost(e) {
  let request = {};
  try {
    request = JSON.parse(e.parameter.payload || "{}");
    const result = handlePost_(request);
    return messageOutput_({ channel: request.channel, ok: true, ...result });
  } catch (error) {
    return messageOutput_({
      channel: request.channel || "",
      ok: false,
      error: error.message || "عملیات انجام نشد",
    });
  }
}

function handlePost_(request) {
  if (request.action === "auth") {
    return authenticate_(request.username, request.password);
  }
  if (request.action === "saveDay") {
    return saveDay_(request);
  }
  throw new Error("درخواست نامعتبر است");
}

function authenticate_(rawUsername, rawPassword) {
  const username = normalizeUsername_(rawUsername);
  const password = validatePassword_(rawPassword);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    const db = readDatabase_();
    let user = db.users[username];
    let isNew = false;

    if (!user) {
      const salt = createSalt_();
      user = {
        username,
        salt,
        passwordHash: hashPassword_(password, salt),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        days: {},
      };
      db.users[username] = user;
      db.updatedAt = user.updatedAt;
      writeDatabase_(db);
      isNew = true;
    } else if (!safeEqual_(user.passwordHash, hashPassword_(password, user.salt))) {
      throw new Error("نام کاربری یا رمز نادرست است");
    } else if (!user.username) {
      user.username = username;
      delete user.steamId;
      user.updatedAt = new Date().toISOString();
      db.updatedAt = user.updatedAt;
      writeDatabase_(db);
    }

    return { isNew, profile: publicProfile_(user) };
  } finally {
    lock.releaseLock();
  }
}

function saveDay_(request) {
  const username = normalizeUsername_(request.username);
  const password = validatePassword_(request.password);
  const dateKey = String(request.dateKey || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new Error("تاریخ نامعتبر است");
  const day = validateDay_(request.day);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    const db = readDatabase_();
    const user = db.users[username];
    if (!user || !safeEqual_(user.passwordHash, hashPassword_(password, user.salt))) {
      throw new Error("نام کاربری یا رمز نادرست است");
    }

    user.days = user.days || {};
    user.days[dateKey] = day;
    user.updatedAt = new Date().toISOString();
    db.updatedAt = user.updatedAt;
    writeDatabase_(db);
    return { profile: publicProfile_(user) };
  } finally {
    lock.releaseLock();
  }
}

function validateDay_(rawDay) {
  const day = rawDay && typeof rawDay === "object" ? rawDay : {};
  const matches = {};
  Object.keys(day.matches || {}).forEach(function (id) {
    const match = day.matches[id] || {};
    const result = match.result === "win" ? "win" : match.result === "loss" ? "loss" : null;
    if (!result) throw new Error("نتیجه بازی نامعتبر است");
    matches[id] = {
      id: String(match.id || id),
      number: Math.max(1, Math.floor(Number(match.number) || 1)),
      hero: String(match.hero || "").slice(0, 100),
      bans: String(match.bans || "").slice(0, 500),
      notes: String(match.notes || "").slice(0, 5000),
      result,
      createdAt: String(match.createdAt || new Date().toISOString()),
      updatedAt: new Date().toISOString(),
    };
  });
  return { completed: Boolean(day.completed), matches };
}

function normalizeUsername_(value) {
  const username = String(value || "").normalize("NFKC").trim().toLowerCase();
  if (!USERNAME_PATTERN.test(username) || RESERVED_USERNAMES.indexOf(username) !== -1) {
    throw new Error(
      "نام کاربری باید ۳ تا ۳۲ نویسه و شامل حروف انگلیسی، عدد، نقطه، خط تیره یا زیرخط باشد",
    );
  }
  return username;
}

function validatePassword_(value) {
  const password = String(value || "");
  if (password.length < 4) throw new Error("رمز باید حداقل ۴ نویسه داشته باشد");
  if (password.length > 128) throw new Error("رمز بیش از حد طولانی است");
  return password;
}

function createSalt_() {
  return Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
}

function hashPassword_(password, salt) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    salt + "|" + password,
    Utilities.Charset.UTF_8,
  );
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, "");
}

function safeEqual_(left, right) {
  left = String(left || "");
  right = String(right || "");
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function publicProfile_(user) {
  return {
    username: user.username || user.steamId,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    days: user.days || {},
  };
}

function readDatabase_() {
  const content = DriveApp.getFileById(DATA_FILE_ID).getBlob().getDataAsString("UTF-8");
  const db = JSON.parse(content || "{}");
  db.version = 1;
  db.users = db.users || {};
  return db;
}

function writeDatabase_(db) {
  DriveApp.getFileById(DATA_FILE_ID).setContent(JSON.stringify(db, null, 2));
}

function jsonOutput_(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonpOutput_(prefix, data) {
  const safeJson = JSON.stringify(data).replace(/</g, "\\u003c");
  return ContentService.createTextOutput(prefix + "(" + safeJson + ")")
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function messageOutput_(data) {
  const safeJson = JSON.stringify(data).replace(/</g, "\\u003c");
  const html = "<!doctype html><meta charset=\"utf-8\"><script>" +
    "parent.postMessage(" + safeJson + ", '*');" +
    "<\/script>";
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
