# مرحلهٔ اول Monorepo و دسکتاپ

مبنای تغییر: آخرین `origin/main` با commit کامل `dcb721e03174376eca62629d28c6cd12de0c1f8c`.
شاخهٔ تغییر: `chore/monorepo-desktop-foundation`. این سند برای **همین مرحله** است؛ انتقال کامل backend انجام نشده است.

## مرز برنامه‌ها

| برنامه | فناوری | مسئولیت اکنون |
| --- | --- | --- |
| `apps/web` | Next.js | معرفی در `/`، دفتر قبلی در `/journal`، API و workerهای فعلی |
| `apps/desktop` | Tauri 2 + React/Vite/Tailwind 4 | پنجرهٔ Native و فضای کار نمونه |
| `apps/mobile` | Expo SDK 57 + React Native 0.86 | scaffold مشترک Android/iOS |
| `apps/api` | Express 5 | health نسخه‌دار، Helmet، CORS allowlist و shutdown |

Expo و React Native دو اپ نیستند؛ Tauri نیز wrapper همین frontend دسکتاپ است.
بسته‌های قرارداد، client و design token زیر `packages` هستند. همه یک lockfile و نصب npm دارند.
وب و دسکتاپ React 19.2.4 فعلی را حفظ می‌کنند؛ موبایل React 19.2.3 مطابق renderer این Expo/RN دارد.
`apps/mobile/metro.config.cjs` همهٔ importهای React در bundle موبایل، حتی از packageهای hoistشده،
را به نسخهٔ خود موبایل resolve می‌کند تا دو React در یک app بارگذاری نشوند.
منطق دیتابیس، Steam، OpenDota و replay هنوز در `apps/web` باقی است؛ در مرحلهٔ بعد هر feature
با تست قرارداد به Express منتقل می‌شود. ساخت `domain` یا repositoryهای مشترک پیش از این انتقال لازم نبوده است.

## مسیرهای جابه‌جاشده

`app`، `components`، `data`، `lib`، `public`، `scripts`، `tests`، `drizzle` و تنظیمات Next/Drizzle/Vitest/TypeScript
به `apps/web` منتقل شده‌اند. صفحات قدیمی در route group `(journal)` هستند؛ خود group به URL اضافه نمی‌شود.
تنها صفحهٔ اصلی دفتر به `/journal` منتقل شده است. بازگشت Steam و لینک‌های دفتر با همین مسیر هماهنگ‌اند.
`/match/...`، `/user/...`، `/admin` و `/api/...` آدرس قبلی خود را دارند.

env در ریشه است: Next با `@next/env` آن را از ریشه می‌خواند؛ Drizzle مسیر نسبی `DOTENV_CONFIG_PATH`
را از ریشه resolve می‌کند. parser از env موجود در systemd استفاده می‌کند. ذخیرهٔ replay و parser.jar در `/var/lib`
جابجا نشده‌اند. schema و محتوای SQL migrationها تغییر نکرده‌اند.

Workflow قدیمی GitHub Pages، که برای Next دارای API و دیتابیس مناسب نبود، با CI تست و build جایگزین شده است.
میزبانی وب همچنان VPS است؛ در این مرحله release عمومی یا deploy خودکار اضافه نشده است.

## دسکتاپ در این مرحله

- منوهای تحلیل، مچ‌ها، ریپلی، ژورنال و تنظیمات؛ جدول افقی تیم‌ها با فیلتر و انتخاب بازیکن.
- تب‌های نمای کلی، لین، خط زمان، بازیکنان و یادداشت با ناوبری صفحه‌کلید.
- سه palette: Obsidian / Radiant / Nebula؛ هر کدام Light / Dark / System.
- فارسی و انگلیسی؛ `lang` و `dir` واقعی و آینه‌شدن چیدمان؛ نام‌ها و اعداد با `bdi`.
- تنظیمات و یادداشت نمونه در localStorage دستگاه. نام کلیدها version دارند و تنظیمات خراب startup را نمی‌شکنند.
- بدون canvas متحرک پس‌زمینه و افکت blur سراسری؛ نمودار SVG سبک و UI با Tailwind/tokenها.
- پنجره با frame استاندارد سیستم‌عامل، حداقل 1024×700 و اندازهٔ اولیهٔ 1440×920.

