# پروفایل، پنل ادمین و سایدبار دسکتاپ

پایه: `0603a7e` از `origin/main`، ۱۰ اکتبر ۲۰۲۶. branch تسک: `feat/desktop-profile-admin`.

## تغییرات

- ستون هیرو و عنوان آن هنگام اسکرول افقی جدول داشبورد و مچ‌ها ثابت می‌مانند؛ ترتیب یکسان ستون‌ها در فارسی و انگلیسی حفظ شده است.
- شش میان‌بر بزرگ داشبورد حذف شده‌اند. ترتیب سایدبار: داشبورد، مچ‌ها، ریپلی، گزارش هوشمند، Meta، Coach، آموزش و تمرین، تنظیمات. بخش‌های آینده همچنان Coming soon هستند؛ محتوای آموزشی یا کوچ ساختگی اضافه نشده است.
- نتیجه W/L طبق تصویر کاربر، باکس کوچک سبز/قرمز با متن تیره دارد.
- دکمه حساب پایین سایدبار صفحه پروفایل را باز می‌کند: شناسه‌های قابل‌کپی استیم، تاریخ عضویت/ورود/دریافت، وضعیت رمز/ایمیل/کدهای بازیابی، آمار کل و ده مچ اخیر.
- یک دکمه مستقل مدیریت کنار حساب Super Admin قرار دارد. سیاست موجود مجوزها حفظ شده: `SUPER_ADMIN_STEAM_IDS` مرجع دسترسی مدیریتی است، نه صرفاً `users.is_admin` یا داده محلی کلاینت. تغییر ENV لازم نیست؛ شناسه مدیر فعلی از قبل در allowlist سرور است.
- پنل مدیریت به تب‌های جدا تقسیم شده؛ همه بخش‌های پنل Next موجود پوشش داده شده‌اند، با APIهای اصلی همان Express. پروفایل کاربر یک endpoint جدید است.

| قابلیت قبلی Next | جای جدید در دسکتاپ |
| --- | --- |
| آمار حساب‌ها، نشست‌ها، مچ‌ها، تصاویر و سهمیه OpenDota، نمودار ۷/۳۰/۹۰ روز | نمای کلی |
| جست‌وجو، صفحه‌بندی و ساخت کاربر با آیدی استیم | کاربران |
| تعیین/حذف رمز، ابطال نشست‌ها | کاربران، پنجره مدیریت رمز |
| بازخوانی ۱ تا ۲۰ مچ اخیر از OpenDota | کاربران، بازخوانی مچ‌ها؛ این عملیات reparse ریپلی نیست |
| systemd و لاگ، آمار صف‌ها | سرویس‌ها |
| دانلود، سرعت، حجم، مرحله، retry، heartbeat، مسیر و رویدادها | صف ریپلی |
| درخواست نسخه ماهانه، پیشرفت Meta/Performance، رویداد و داده هیرو/پوزیشن | مرجع آماری |
| ویرایش سند Tiptap، پیش‌نویس و انتشار عمومی | انتشارها |
| مرور پوشه/فایل، load more و حذف آرشیو | آرشیو |
| مشاهده حساب، امنیت و آمار یک کاربر | قابلیت تازه در پنجره پروفایل کاربر |

اطلاعات مدیریتی در کش آفلاین ذخیره نمی‌شوند. تنها پروفایل خود کاربر به کش موجود همان حساب اضافه شده است. رمز، hash، recovery email/code و token در پاسخ پروفایل ارسال نمی‌شوند. APIهای جدید `GET /api/profile/me` و `GET /api/admin/users/:userId`، و معادل `/api/v1` آنها هستند؛ مالک پروفایل از نشست احراز‌شده گرفته می‌شود، نه query ورودی.

دریافت وضعیت فقط برای تب فعال انجام می‌شود، درخواست‌ها سری هستند، با مخفی‌شدن پنجره/آفلاین متوقف و با focus/reconnect ازسر گرفته می‌شوند. مجوز 401/403 داده قبلی مدیریتی را از نما حذف می‌کند. حذف آرشیو/رمز و انتشار عمومی تأیید مشخص در رابط دارند.

مانیتور اکنون timer دریافت دستی و service/timer مانیتور را هم می‌شناسد؛ API Express و reader وب قدیمی با collector همگام شده‌اند. خطاهای sync در آخرین خطاهای صف می‌آیند. در نبود snapshot، آرایه سرویس‌ها خالی است و آمار صف‌ها همچنان نمایش داده می‌شود. worker مقطعی موفق از API/وب متوقف‌شده تفکیک می‌شود؛ API متوقف سبز نمایش داده نمی‌شود.

