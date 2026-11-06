> مرجع تکمیلی یا تاریخی: برای نقش سرورها و دستور استقرار، [راهنمای جاری](deployment-ubuntu.md) و [handoff](HANDOFF.md) مرجع هستند. دستورهای تک سروری این سند بدون تطبیق اجرا نشوند.

# آماده‌سازی مهاجرت آلمان — ۲۵ اکتبر ۲۰۲۶

مبنا `main d4cbc67`، branch `fix/germany-direct-replay`. فایل ZIP پس از ازبین‌رفتن فضای تحویل قبلی بازسازی شده است؛ دستورهای قبلی همچنان معتبرند. هیچ فایل حذفی نداریم. کد commit/push نشده و هیچ VPS از این محیط تغییر نکرده است.

## رفتار

- `LOCAL_REPLAY_DOWNLOAD_MODE=direct` ریپلی را از مسیر canonical عمومی `http://replayCLUSTER.valve.net/570/ID_SALT.dem.bz2` دریافت می‌کند. redirects دنبال نمی‌شوند، relay credential ارسال نمی‌شود و URL ورودی استفاده نمی‌شود. identifiers معتبر و DNS عمومی، سقف حجم، Range/ETag، checkpoint، magic header و SHA256 حفظ شده‌اند. Java همچنان هویت مچ و ده بازیکن را کنترل می‌کند؛ header/hash به‌تنهایی تأیید هویت نیستند. در تست واقعی کاربر HTTPS مستقیم ناموفق بود، HTTP فایل۴۶MB را حدود۱٫۲۷ثانیه دریافت کرد؛ این عدد مدت کل تحلیل نیست.
- پیش‌فرض proxy ایران حفظ است. در direct اگر refresh مستقیم metadata نتیجه ندهد، worker با retry محدود منتظر می‌ماند و به relay برنمی‌گردد. OpenDota هنوز برای اطلاعات پایه/metadata مصرف می‌شود؛ پارس خارجی و امتیاز خارجی فعال نشده‌اند.
- `STRATZ_ROUTING=dns` در Node/curl و وب/API پین قدیمیIP را کنار می‌گذارد؛ پیش‌فرض pinned است. `User-Agent: STRATZ_API` از قبل وجود داشت و تغییر نکرد؛403 تست اولیه با agent آزمایشی بود. query کوچک موفق، تأیید تمام مرجع ماهانه نیست.
- prepare۱تا۴، parse۱تا۲، archive۱تا۲؛ پیش‌فرض۲/۱/۱. آلمان4CPU/8GB برای۲/۲/۱ با drop-in موجود، CPUQuota250% و MemoryMax4G آماده شده است. این تنظیم بعد از benchmark/cutover فعال شود؛ هنوز روی سرور نصب نشده است. حلقه‌ها connection مستقل و همان claim اتمیک/lease و قفل سراسری قدیمی را دارند.
- Next16.4.3، Nodemailer10.2.1، Sharpحداقل0.35.5، Zodحداقل4.6.6، body-parserحداقل2.4.0 و source-map-jsحداقل1.2.2 در manifest/lock به‌روز شده‌اند. lock مستقل API/release هم به‌روز است. مشکلات Expo/mobile با ارتقای ناسازگار یا audit fix --force پنهان نشده‌اند.
- `verify-direct-download.mjs` فقط SELECT و دانلود در پوشهٔ موقت جدید خودش انجام می‌دهد و همان پوشه را حذف می‌کند. job یا تحلیل ثبت نمی‌کند.

## سیستم شخصی

ابتدا اگر git status تغییر ثبت‌نشده نشان می‌دهد توقف کنید. اگر main از d4cbc67 جلوتر رفته، فایل‌های مشترک را بدون مقایسه overwrite نکنید.

```bash
git status -sb
git switch main
git pull --ff-only origin main
git log -1 --oneline
git switch -c fix/germany-direct-replay
```

ZIP از ریشه replace شود. dist در ZIP/Git نیست؛ باید build شود. نصاب جدید دسکتاپ برای این پچ لازم نیست.

```bash
npm ci
npm test -w @dota-notes/api
npm test -w @dota-notes/web
npm run typecheck --workspaces --if-present
npm run api:build
npm run release:prepare -w @dota-notes/api
npm run build -w @dota-notes/web
npm audit --prefix apps/api/release --workspaces=false --omit=dev
```

بعد از موفقیت:

```bash
git add .
git commit -m "fix: prepare direct replay transport and secure Germany runtime"
git push -u origin fix/germany-direct-replay
git switch main
git pull --ff-only origin main
git merge --no-ff fix/germany-direct-replay -m "Merge branch 'fix/germany-direct-replay'"
git push origin main
```

## فقط آلمان si-209448 / 143.20.60.45

