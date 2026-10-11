# اصلاح انتقال جامعهٔ آماری STRATZ

> وضعیت تاریخی: انتقال curl در VPS تأیید شد. رفتار انتظار `winMonth` با [Meta هفتگی](weekly-meta-reference.fa.md) جایگزین می‌شود؛ دستورهای این سند برای استقرار پچ جدید اجرا نشوند.

پایه: `origin/main` در `dd241eb`، ۱۱ اکتبر ۲۰۲۶. branch: `fix/stratz-reference-transfer`.

## شواهد واقعی VPS

- گزارش اول `stratz-diagnostics-1791712172088.json`: Meta کامل بدون gzip و Performance چهار Hero حتی با gzip حوالی ۶۴ کیلوبایت wire نیمه‌کاره مانده‌اند. مسیر Node مستقل timeout/ECONNRESET دارد. محل دقیق اختلال شبکه و تحریم از این شواهد ثابت نمی‌شود.
- گزارش دوم `stratz-diagnostics-1791714955839.json`: همهٔ ۱۶ تست هدفمند کامل شدند. چهار ترکیب Meta ماه‌های اوت و ژوئیه را می‌دهند؛ `take:4` اوت تا مه را می‌دهد. مقدار `month` Unix seconds ابتدای ماه است و قرارداد فعلی درست است؛ سپتامبر **در همین پاسخ winMonth** نیست. این نتیجه نبودن سپتامبر در تمام منابع STRATZ یا زمان انتشار آن را اثبات نمی‌کند.
- هر Hero جداگانه با پنج Position، تمام دقیقه‌های ۰–۷۵ و ۱۴ مقدار عملکرد، در حدود ۰٫۶–۰٫۷ ثانیه و ۲۰–۲۴ کیلوبایت gzip کامل و منطبق با قرارداد برگشت. نمونهٔ صفر، cohort، week و metricها بررسی شدند.

## رفتار پچ

1. `STRATZ_TRANSPORT=curl` مسیر آزمایش‌شدهٔ HTTPS pinned با gzip را انتخاب می‌کند. default بدون ENV برای سازگاری `node` است. curl از shell اجرا نمی‌شود؛ token و query فقط از stdin خصوصی می‌روند، نه argv یا فایل. TLS و hostname بررسی می‌شوند، redirect دنبال نمی‌شود، timeout و سقف decoded body حفظ‌اند؛ پاسخ ناقص HTTP 200 ذخیره نمی‌شود.
2. Performance هر batch موجود چهار-Hero را با چهار درخواست تک‌Hero دریافت می‌کند. تمام Positionها، دقیقه‌ها و metricها حفظ‌اند. فقط پس از موفقیت تمام درخواست‌ها، write و cursor در تراکنش اصلی جلو می‌روند. ترتیب jobها، policy، وزن نمونه‌ها و فرمول IMP تغییر نکرده‌اند. حداکثر تعداد درخواست‌های ماه از ۱۲۸ به ۵۱۲ می‌رسد؛ این ۱۲۸ همچنان تعداد batchهای progress است. quota مشترک و retry محدود هر درخواست حفظ شده‌اند.
3. ماه Meta غایب به‌صورت `waiting-source` با retry ساعتی ثبت می‌شود. Tick انتظار HTTP 200 و رویداد info دارد؛ هر دقیقه درخواست و رویداد خطای جدید نمی‌سازد. Cursor صفر می‌ماند و دادهٔ اوت به نام سپتامبر ذخیره نمی‌شود. مرجع سالم فعال حفظ می‌شود و با برگشت ماه خواسته‌شده، دریافت ادامه می‌یابد.
4. preflight در حالت curl دسترسی به ابزار HTTPS را بررسی می‌کند. لاگ خطای STRATZ کد provider و metadata محدود انتقال را نگه می‌دارد، بدون چاپ متن درخواست/پاسخ، URL یا secret.
5. `stratz-reference-check.js` در dist/release به کد production متصل است: چهار ترکیب Meta و اولین batch Performance را بررسی می‌کند. snapshot و دادهٔ مرجع را تغییر نمی‌دهد؛ تنها سهمیهٔ مشترک PostgreSQL را رزرو می‌کند. `ok:true` با `waiting-source` یعنی انتقال سالم است اما Meta آن ماه در پاسخ نیست، نه اینکه snapshot همان ماه تکمیل شده باشد.

schema، migration، dependency، desktop، Next، parser JAR، unit و Worker کلادفلر تغییر ندارند. فایل حذف‌شدنی ندارد.

## سیستم کاربر و Git

از روت و با working tree تمیز:

```bash
git status -sb
git fetch origin
git switch main
git pull --ff-only origin main
git log -1 --oneline
git switch -c fix/stratz-reference-transfer
```

فایل‌های ZIP را از روت copy/replace کنید. package/lock تغییر نکرده‌اند و نصب مجدد dependencies موجود لازم نیست.

```bash
npm run test -w @dota-notes/api -- --maxWorkers=2
npm run api:build
npm run release:prepare -w @dota-notes/api
git diff --check
```

build شامل TypeScript check است. ZIP سورس و تست و سند دارد؛ release/dist تولیدی از Git ignore می‌شود.

```bash
git add .
git commit -m "fix(api): restore STRATZ reference transfers and handle missing Meta months"
git push -u origin fix/stratz-reference-transfer
git switch main
git pull --ff-only origin main
git merge --no-ff fix/stratz-reference-transfer -m "Merge branch 'fix/stratz-reference-transfer'"
git push origin main
```

## VPS موجود

