# استقرار دریافت خودکار و کتابخانه ریپلی

این راهنما برای نسخه پایه `0c01f6c50833f63c36eb155205e7c497d69ed461` و ادامه همان نصب دو VPS است.
فایل zip فقط فایل های جدید و تغییرکرده را با مسیر ریپو دارد. محتویات آن را در ریپوی موجود copy/replace کنید؛ ریپو، دیتابیس، env یا نصب سرورها را از اول نسازید.

## رفتار نسخه جدید

- پردازش مستقل ویندوز با Task Scheduler هنگام ورود کاربر اجرا می شود. بسته شدن پنجره برنامه آن را متوقف نمی کند.
- دریافت خودکار از GSI، بررسی دوره ای تاریخچه و Fetch دستی، مکمل هم هستند. Fetch دستی حذف نشده است.
- رویداد پایان بازی به ایران می رسد؛ اولین بررسی اطلاعات پنج دقیقه بعد از پایان بازی در آلمان است. فاصله تلاش های بعدی ۳، ۵، ۱۰، ۲۰ و سپس ۳۰ دقیقه است؛ مهلت صف رویداد ۲۴ ساعت است. محدودیت سرویس خارجی نیز رعایت می شود.
- برای یک مچ موجود، جزئیات دوباره گرفته نمی شود. فهرست شناسه ها ممکن است برای کشف مچ های جا افتاده دوباره خوانده شود. فهرست یک درخواست دستی ذخیره می شود و بین دسته ها از ابتدا دریافت نمی شود.
- تاریخچه کامل برای یک حساب حداکثر یک روز نگه داشته می شود؛ در درخواست جدید، بازه اخیر ۴۸ ساعت بررسی و روزهای قدیمی روزانه بازبینی می شوند. روز کامل به معنی ممنوع شدن دائمی بازبینی نیست.
- assets بیرون پوشه نصب هستند. نصاب فقط لوگو و فونت ها و فایل های اجرایی/رابط ضروری را نگه می دارد. فایل های رسانه ای مورد نیاز پیش از ورود دریافت می شوند.
- مسیر نصب Dota با رجیستری Steam، کتابخانه ها و manifest بازی پیدا می شود؛ پیش از دانلود دوباره اعتبارسنجی می شود. انتخاب دستی راه جایگزین است.
- تحلیل و آرشیو مستقل هستند. درخواست دانلود به آماده سازی/آپلود همان فایل اولویت می دهد و منتظر پایان تحلیل ها نمی ماند. انتقال فعال قبلی قطع نمی شود و برای جلوگیری از گرسنگی صف، درخواست های قدیمی هم سهم دارند.
- مهلت انتظار کلاینت برای آماده شدن دانلود ۳۰ دقیقه است. پایان این مهلت، درخواست محلی را ناموفق و قابل تلاش مجدد می کند؛ تحلیل مستقل سرور لغو نمی شود. خطای نهایی از فعالیت خارج می شود. خطا کنار مچ باقی می ماند، نه به شکل دانلود بی پایان.
- تسک دانلود موفق از فهرست فعالیت حذف می شود؛ پیام تکمیل کوتاه نمایش داده می شود. خطاهای نهایی از شمارنده فعال خارج و قابل بستن هستند؛ پنل خطای قدیمی را برای همیشه نگه نمی دارد.
- انیمیشن مرحله ها ۴۵۰ میلی ثانیه پیشرفت و ۱۸۰ میلی ثانیه تبدیل به تیک دارد؛ این زمان فقط مربوط به نمایش است. دانلود و پردازش منتظر آن نمی مانند. کاهش حرکت رعایت می شود.

## ۱. ویندوز: دریافت کد و ساخت

در PowerShell داخل ریپوی خودت:

```powershell
Set-Location "D:\dota2-match-notes"
git status -sb
git switch main
git pull --ff-only origin main
git log -1 --format="%H%n%s"
$DotaBase = (git rev-parse HEAD).Trim()
if ($DotaBase -ne "0c01f6c50833f63c36eb155205e7c497d69ed461") { throw "Base changed; reconcile this package before copying files." }
git switch -c feat/automatic-library
```