Tiptap با همان نسخه 3.31.3 موجود در lock وب به dependencyهای دسکتاپ اضافه شده؛ فقط بخش ادمین آن را بارگیری می‌کند. dependency دیگری ارتقا نیافته است. schema، migration، ENV، parser.jar، فایل unit و Worker کلادفلر تغییر ندارند.

## اعمال محلی

از روت پروژه و با working tree تمیز:

```powershell
git status -sb
git fetch origin
git switch main
git pull --ff-only origin main
git log -1 --oneline
git switch -c feat/desktop-profile-admin
```

محتوای ZIP را از روت copy/replace کنید؛ فایل حذف‌شدنی ندارد. چون package/lock تغییر کرده‌اند، npm ci لازم است:

```powershell
npm ci
npm test -- --maxWorkers=2 --testTimeout=15000
npm run test -w @dota-notes/api -- --maxWorkers=2
npm run typecheck
npm run desktop:build
npm run api:build
npm run release:prepare -w @dota-notes/api
npm run build
npm run desktop:installer
```

حد تست UI فقط در فرمان به ۱۵ ثانیه تغییر می‌کند؛ assertionها یا timeout پیش‌فرض پروژه تغییر نکرده‌اند. در اجرای هم‌زمان اولیه یک تست قدیمی ساخت تصویر به سقف ۵ ثانیه خورد؛ اجرای محدود به دو worker آن را موفق نشان داد. تست API از قبل سقف ۳۰ ثانیه دارد.

## Commit، push و merge

بعد از موفقیت تست‌ها و build:

```powershell
git status -sb
git add .
git commit -m "feat(desktop): add profile and admin workspace with sticky match heroes"
git push -u origin feat/desktop-profile-admin
git switch main
git pull --ff-only origin main
git merge --no-ff feat/desktop-profile-admin -m "Merge branch 'feat/desktop-profile-admin'"
git push origin main
```

در این مرحله tag لازم نیست. هیچ commit/push/merge از طرف این تحویل روی GitHub انجام نشده است.

## استقرار در VPS موجود

این تسک فقط دسکتاپ نیست: API جدید و اصلاح مانیتور دارد. تغییر API مشخصات ریپلی تسک قبل که کاربر هنوز مستقر نکرده هم با build جدید وارد runtime می‌شود. مسیر checkout همان `/var/www/dota2notes` است. اگر working tree تغییر محلی دارد یا هر فرمان شکست خورد، قبل از ادامه خروجی را بررسی کنید؛ reset/clean نکنید.

ابتدا Git را بررسی کنید؛ سپس سرویس‌های وابسته را پیش از تغییر checkout/runtime متوقف کنید:

```bash
cd /var/www/dota2notes
sudo -u dota2notes -H git status -sb
sudo -u dota2notes -H git fetch origin
sudo systemctl stop dota2notes-replay.timer dota2notes-sync-manual.timer dota2notes-opendota-parse.timer dota2notes-images.timer dota2notes-performance-reference.timer dota2notes-monitor.timer
sudo systemctl stop dota2notes-replay.service dota2notes-sync.service dota2notes-opendota-parse.service dota2notes-images.service dota2notes-performance-reference.service dota2notes-monitor.service
sudo systemctl stop dota2notes-api.service dota2notes.service
sudo -u dota2notes -H git switch main
sudo -u dota2notes -H git pull --ff-only origin main
sudo -u dota2notes -H git log -1 --oneline
```

ساخت و بررسی runtime؛ دیتابیس PostgreSQL فعال می‌ماند:

```bash
sudo -u dota2notes -H npm ci
sudo -u dota2notes -H npm run api:build
sudo -u dota2notes -H npm run release:prepare -w @dota-notes/api
sudo -u dota2notes -H npm ci --prefix apps/api/release --workspaces=false
sudo -u dota2notes -H env DOTENV_CONFIG_PATH=/var/www/dota2notes/.env.production npm run preflight --prefix apps/api/release --workspaces=false -- --check-db
sudo -u dota2notes -H env DOTENV_CONFIG_PATH=/var/www/dota2notes/.env.production npm run preflight --prefix apps/api/release --workspaces=false -- --role=replay
sudo -u dota2notes -H npm run build
sudo install -o root -g root -m 0644 apps/api/scripts/service-monitor/collect.mjs /usr/local/libexec/dota2notes/collect.mjs
```