checkout `/var/www/dota2notes`، runtime `apps/api/release/dist`، ENV `.env.production` ریشه است. ابتدا وضعیت Git را بررسی کنید. اگر تغییر محلی tracked دارد یا هر فرمان شکست خورد، ادامه ندهید؛ reset/clean خودکار نکنید. اگر ابزار تشخیص قبلی روی VPS untracked است، guard زیر فقط همان فایل را بیرون checkout پشتیبان‌گیری می‌کند تا main بتواند نسخهٔ tracked خود را بیاورد. فایل tracked تغییرکرده را دست نمی‌زند.

```bash
cd /var/www/dota2notes
sudo -u dota2notes -H git status -sb
sudo -u dota2notes -H git fetch origin
sudo install -d -m 0700 -o dota2notes -g dota2notes /var/lib/dota2notes/diagnostics/source-backup
if ! sudo -u dota2notes -H git ls-files --error-unmatch apps/api/scripts/diagnose-stratz.mjs >/dev/null 2>&1 && test -f apps/api/scripts/diagnose-stratz.mjs; then
  sudo mv apps/api/scripts/diagnose-stratz.mjs "/var/lib/dota2notes/diagnostics/source-backup/diagnose-stratz-$(date -u +%Y%m%dT%H%M%SZ).mjs"
fi

sudo systemctl stop dota2notes-replay.timer dota2notes-sync-manual.timer dota2notes-opendota-parse.timer dota2notes-images.timer dota2notes-performance-reference.timer dota2notes-monitor.timer
sudo systemctl stop dota2notes-replay.service dota2notes-sync.service dota2notes-opendota-parse.service dota2notes-images.service dota2notes-performance-reference.service dota2notes-monitor.service
sudo systemctl stop dota2notes-api.service
sudo -u dota2notes -H git switch main
sudo -u dota2notes -H git pull --ff-only origin main
sudo -u dota2notes -H git log -1 --oneline
```

ENV را باز کنید و این یک کلید را اضافه/replace کنید؛ نسخهٔ دوم از یک کلید نسازید:

```bash
sudo nano /var/www/dota2notes/.env.production
```

```dotenv
STRATZ_TRANSPORT=curl
```

با `Ctrl+O`، Enter، `Ctrl+X` ذخیره و خارج شوید. سایر کلیدهای موجود تغییر لازم ندارند.

```bash
sudo -u dota2notes -H npm run api:build
sudo -u dota2notes -H npm run release:prepare -w @dota-notes/api
sudo -u dota2notes -H env DOTENV_CONFIG_PATH=/var/www/dota2notes/.env.production npm run preflight --prefix apps/api/release --workspaces=false -- --check-db
sudo -u dota2notes -H env DOTENV_CONFIG_PATH=/var/www/dota2notes/.env.production npm run preflight --prefix apps/api/release --workspaces=false -- --role=performance-reference
```

در این پچ dependencyها تغییر نکرده‌اند؛ npm ci ریشه لازم نیست و وب فعال می‌ماند. Next build، desktop installer، migration، نصب unit/collector، daemon-reload و ساخت JAR لازم نیست. اگر محیط فاقد dependencies نصب‌شده است این روال مناسب نصب اولیه نیست. فقط پس از موفقیت build و هر دو preflight:

```bash
sudo systemctl start dota2notes-api.service
curl --retry 5 --retry-connrefused --retry-delay 1 -fS http://127.0.0.1:4100/health/ready
curl -fS https://api.dota2notes.ir/health/live
sudo systemctl start dota2notes-replay.timer dota2notes-sync-manual.timer dota2notes-opendota-parse.timer dota2notes-images.timer dota2notes-performance-reference.timer dota2notes-monitor.timer
sudo systemctl start dota2notes-performance-reference.service
sudo -u dota2notes -H node --env-file=/var/www/dota2notes/.env.production apps/api/release/dist/stratz-reference-check.js --month 2026-09
sudo journalctl -u dota2notes-performance-reference.service -u dota2notes-api.service --since "5 minutes ago" --no-pager -o cat | tail -80
sudo -u postgres psql -d dota_notes -P pager=off -c "SELECT reference_month,status,meta_cursor,performance_cursor,meta_rows,hero_rows,position_rows,meta_last_error,error_message FROM monthly_reference_versions ORDER BY reference_month DESC,started_at DESC LIMIT 3;"
```

در وضعیت گزارش فعلی، انتظار Meta سپتامبر `waiting-source` و Performance check موفق است. Cursor سپتامبر تا برگشت Meta واقعی نباید جلو برود و اوت باید `active` بماند. `inactive (dead)` برای worker oneshot موفق طبیعی است؛ خطای همان لحظه و status failed را با آن اشتباه نگیرید. خروجی check و journal/SQL بعد از استقرار برای تأیید production ارسال شود. بازخوانی force یا پاک‌کردن اوت برای این تست لازم نیست.

## بررسی انجام‌شده و حدود آن

۴۱۶ تست API در ۶۵ فایل موفق‌اند؛ TypeScript/API build و release:prepare موفق‌اند. آزمون TLS محلی واقعی با curl، gzip، UTF-8، حفظ status/Retry-After، عدم redirect، argv بدون token/query، رد پاسخ ناقص، سقف decoded و نبود curl انجام شد. آزمون PostgreSQL سازگار PGlite، حفظ اوت و cursor در حالت انتظار، cooldown پایدار، ادامه پس از رسیدن Meta سپتامبر و اتمیک‌بودن Performance/cursor را تأیید کرد. این تست‌ها جای نتیجهٔ runtime جدید روی VPS را نمی‌گیرند. هیچ commit/push یا استقرار از این محیط انجام نشده است.