**محدودیت صریح:** همهٔ مقادیر بازی ساختگی‌اند و با علامت نمونه نمایش داده می‌شوند. ورود Steam Native،
درخواست دانلود/تحلیل واقعی و sync یادداشت هنوز پیاده نشده‌اند. صفحهٔ Replay فقط نمونهٔ وضعیت و دکمهٔ بررسی
health Express محلی دارد؛ این دکمه job ایجاد نمی‌کند. معیار lag و مصرف RAM هنوز روی Windows اندازه‌گیری نشده است.

موبایل صفحهٔ شروع با رنگ/زبان/حالت نمایش دارد؛ تنظیماتش هنوز persistent نیستند. این مرحله بازطراحی کامل موبایل نیست.

## اجرای Windows

Node 24، Rust stable با MSVC، Visual Studio Build Tools با workload `Desktop development with C++`
و WebView2 نصب باشند. [پیش‌نیازهای رسمی Tauri](https://v2.tauri.app/start/prerequisites/) مرجع نصب است.

از ریشه و در ترمینال‌های مستقل:

```powershell
npm ci
npm run desktop:tauri
```

برای پیش‌نمایش بدون Rust:

```powershell
npm run desktop:dev
```

برای دکمهٔ health، نمونهٔ `.env.example` را به `.env.local` ریشه کپی کنید و در ترمینال دیگر:

```powershell
npm run api:dev
```

HTTP API پایه فقط روی loopback گوش می‌دهد. CORS فقط originهای تنظیم‌شده در `API_ALLOWED_ORIGINS`
را مجاز می‌کند و cookie مرورگر را به Native تعمیم نمی‌دهد. CSP دسکتاپ فقط شبکهٔ health محلی را مجاز کرده است؛
قبل از اتصال VPS باید آدرس API و CSP هم‌زمان به آدرس production مشخص تغییر کنند.
Tauri قابلیت filesystem، shell یا اجرای فرمان به frontend نداده است.

Installer آزمایشی:

```powershell
npm run desktop:bundle
```

خروجی NSIS زیر `apps/desktop/src-tauri/target/release/bundle/nsis` است. نخستین build Rust فایل
`apps/desktop/src-tauri/Cargo.lock` را می‌سازد؛ آن را با همان نسخهٔ toolchain پس از build موفق commit کنید.
Workflow دستی `Windows desktop test installer` نیز همین فرمان را روی Windows اجرا و artifact تولید می‌کند.
Installer فعلاً unsigned است؛ release عمومی، code signing و auto-update کارهای بعدی‌اند.

## دریافت ZIP و Git روی Windows

به‌علت جابه‌جایی فایل‌ها، صرفاً overwrite کردن ZIP کافی نیست؛ مسیرهای قبلی هم باید حذف شوند.
ZIP شامل فایل‌های تغییرکرده/جدید با مسیر نسبی مخزن و `.delivery/manifest.json` است.
اسکریپت Node در `.delivery/apply-delivery.mjs` ابتدا commit و تمیزی checkout و hash فایل‌های بسته را بررسی می‌کند،
سپس فقط فایل‌های قدیمی فهرست‌شده را حذف و فایل‌ها را کپی می‌کند. env، `.git`، node_modules و فایل‌های کاربر در فهرست نیستند.
اسکریپت با Node موجود در ابزار توسعه اجرا می‌شود و به تغییر ExecutionPolicy نیازی ندارد.
ZIP را در یک پوشهٔ **خارج از مخزن** استخراج کنید و مسیر واقعی خودتان را جایگزین کنید.

```powershell
cd C:\Projects\dota2-match-notes
git status --short
git switch main
git pull --ff-only origin main
git rev-parse HEAD
git switch -c chore/monorepo-desktop-foundation
node C:\Downloads\dota-notes-foundation\.delivery\apply-delivery.mjs --repository C:\Projects\dota2-match-notes
git status --short
npm ci
npm test
npm run typecheck
npm run desktop:build
npm run api:build
npm run build
npm run desktop:tauri
```

commit پایه باید دقیقاً همان commit ابتدای سند باشد. اگر main جلو رفته است، اسکریپت توقف می‌کند؛ بسته باید
روی main جدید بازبینی شود. اسکریپت محتوا یا تغییرات محلی را force نمی‌کند. اگر نام branch از قبل وجود دارد،
branch قدیمی را حذف نکنید؛ وضعیت آن را بررسی و نام جدیدی انتخاب کنید.

پس از بررسی کد، ظاهر و تست‌ها:

```powershell
git add -A
git commit -m "Create app workspaces and desktop foundation"
git push -u origin chore/monorepo-desktop-foundation
git switch main
git pull --ff-only origin main
git merge --no-ff chore/monorepo-desktop-foundation -m "Merge branch 'chore/monorepo-desktop-foundation'"
git push origin main
```

`.delivery` داخل مخزن کپی نمی‌شود. این مرحله از این محیط commit، push یا deploy نشده است.

## اولین استقرار این مرحله روی VPS

پس از merge و push کاربر. نصب دسکتاپ/Rust یا اجرای Express جدید روی VPS برای این مرحله لازم نیست؛
production همچنان همان Next و workerهاست. این تغییر SQL جدید ندارد. پیش از توقف، مطمئن شوید Git تمیز است
و checkout موردنظر همان `/var/www/dota2notes` است. روی VPS با RAM فعلی، build را هم‌زمان با parser اجرا نکنید.

```bash
cd /var/www/dota2notes
sudo -u dota2notes -H git status --short
node --version
sudo systemctl stop dota2notes-replay.timer dota2notes-sync-manual.timer dota2notes-opendota-parse.timer dota2notes-images.timer dota2notes-performance-reference.timer dota2notes-monitor.timer
sudo systemctl stop dota2notes-replay.service dota2notes-sync.service dota2notes-opendota-parse.service dota2notes-images.service dota2notes-performance-reference.service dota2notes-monitor.service
sudo systemctl stop dota2notes.service
sudo -u dota2notes -H git pull --ff-only origin main
sudo -u dota2notes -H npm ci
sudo -u dota2notes -H npm test
sudo -u dota2notes -H npm run typecheck
sudo -u dota2notes -H npm run build
sudo cp deploy/systemd/dota2notes.service deploy/systemd/dota2notes-replay.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start dota2notes.service
sudo -u dota2notes -H bash deploy/scripts/health-check.sh
curl --fail --show-error http://127.0.0.1:3000/
curl --fail --show-error http://127.0.0.1:3000/journal
sudo systemctl start dota2notes-replay.timer dota2notes-sync-manual.timer dota2notes-opendota-parse.timer dota2notes-images.timer dota2notes-performance-reference.timer dota2notes-monitor.timer
systemctl list-timers 'dota2notes-*'
sudo systemctl status dota2notes.service --no-pager
```

هر دستور مستقل است؛ اگر نصب، تست، build یا health شکست خورد، پیش از راه‌اندازی timerها خطا را بررسی کنید.
قبل از توقف worker در حال parse، وضعیت job را ببینید؛ صف پس از توقف باید از checkpoint/retry ادامه دهد.
unitهای اصلی و Replay اکنون WorkingDirectory=`/var/www/dota2notes/apps/web` دارند. root `.env.production`
و pathهای `/var/lib` ثابت‌اند. Cloudflare Worker، Nginx و PostgreSQL تغییری ندارند.

بعد از راه‌اندازی، ورود وب Steam، بازکردن مچ قدیمی، یک درخواست جدید Replay و اجرای timerها را بررسی کنید.
سلامت HTTP به‌تنهایی عملکرد Steam/Valve/OpenDota/ParsPack را ثابت نمی‌کند. installer را تا build و بررسی واقعی Windows
به دکمهٔ دانلود سایت وصل نکنید.

## ترتیب کار بعدی

۱. بررسی ظاهر و کارایی روی Windows واقعی و تثبیت طراحی؛ ۲. طراحی ورود Steam برای Native با مرورگر سیستم و
session مخصوص کلاینت؛ ۳. انتقال featureهای API به Express همراه تست قرارداد؛ ۴. اتصال مچ/صف/ژورنال دسکتاپ؛
۵. تولید Media از parse محلی؛ ۶. امضای installer و انتشار؛ سپس UI واقعی موبایل.
