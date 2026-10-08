# رفع پاسخ 400 هنگام دانلود ریپلی

پایهٔ این پچ `main` در `07b948a` است؛ branch تسک `fix/replay-lookup-request`.
ZIP فقط فایل‌های تغییرکرده/جدید را با مسیر نسبی مخزن دارد. فایل حذف‌شدنی نداریم.

## علت و اصلاح

لاگ واقعی VPS برای مچ‌های `9033871443` و `9034129766` نشان داد OPTIONS موفق
است، اما POST `/api/replays/lookup` بلافاصله 400 می‌دهد. به درخواست فایل هنوز
نرسیده بود؛ خطاهای قدیمی nginx در 16:17 UTC و STRATZ 502 علت این 400 نیستند.

در registry، مسیر POST `/replays/:matchId` قبل از POST `/replays/lookup` ثبت
شده بود. Express کلمهٔ `lookup` را به‌عنوان پارامتر matchId به handler دانلود
می‌داد؛ schema شناسه/intent آن را رد می‌کرد. مسیر ثابت lookup اکنون قبل از
مسیرهای پارامتری ریپلی ثبت می‌شود. اعتبارسنجی، احراز هویت، بررسی Origin، quota
و handlerها تغییر نکرده‌اند. نام مچ خاصی در منطق برنامه hardcode نشده است.

تست کامل فهرست routeها علاوه بر status، handler انتخاب‌شده را نیز بررسی می‌کند.
تست PostgreSQL/Express با دادهٔ کش‌شده و دو شناسهٔ گزارش‌شده روی `/api` و
`/api/v1` اجرا می‌شود: lookup به 200 و POST شناسهٔ عددی به صف دانلود 202 می‌رسد؛
در این مسیر cached lookup هیچ درخواست OpenDota لازم ندارد. قبل از تغییر هر دو
تست خطا را بازتولید کردند؛ بعد از تغییر پاس شدند.

این پچ API-only است؛ دسکتاپ، وابستگی‌ها، schema، ENV، Next، JAR و Worker
Cloudflare تغییر نمی‌کنند. نصاب پچ قبلی را نگه دار؛ بیلد نصاب جدید لازم نیست.
تست محلی جای دانلود واقعی فایل از VPS به ویندوز را نمی‌گیرد.

## سیستم خودت و Git

از ریشهٔ پروژه، ابتدا status را بررسی کن؛ تغییرات قبلی را روی branch خودشان
حفظ کن و با working tree تمیز ادامه بده:

```bash
git status -sb
git switch main
git fetch origin
git pull --ff-only origin main
git log -1 --oneline
git switch -c fix/replay-lookup-request
```

اکنون فایل‌های ZIP را از ریشهٔ پروژه copy/replace کن.

```bash
npm test
npm run test -w @dota-notes/api
npm run typecheck
npm run api:build
npm run release:prepare -w @dota-notes/api
```

اگر node_modules موجود نیست، قبل از تست `npm ci` بزن. خروجی dist در Git ثبت
نمی‌شود؛ VPS خروجی را از سورس می‌سازد. بعد از تست:

```bash
git status -sb
git add .
git commit -m "fix(api): route replay lookup before numeric match handlers"
git push -u origin fix/replay-lookup-request
git switch main
git pull --ff-only origin main
git merge --no-ff fix/replay-lookup-request -m "Merge branch 'fix/replay-lookup-request'"
git push origin main
```

## استقرار VPS، فقط بعد از push main

checkout `/var/www/dota2notes` و runtime فعال `apps/api/release` است. وضعیت
Git باید main و تمیز باشد؛ در صورت تغییر محلی reset/clean نزن. اگر هر فرمان
خطا داد، قبل از ادامه همان خطا را بررسی کن.

```bash
cd /var/www/dota2notes
sudo -u dota2notes -H git status -sb
sudo -u dota2notes -H git fetch origin
sudo -u dota2notes -H git switch main
sudo -u dota2notes -H git pull --ff-only origin main
sudo -u dota2notes -H git log -1 --oneline
sudo -u dota2notes -H npm run api:build
```

این پچ dependency ندارد و روی VPS موجود node_modules ریشه قبلاً نصب است؛
`npm ci` ریشه و build Next لازم نیستند. build بالا فقط `apps/api/dist` را
می‌نویسد و هنوز runtime فعال را عوض نمی‌کند. پیش از release:prepare، API و
شش timer/worker مربوط به runtime مشترک را متوقف کن؛ وب Next می‌تواند روشن بماند.

```bash
sudo systemctl stop dota2notes-replay.timer dota2notes-sync-manual.timer dota2notes-opendota-parse.timer dota2notes-images.timer dota2notes-performance-reference.timer dota2notes-monitor.timer
sudo systemctl stop dota2notes-replay.service dota2notes-sync.service dota2notes-opendota-parse.service dota2notes-images.service dota2notes-performance-reference.service dota2notes-monitor.service
sudo systemctl stop dota2notes-api.service
sudo -u dota2notes -H npm run release:prepare -w @dota-notes/api
sudo -u dota2notes -H npm ci --prefix apps/api/release --workspaces=false
sudo -u dota2notes -H env DOTENV_CONFIG_PATH=/var/www/dota2notes/.env.production npm run preflight --prefix apps/api/release --workspaces=false -- --check-db
sudo -u dota2notes -H env DOTENV_CONFIG_PATH=/var/www/dota2notes/.env.production npm run preflight --prefix apps/api/release --workspaces=false -- --role=replay
sudo systemctl start dota2notes-api.service
curl --retry 5 --retry-connrefused --retry-delay 1 -fS http://127.0.0.1:4100/health/ready
curl -fS https://api.dota2notes.ir/health/live
sudo systemctl start dota2notes-replay.timer dota2notes-sync-manual.timer dota2notes-opendota-parse.timer dota2notes-images.timer dota2notes-performance-reference.timer dota2notes-monitor.timer
sudo systemctl status dota2notes-api.service --no-pager -l
```

برای این پچ migration، نصب unit، daemon-reload یا ساخت parser لازم نیست.
فایل‌های spool/آرشیو و حساب کاربر را پاک یا jobهای تحلیل را requeue نکن.

## تست واقعی بعد از راه‌اندازی

در نرم‌افزار نصب‌شده، دانلود همین دو شناسه را دوباره بزن. انتظار داریم lookup
200 شود، سپس وضعیت آرشیو بررسی و فایل محلی دریافت شود؛ این را با لاگ تأیید کن:

```bash
sudo tail -n 500 /var/log/nginx/access.log | grep '/api/replays/' | tail -30
sudo journalctl -u dota2notes-api.service --since "5 minutes ago" --no-pager -o cat | tail -60
```

اگر lookup 200 شد و خطای دیگری در مرحلهٔ بعد بود، آن یک خطای جداست؛ بر اساس
همان مرحله، status و شناسهٔ مچ بررسی شود. فایل نهایی باید `.dem` باشد و در تب
دانلودشده‌ها دیده شود؛ فرمان Play demo کپی‌شدنی است.

## نتیجهٔ بررسی محلی

`npm test`: ۲۷۸ تست وب و ۴۲۲ تست ریشه پاس؛ تست مستقل API: ۴۰۲ پاس.
Typecheck همهٔ workspaceها، API build و release:prepare موفق. سناریوی قبل/بعد
400→200 با HTTP و PostgreSQL محلی بازتولید شد؛ شبکهٔ واقعی VPS، آرشیو واقعی و
نوشتن DEM روی ویندوز در این محیط اجرا نشده‌اند.