```bash
hostname
cd /var/www/dota2notes
sudo -u dota2notes -H git status -sb
sudo -u dota2notes -H git pull --ff-only origin main
sudo -u dota2notes -H git log -1 --oneline
sudo -u dota2notes -H npm ci
sudo -u dota2notes -H npm run api:build
sudo -u dota2notes -H npm run release:prepare -w @dota-notes/api
sudo -u dota2notes -H npm ci --prefix apps/api/release --workspaces=false
sudo -u dota2notes -H npm run build -w @dota-notes/web
```

هر خطا دیدید توقف و خروجی را ارسال کنید. migration جدید DB نداریم؛ DNS و ایران و TeamSpeak تغییر نکنند. هیچ worker/timer روی آلمان فعلاً start/enable نشود. تنظیمات زیر فقط برای همان تست‌اند و ENV دائمی را تغییر نمی‌دهند:

```bash
sudo -u dota2notes -H env DOTENV_CONFIG_PATH=/var/www/dota2notes/.env.production STRATZ_ROUTING=dns npm run preflight --prefix apps/api/release --workspaces=false -- --check-db
sudo -u dota2notes -H env DOTENV_CONFIG_PATH=/var/www/dota2notes/.env.production LOCAL_REPLAY_DOWNLOAD_MODE=direct npm run preflight --prefix apps/api/release --workspaces=false -- --role=replay
sudo -u dota2notes -H env DOTENV_CONFIG_PATH=/var/www/dota2notes/.env.production LOCAL_REPLAY_DOWNLOAD_MODE=direct node apps/api/release/scripts/replay-parser/verify-direct-download.mjs 9059929932
sudo -u dota2notes -H env DOTENV_CONFIG_PATH=/var/www/dota2notes/.env.production STRATZ_ROUTING=dns node apps/api/release/dist/stratz-reference-check.js --month 2026-09 --require-meta
sudo -u dota2notes -H npm audit --prefix apps/api/release --workspaces=false --omit=dev
```

بررسی STRATZ مرجع را حذف/بازسازی نمی‌کند؛ از limiter واقعی استفاده می‌کند و reservation/log عادی می‌تواند تغییر کند. خروجی این مرحله قبل از ادامهٔ انتقال لازم است.

## باقی‌ماندهٔ مهاجرت

- initial restore و تست‌های شبکهٔ آلمان انجام شده‌اند، نه cutover نهایی. اطلاعات mutable و DB باید هنگام توقف هماهنگ writerهای ایران مجدد منتقل شوند.
- TeamSpeak آلمان باید offline/masked آماده شود: UID/GID1000، subuid/subgid100000:65536 و مالکیت109986 فایل‌ها حفظ شود. هویت مشترک هم‌زمان روی دو سرور اجرا نشود. TeamSpeak ایران دست‌نخورده است.
- machine-id دو سرور تکراری است و باید در نگهداری کنترل‌شده اصلاح شود. SSH9011 پس از reboot بررسی شود. unit مسیرMTU و تنظیمات شبکهٔ ایران روی آلمان نصب نشوند.
- پس از تأیید benchmark Java، nginx/TLS و انتقال نهایی، مقادیر direct/dns و۲/۲/۱ در ENV آلمان ذخیره شوند. قبل از اجرای worker: unit عادی و `deploy/systemd/overrides/germany-replay.conf` به‌صورت `/etc/systemd/system/dota2notes-replay.service.d/20-germany.conf` نصب و daemon-reload شوند؛ این‌ها فعلاً اجرا نشوند.
- اگر در انتقال نهایی ENV ایران دوباره کپی شد، گزینه‌های آلمان دوباره اعمال شوند. DNS و شروع سرویس‌ها فقط پس از تأیید انتقال نهایی است؛ backup/سرور ایران تا تأیید کامل حفظ شوند.

## محدودیت اعتبارسنجی

build بک‌اند و تست‌ها در این محیط ممکن‌اند؛ build قبلی وب با `ENOENT uv_resident_set_memory` متوقف شد و همان خطا با process.memoryUsage بازتولید شد. ادعای build موفق وب، benchmark دو Java واقعی یا اجرای VPS نداریم. build وب باید روی سیستم کاربر/آلمان تأیید شود. در بازسازی، تست‌ها و lockها دوباره بررسی می‌شوند؛ audit لحظهٔ تحویل تضمین نبود آسیب‌پذیری آینده نیست.

بازسازی مجدد: ۴۶۶ تست API، ۲۷۹ تست وب و۱۶۱ تست دسکتاپ/تم، TypeScript همهٔ workspaceها و API build/release:prepare موفق شدند؛ audit مستقل API صفر مورد داشت. ZIP فقط فایل‌های تغییرکرده/جدید را با مسیر نسبی صحیح دارد.