اگر تغییر محلی داری، قبل از ادامه آن را جدا نگه دار. دستور حذف یا reset سخت اجرا نکن.
حالا zip را در یک پوشه موقت باز کن و محتویات آن، شامل `apps`، `deploy`، `docs`، `.github`، `.gitignore` و `package.json` را روی ریپو copy/replace کن. فایل های دست نخورده ریپو باید باقی بمانند.

Node 24، Rust stable و پیش نیازهای فعلی Tauri/MSVC لازم هستند. اگر Rust قدیمی است، `rustup update stable` را اجرا کن.

```powershell
$DotaChecks = @(
    "npm ci",
    "npm run test:desktop",
    "npm run test -w @dota-notes/api",
    "npm run typecheck",
    "npm run api:build",
    "npm run test:native-replay",
    "npm run test:companion",
    "node apps/desktop/scripts/prepare-native.mjs",
    "cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml",
    "npm run desktop:installer",
    "git diff --check"
)
foreach ($DotaCheck in $DotaChecks) {
    Write-Host "`nRunning: $DotaCheck"
    & cmd.exe /d /c $DotaCheck
    if ($LASTEXITCODE -ne 0) { throw "Stopped: $DotaCheck" }
}
```

`prepare-native.mjs` ابتدا فرانت و سپس executable مستقل companion را می سازد و برای نصاب در محل درست قرار می دهد. اجرای مستقیم تست Tauri قبل از این مرحله ممکن است به دلیل نبود فایل companion شکست بخورد.
نصاب اینجاست:

```text
apps/desktop/src-tauri/target/release/bundle/nsis/
```

نصاب را هنوز نصب نکن. اول API، assets و worker ها را مستقر کن.

پس از پاس شدن بررسی های ویندوز:

```powershell
git status --short
git add -A
git commit -m "Add automatic match tracking and resilient replay library"
git push -u origin feat/automatic-library
git switch main
git pull --ff-only origin main
git merge --no-ff feat/automatic-library -m "Merge branch 'feat/automatic-library'"
git push origin main
git log -1 --format="%H%n%s"
```

این commit/push ها را خودت انجام می دهی؛ در بسته تحویلی commit یا push انجام نشده است.

## ۲. آلمان: توقف نویسنده ها

روی `143.20.60.45`:

```bash
sudo systemctl stop dota2notes-replay.service dota2notes-sync-daemon.service
sudo systemctl stop dota2notes-images.timer dota2notes-monitor.timer
sudo systemctl stop dota2notes-images.service dota2notes-monitor.service
sudo systemctl is-active dota2notes-link.service
```

اگر یکی از واحدهای تک اجرایی از قبل inactive بود طبیعی است. اگر نام واحدی وجود نداشت، خروجی را بررسی کن؛ واحدهای فعال دیگر را تصادفی حذف نکن.
لینک SSH باید active بماند. PostgreSQL ایران، SSH، Nginx و ارتباط دو سرور را دست نزن.

## ۳. ایران: انتشار API و assets و migration

روی `87.107.165.50`؛ دیتابیس اصلی همین نصب `dota_notes` است:

```bash
set -e
sudo systemctl stop dota2notes-api.service dota2notes.service
sudo -u dota2notes -H git -C /var/www/dota2notes pull --ff-only origin main
cd /var/www/dota2notes
sudo -u dota2notes -H git log -1 --format='%H%n%s'
sudo -u dota2notes -H npm ci
sudo -u dota2notes -H npm run desktop:assets:publish
sudo -u dota2notes -H npm run api:build
sudo -u dota2notes -H npm run release:prepare -w @dota-notes/api
sudo -u dota2notes -H npm ci --prefix apps/api/release --workspaces=false
sudo -u dota2notes -H env DOTENV_CONFIG_PATH=/var/www/dota2notes/.env.production node apps/api/release/dist/migrate.js
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d dota_notes <<'SQL'
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE sync_history_cache, companion_devices, match_observations
TO dota_notes_compute;
SQL
sudo -u dota2notes -H env DOTENV_CONFIG_PATH=/var/www/dota2notes/.env.production node apps/api/release/dist/preflight.js --role=api --check-db
sudo nginx -t
sudo systemctl start dota2notes-api.service dota2notes.service
curl -fsS --max-time 10 http://127.0.0.1:4100/health/live
```

migration شماره 0031 افزایشی است؛ داده قبلی را حذف نمی کند. دسترسی جدول های جدید باید به نقش محدود آلمان داده شود؛ migration را از آلمان با نقش compute اجرا نکن.
خروجی انتشار assets باید نسخه و تعداد فایل ها را نشان بدهد. فایل های حجیم در `apps/api/release/public/desktop-assets/objects` قرار می گیرند.
API مسیر عمومی assets را قبل از محدودکننده درخواست های API سرو می کند؛ نیازی به تغییر DNS یا جایگزین کردن تنظیم SSL فعلی Nginx نیست. template ریپو مسیر مستقیم Nginx را هم دارد، ولی template HTTP را جای فایل SSL فعال کپی نکن.
این انتشار تغییری در صفحه سایت ایجاد نمی کند و به Next build مجدد نیاز ندارد.

## ۴. آلمان: انتشار پردازش و فعال کردن بررسی خودکار

```bash
set -e
sudo -u dota2notes -H git -C /var/www/dota2notes pull --ff-only origin main
cd /var/www/dota2notes
sudo -u dota2notes -H git log -1 --format='%H%n%s'
sudo -u dota2notes -H npm ci
sudo -u dota2notes -H npm run api:build
sudo -u dota2notes -H npm run release:prepare -w @dota-notes/api
sudo -u dota2notes -H npm ci --prefix apps/api/release --workspaces=false
sudo python3 deploy/update-automatic-library-env.py /var/www/dota2notes/.env.production
sudo -u dota2notes -H env DOTENV_CONFIG_PATH=/var/www/dota2notes/.env.production node apps/api/release/dist/preflight.js --role=api --check-db
sudo -u dota2notes -H env DOTENV_CONFIG_PATH=/var/www/dota2notes/.env.production node apps/api/release/dist/preflight.js --role=replay --check-db
sudo systemctl restart dota2notes-api.service
sudo systemctl start dota2notes-replay.service dota2notes-sync-daemon.service
sudo systemctl start dota2notes-images.timer dota2notes-monitor.timer
sudo systemctl is-active dota2notes-link.service dota2notes-api.service dota2notes-replay.service dota2notes-sync-daemon.service dota2notes-images.timer dota2notes-monitor.timer
```

اسکریپت env فقط سه تنظیم دریافت خودکار را تغییر می دهد و token ها و بقیه مقادیر را نگه می دارد. env جدید یا private JSON لازم نیست.
تایمر مرجع آماری که قبلا خاموش گذاشته بودیم، در این انتشار خودکار فعال نمی شود. بررسی زنده STRATZ و پاکسازی سرویس های قدیمی، کار جداگانه هستند.

## ۵. بررسی سرور پیش از نصب کلاینت

PowerShell ویندوز، بدون VPN:

```powershell
Clear-DnsClientCache
Resolve-DnsName api.dota2notes.ir -Type A
curl.exe -4 --noproxy "*" -fsS --connect-timeout 5 --max-time 15 https://api.dota2notes.ir/health/live
$DotaManifest = Get-Content .\apps\desktop\asset-manifest.json -Raw | ConvertFrom-Json
$DotaAssetObject = $DotaManifest.files[0].object
curl.exe -4 --noproxy "*" -fSI --connect-timeout 5 --max-time 20 "https://api.dota2notes.ir/desktop-assets/objects/$DotaAssetObject"
```

DNS باید ایران `87.107.165.50` باشد و هر دو درخواست موفق شوند. در این مرحله به تنظیم Cloudflare، گواهی و مسیر ترافیک دست نمی زنیم.

## ۶. پاکسازی کامل ویندوز برای تست نصب اول

این مرحله عمدا cache رسانه ها، ورود ذخیره شده، localStorage/WebView، تنظیمات و تسک پس زمینه همین کاربر را پاک می کند. برای آپدیت عادی لازم نیست.
حساب و مچ های سرور پاک نمی شوند. Steam، خود Dota و فایل های `.dem` داخل بازی پاک نمی شوند.

۱. برنامه و بازی را ببند.
۲. در Windows Settings وارد `Apps > Installed apps` شو، `Dota Notes` را پیدا کن و `Uninstall` بزن.
۳. در PowerShell داخل ریپو، از executable جدیدی که در مرحله ساخت آماده شده استفاده کن:

```powershell
Set-Location "D:\dota2-match-notes"
& .\deploy\windows\reset-desktop.ps1 -CompanionExe .\apps\desktop\companion\target\release\dota-notes-companion.exe
```

اگر ویندوز اسکریپت دانلود شده را blocked کرده بود، فقط همین فایل را آزاد کن و دوباره اجرا کن:

```powershell
Unblock-File -LiteralPath .\deploy\windows\reset-desktop.ps1
```

Execution Policy کل سیستم را تغییر نده. در صورت خطای قفل بودن فایل، پردازش متعلق به Dota Notes را ببند و دوباره تلاش کن؛ پردازش های مربوط به برنامه های دیگر را یکجا نبند.

پیام موفقیت باید صریحا پاک شدن فایل های محلی و credential ها را نشان بدهد. بررسی تکمیلی:

```powershell
Test-Path "$env:LOCALAPPDATA\DotaNotesShared"
Test-Path "$env:APPDATA\ir.dota2notes.desktop"
Test-Path "$env:LOCALAPPDATA\ir.dota2notes.desktop"
```

هر سه باید `False` باشند. حالا نصاب جدید را نصب و اجرا کن. باید پیش از ورود، صفحه دریافت assets ظاهر شود. بعد از تکمیل، صفحه ورود می آید؛ این نصب از نظر داده های محلی تازه است.

برای تست حفظ assets، بعدا یک بار حذف و نصب عادی انجام بده و اسکریپت reset را اجرا نکن. آن بار فایل های سالم نباید دوباره دریافت شوند.

## ۷. فعال کردن ارتباط بازی، فقط یک بار

برای دریافت خودکار، وجود companion کافی نیست؛ GSI در بازی هم باید فعال باشد.
در Steam مسیر `Library > Dota 2 > Properties > General > Launch Options` را باز کن و بدون حذف گزینه های قبلی، این گزینه را اضافه کن:

```text
-gamestateintegration
```

بازی را بعد از این تغییر دوباره اجرا کن. دکمه اجرای Dota داخل برنامه نیز این گزینه را برای همان اجرا می فرستد، ولی برای اجرای مستقیم از Steam باید آن را در Launch Options نگه داری.
پردازش همراه با credential محدود مخصوص گزارش مچ کار می کند؛ رمز Steam دریافت نمی کند. هنگام خروج از حساب برنامه، دسترسی همان پردازش همراه قطع می شود؛ بستن پنجره برنامه خروج از حساب نیست.

## ۸. سناریوهای پذیرش

### دریافت خودکار و دستی

- یک بار وارد حساب شو تا پردازش همراه ثبت شود، سپس پنجره برنامه را کامل ببند. در Task Manager فقط companion مستقل می تواند باقی بماند؛ نیازی به پنجره یا WebView برنامه نیست.
- با اینترنت ایران یک مچ واقعی بازی کن. بعد از پایان، حداقل پنج دقیقه برای اولین بررسی و زمان آماده شدن سرویس خارجی فرصت بده. بعد برنامه را باز کن؛ مچ باید خودکار اضافه شده باشد.
- در میانه بازی اینترنت برنامه قطع شود؛ بعد از اتصال، رویداد ذخیره شده باید ارسال شود. قطع اینترنت داخل خود بازی یا نبود شناسه معتبر ممکن است به بازیابی تاریخچه نیاز داشته باشد.
- یک مچ روی سیستم دیگر بازی کن. بررسی دوره ای یا Fetch دستی باید آن را اضافه کند.
- یک بازه را دوباره Fetch کن. مچ موجود نباید دوباره ایجاد شود یا جزئیات کامل تکراری بگیرد. ممکن است یک درخواست فهرست برای کشف مچ جدید انجام شود.
- بازی نزدیک نیمه شب را بررسی کن؛ روز نمایش بر اساس زمان شروع رسمی بازی در تهران است، حتی اگر پایان آن روز بعد باشد.

### assets و مسیر بازی

- نصب پاک: صفحه دریافت پیش از ورود؛ فایل های خراب یا ناقص باید دوباره دریافت شوند.
- دانلود assets را با قطع اینترنت متوقف کن و دوباره ادامه بده؛ فایل های سالم حفظ شوند.
- اجرای بعدی و نصب مجدد عادی: دریافت کامل دوباره انجام نشود.
- محل Dota در کتابخانه دوم Steam باشد؛ مسیر پیدا شود. بعد مسیر بازی را از خود Steam جابه جا کن و پیش از دانلود بعدی، کشف مسیر جدید بررسی شود.
- ریپلی معتبر موجود باید «دانلود شده» نمایش دهد. حذف فایل از Explorer و برگشت به برنامه باید وضعیت را به روز کند.

### اولویت دانلود در حضور تحلیل

- پنج مچ را برای تحلیل ثبت کن. یکی از همان ها را وقتی هنوز مراحل تحلیل ادامه دارند دانلود کن. با آماده شدن آرشیو، دانلود باید شروع شود و منتظر تمام شدن بقیه تحلیل ها نماند.
- پنج مچ دیگر را تحلیل کن و دانلود مچی خارج از آن پنج تا را درخواست بده. آماده سازی و آرشیو این درخواست باید اولویت بگیرد؛ انتقال فعال قبلی عمدا قطع نمی شود.
- یک ریپلی ناموجود یا ناموفق را امتحان کن. پس از خطای نهایی یا مهلت آماده سازی، درخواست نباید برای همیشه فعال بماند. تلاش مجدد باید نوبت تازه ای ایجاد کند.

### هماهنگی و ظاهر

- هنگام تحلیل، بین داشبورد، مچ ها و ریپلی جابه جا شو. خطای قدیمی نباید وضعیت درخواست تازه را بازنویسی کند.
- مرحله های سریع باید با پیشرفت کوتاه و تبدیل عدد به تیک عبور کنند؛ دانلود واقعی نباید برای انیمیشن معطل بماند.
- پس از تکمیل، تسک ها از فهرست فعالیت خارج شوند. خطاهای نهایی، قابل بستن باشند و شمارنده فعال را بالا نگه ندارند.
- شناسه، دکمه کپی، متن وضعیت و آیکن ها در پنل باریک روی هم نیفتند. فارسی، انگلیسی و کاهش حرکت را بررسی کن.

## ۹. عیب یابی محدود و هدفمند

اگر companion رویداد نگرفت، ابتدا وجود launch option و restart بازی را بررسی کن؛ صرف نصب برنامه فعال بودن GSI را ثابت نمی کند.

در ویندوز:

```powershell
Get-ScheduledTask -TaskName "DotaNotes-Companion-*" | Select-Object TaskName,State
Get-Process -Name dota-notes-companion -ErrorAction SilentlyContinue
```

در ایران:

```bash
sudo -u postgres psql -X -d dota_notes -P pager=off -c "SELECT match_id,status,attempts,ended_at,run_after,deadline_at,error_code FROM match_observations ORDER BY ended_at DESC LIMIT 10;"
```

در آلمان:

```bash
sudo journalctl -u dota2notes-sync-daemon.service -u dota2notes-replay.service --since '15 minutes ago' --no-pager | tail -100
```

فایل `device.json`، token ها، env و لینک امضاشده دانلود را عمومی نفرست. برای عیب یابی، شناسه مچ و وضعیت ها کافی هستند.
اگر انتشار شکست خورد، به جای حذف داده ها سرویس مربوطه را متوقف نگه دار و خطا را بررسی کن. schema افزایشی است؛ برای برگشت کد، جدول یا ستون جدید را کورکورانه حذف نکن.