در این تسک Next build لازم است، چون reader مانیتور وب قدیمی هم تغییر کرده؛ در غیر این صورت snapshot جدید را نمی‌شناسد. فایل collector فعال خارج checkout است و باید همان خط install اجرا شود. نیازی به نصب دوباره unit/daemon-reload، migration، ساخت JAR یا تغییر ENV نیست.

فقط پس از موفقیت build و هر دو preflight با `ok:true`:

```bash
sudo systemctl start dota2notes-api.service dota2notes.service
curl --retry 5 --retry-connrefused --retry-delay 1 -fS http://127.0.0.1:4100/health/ready
curl -fS https://api.dota2notes.ir/health/live
sudo systemctl start dota2notes-replay.timer dota2notes-sync-manual.timer dota2notes-opendota-parse.timer dota2notes-images.timer dota2notes-performance-reference.timer dota2notes-monitor.timer
sudo systemctl start dota2notes-monitor.service
sudo systemctl status dota2notes-api.service dota2notes.service --no-pager -l
sudo systemctl list-timers --all --no-pager 'dota2notes-*'
sudo journalctl -u dota2notes-monitor.service -n 20 --no-pager
```

ready عمومی عمداً 404 است؛ تست ready فقط loopback است. وب قدیمی با merge/pull حذف نمی‌شود و پس از این انتشار همچنان فعال می‌ماند.

## تست واقعی پس از استقرار

1. نصاب جدید: در هر دو زبان جدول را افقی اسکرول کنید؛ هیرو و عنوان ستون هیرو باید باقی بمانند. W/L را با تصویر مرجع مقایسه کنید. اندازه پنجره و ترتیب آیتم/جزئیات تغییر نکرده است.
2. دکمه حساب: پروفایل واقعی با IDهای قابل‌کپی و آمار همان حساب بیاید. پس از یک بار بازکردن، در حالت آفلاین اطلاعات ذخیره‌شده همان حساب قابل‌خواندن باشد.
3. حساب عادی دکمه ادمین ندارد؛ مدیر allowlist فعلی دکمه مستقل و هفت تب دارد. پروفایل یک کاربر دیگر و تاریخ‌های ۲۴ ساعته را بررسی کنید.
4. تب سرویس‌ها باید API، دریافت دستی و monitor را نشان دهد. worker oneshot موفق ممکن است inactive باشد؛ API/وب متوقف نباید موفق نشان داده شوند.
5. تب صف ریپلی در پردازش واقعی، وضعیت و سرعت/تلاش را به‌روز کند. تب غیر فعال نباید هم‌زمان polling کند.
6. انتشار ابتدا پیش‌نویس بماند؛ حذف آرشیو/رمز را صرفاً برای تست انجام ندهید. کنترل تأییدشان با تست خودکار بررسی شده است.

## حدود اعتبارسنجی

تست‌های HTTP/DB با PostgreSQL سازگار PGlite و UI با jsdom اجرا شده‌اند؛ سرویس‌های واقعی VPS و نصب ویندوز در این محیط اجرا نشده‌اند. sticky و ظاهر نهایی در WebView2 نیاز به بررسی کاربر دارند.

Build دسکتاپ، API و release:prepare موفق هستند. build Next در این محیط با `ENOENT uv_resident_set_memory` متوقف شد؛ همین خطا حتی در `node -e 'process.memoryUsage.rss()'` مستقل از پروژه تکرار می‌شود و محدودیت خواندن حافظه فرایند در محیط اجرا است. تلاش با webpack هم همین نتیجه داشت. تغییر workaround به کد محصول اضافه نشده؛ typecheck وب و تست‌های وب انجام می‌شوند و build عادی باید روی سیستم کاربر/VPS بررسی شود.

## نتیجه نهایی تست‌ها

- `npm test -- --maxWorkers=2 --testTimeout=15000`: وب ۲۷۹ تست و ریشه ۴۴۶ تست موفق.
- `npm run test -w @dota-notes/api -- --maxWorkers=2`: ۴۰۵ تست موفق.
- `npm run typecheck`: همه workspaceها موفق.
- build دسکتاپ، API و release:prepare موفق؛ آزمون‌های پروفایل/ادمین پس از اصلاح نهایی وضعیت حذف رمز ۱۳ تست موفق.
- build وب با هر دو Turbopack/webpack به محدودیت محیطی خواندن حافظه فرایند خورد، مطابق توضیح بالا.
- نصاب ویندوز، ظاهر sticky در WebView2 و استقرار/درخواست واقعی VPS باید روی سیستم کاربر بررسی شوند.
