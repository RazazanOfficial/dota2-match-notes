# استقرار عادی: Windows، ایران، آلمان

مرجع جاری برای آپدیت نصب موجود دو VPS است. [معماری](two-vps-architecture.fa.md) و [فهرست سرویس ها](environment-and-services.fa.md) پیش نیازند.
در انتشار تغییر Services، نصب collector با نقش درست روی هر دو میزبان و بازنشستگی unitهای قدیمی مطابق [مانیتور](service-monitoring.md) نیز لازم است؛ این عملیات با build انجام نمی‌شوند.
مهاجرت اولیه، ساخت تونل و انتقال دیتابیس کار هر انتشار نیستند.
نسخه تاریخی [استقرار تک VPS](history/deployment-single-vps.md) برای نصب فعلی اجرا نشود.

## ۱. نوع تغییر را مشخص کن

| تغییر | اقدام |
| --- | --- |
| فقط Markdown | بررسی لینک و diff، commit و merge؛ بدون بیلد، migration یا restart |
| دسکتاپ بدون تغییر API/assets | بررسی و ساخت نصاب؛ نیاز به استقرار worker ندارد |
| assets | manifest و نصاب هماهنگ؛ انتشار objectها در ایران پیش از نصب |
| API، worker، schema یا dependency | مراحل دو VPS این سند |
| وب یا dependency مشترک وب | علاوه بر API، ساخت Next در ایران |
| unit، drop-in، Nginx، parser JAR یا env | بررسی جدا و اعمال صریح همان تغییر؛ صرف pull تنظیم فعال را عوض نمی کند |

در تغییر ترکیبی، API و assets سازگار قبل از نصب کلاینت منتشر شوند.
بیلد موفق به معنی موفقیت نصب یا سرویس خارجی نیست.

## ۲. ویندوز: pull، شاخه و Copy/Replace

PowerShell را در checkout موجود خودت باز کن. مسیر شناخته شده سیستم فعلی `D:\personal\projects\dota2-match-notes` است؛ اگر محل ریپو فرق دارد فقط مسیر را اصلاح کن.
قبل از switch، تغییر محلی باید تعیین تکلیف شود؛ reset یا پاکسازی خودکار انجام نده.
برای بسته مستندات این نوبت:

```powershell
Set-Location "D:\personal\projects\dota2-match-notes"
git status -sb
git switch main
git pull --ff-only origin main
$DotaBranch = "chore/documentation-refresh"
git switch -c $DotaBranch
```

نام شاخه در انتشار بعدی متناسب با همان کار و یکتا باشد؛ الگو `fix/<topic>`، `feat/<topic>` یا `chore/<topic>` است و پیشوند `codex/` استفاده نمی شود.
عبارت هایی مانند `fix: prepare direct replay transport` پیام commit هستند؛ `:` و فاصله در نام branch معتبر نیستند.
ZIP را بیرون checkout باز و فایل های آن را با مسیر نسبی Copy/Replace کن. `.git`، env، node_modules و خروجی target/dist از بسته منتقل نشوند.

### بررسی برای انتشار دارای تغییر کد

Node 24، npm 11، Rust stable، ابزار MSVC و پیش نیازهای Tauri لازم اند.
هر خطای نصب یا تست قبل از ادامه برطرف شود. روی ویندوز این بلوک در اولین شکست می ایستد:

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
    Write-Host "Running: $DotaCheck"
    & cmd.exe /d /c $DotaCheck
    if ($LASTEXITCODE -ne 0) { throw "Stopped: $DotaCheck" }
}
```

برای تغییر وب، `npm test` و `npm run build` هم موفق شوند.
`prepare-native.mjs` باید پیش از تست کامل Tauri اجرا شود تا executable مورد نیاز Companion وجود داشته باشد.
برای تغییر صرفا مستندات، این بیلدها تکرار نمی شوند؛ لینک ها و `git diff --check` کافی اند.

### commit، push و merge توسط MeriJ

MeriJ این سه عملیات را شخصاً با author/committer و حساب GitHub خودش اجرا می کند؛ عامل فقط تغییرات را آماده و بررسی می کند و دستورها را تحویل می دهد.
پیش از ارسال، هویت موثر، remote مقصد و حساب احراز هویت شده بررسی شوند؛ تنظیم global و تاریخچه برای تغییر هویت بازنویسی نشوند.
فرمان stage زیر مخصوص همین بستهٔ مستندات است؛ برای تغییر کد فقط فایل ها و hunkهای تأییدشدهٔ همان تسک stage شوند.

```powershell
git diff --check
git diff --stat
git status --short
git add -- README.md docs apps/web/README.md apps/web/docs apps/desktop/public/tutorials/README.md AGENTS.md .codex/agents .agent-work/.gitignore
git diff --cached --stat
git diff --cached
git commit -m "docs: refresh two-VPS and desktop documentation"
git show --no-patch --format=fuller HEAD
git push -u origin $DotaBranch
git switch main
git pull --ff-only origin main
git merge --no-ff $DotaBranch
git push origin main
git log -1 --format="%H%n%s"
```

برای انتشار کد، پیام commit متناسب با همان قابلیت باشد.
SHA نهایی را یادداشت کن؛ دو سرور باید همان نسخه هدف را بگیرند.
**اگر تغییر فقط مستندات است، مراحل عملیاتی زیر لازم نیستند.**

## ۳. پیش بررسی دو سرور

روی هر دو VPS، وضعیت checkout و نسخه ابزار را ببین:

```bash
sudo -u dota2notes -H git --no-pager -C /var/www/dota2notes status -sb
sudo -u dota2notes -H git --no-pager -C /var/www/dota2notes log -1 --format='%H%n%s'
node --version
npm --version
```

در صورت تغییر tracked محلی یا شکست فرمان، ادامه نده. `safe.directory` جای اجرای Git با کاربر مالک را نمی گیرد.
از DB ایران با روال پشتیبان گیری موجود snapshot خصوصی داشته باش؛ dump وارد Git یا storage عمومی نشود.
DB اصلی `dota_notes` ایران است. dump قدیمی آلمان را روی آن restore نکن.

## ۴. آلمان: توقف پردازش برای پنجره آپدیت

بلوک ها در نشست معمول SSH و به ترتیب اجرا می شوند. `--no-pager` از انتظار صفحه Git جلوگیری می کند.
لینک SSH باید فعال بماند؛ Nginx، PostgreSQL و SSH را متوقف نکن.

```bash
sudo bash <<'BASH'
set -euo pipefail
systemctl is-active dota2notes-link.service
systemctl stop dota2notes-images.timer dota2notes-monitor.timer
systemctl stop dota2notes-replay.service dota2notes-sync-daemon.service
systemctl stop dota2notes-images.service dota2notes-monitor.service
systemctl stop dota2notes-api.service
BASH
```

اگر مرجع آماری در انتشار دیگری عمدا فعال شده، وضعیت قبلی آن ثبت و پیش از تغییر runtime service/timer همان مرجع نیز متوقف شود؛ در پایان فقط همان وضعیت برگردد.
در نصب فعلی، timer مرجع خاموش می ماند.

## ۵. ایران: دریافت، ساخت، assets و migration

```bash
sudo bash <<'BASH'
set -euo pipefail
systemctl stop dota2notes-api.service dota2notes.service
sudo -u dota2notes -H git --no-pager -C /var/www/dota2notes pull --ff-only origin main
cd /var/www/dota2notes
sudo -u dota2notes -H git --no-pager log -1 --format='%H%n%s'
sudo -u dota2notes -H npm ci
sudo -u dota2notes -H npm run desktop:assets:publish
sudo -u dota2notes -H git --no-pager diff --exit-code -- apps/desktop/asset-manifest.json
sudo -u dota2notes -H npm run api:build
sudo -u dota2notes -H npm run release:prepare -w @dota-notes/api
sudo -u dota2notes -H npm ci --prefix apps/api/release --workspaces=false
sudo -u dota2notes -H env \
  DOTENV_CONFIG_PATH=/var/www/dota2notes/.env.production \
  node apps/api/release/dist/migrate.js
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d dota_notes <<'SQL'
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE sync_history_cache, companion_devices, match_observations
TO dota_notes_compute;
SQL
sudo -u dota2notes -H env \
  DOTENV_CONFIG_PATH=/var/www/dota2notes/.env.production \
  node apps/api/release/dist/preflight.js --role=api --check-db
BASH
```

grant بالا برای جدول های قابلیت فعلی است؛ migration آینده اگر جدول جدیدی برای worker دارد، مجوز همان جدول نیز باید اضافه شود.
اگر manifest پس از publish تغییر کرد، قبل از ادامه اختلاف بایت ها و line ending را حل کن؛ manifest سرور و نصاب نباید مستقل بازسازی و ناسازگار شوند.
انتشار assets باید قبل از `release:prepare` باشد؛ این فرمان پوشه public را به runtime کپی می کند.

اگر سورس یا dependency وب تغییر کرده، قبل از شروع Next:

```bash
cd /var/www/dota2notes
sudo -u dota2notes -H npm run build
```

بعد از موفقیت مراحل مربوط:

```bash
sudo nginx -t
sudo systemctl start dota2notes-api.service dota2notes.service
curl -fsS --max-time 10 http://127.0.0.1:4100/health/ready
```

این مراحل config فعال HTTPS را با template HTTP ریپو جایگزین نمی کنند.
assets از API سرو می شوند؛ alias مستقیم Nginx اختیاری است و به ادغام کنترل شده در server فعال HTTPS نیاز دارد.

## ۶. آلمان: ساخت و شروع سرویس ها

env موجود باید نقش compute، DB ایران و تنظیم scheduled sync تایید شده را داشته باشد؛ [جدول تنظیمات](environment-and-services.fa.md) را ببین.
آپدیت عادی env را از نو نمی سازد. migration روی آلمان اجرا نمی شود.

```bash
sudo bash <<'BASH'
set -euo pipefail
systemctl is-active dota2notes-link.service
sudo -u dota2notes -H git --no-pager -C /var/www/dota2notes pull --ff-only origin main
cd /var/www/dota2notes
sudo -u dota2notes -H git --no-pager log -1 --format='%H%n%s'
sudo -u dota2notes -H npm ci
sudo -u dota2notes -H npm run api:build
sudo -u dota2notes -H npm run release:prepare -w @dota-notes/api
sudo -u dota2notes -H npm ci --prefix apps/api/release --workspaces=false
sudo -u dota2notes -H env \
  DOTENV_CONFIG_PATH=/var/www/dota2notes/.env.production \
  node apps/api/release/dist/preflight.js --role=api --check-db
sudo -u dota2notes -H env \
  DOTENV_CONFIG_PATH=/var/www/dota2notes/.env.production \
  node apps/api/release/dist/preflight.js --role=replay --check-db
systemctl start dota2notes-api.service
systemctl start dota2notes-replay.service dota2notes-sync-daemon.service
systemctl start dota2notes-images.timer dota2notes-monitor.timer
systemctl is-active \
  dota2notes-link.service dota2notes-api.service \
  dota2notes-replay.service dota2notes-sync-daemon.service \
  dota2notes-images.timer dota2notes-monitor.timer
BASH
```

چاپ شش `active` فقط وضعیت unitهای این مرحله را نشان می دهد؛ تست زنده provider و کلاینت جداست.
آلمان به Next build، نصب assets عمومی یا دیتابیس محلی دوم نیاز ندارد.

## ۷. پذیرش پیش از نصب کلاینت

در PowerShell ویندوز از ریشه همان ریپو:

```powershell
Clear-DnsClientCache
Resolve-DnsName api.dota2notes.ir -Type A
curl.exe -4 --noproxy "*" -fsS --connect-timeout 5 --max-time 15 https://api.dota2notes.ir/health/live
$DotaManifest = Get-Content .\apps\desktop\asset-manifest.json -Raw | ConvertFrom-Json
$DotaAssetObject = $DotaManifest.files[0].object
curl.exe -4 --noproxy "*" -fSI --connect-timeout 5 --max-time 20 "https://api.dota2notes.ir/desktop-assets/objects/$DotaAssetObject"
```

API باید پاسخ موفق بدهد، DNS نصب فعلی ایران باشد و object نصاب در دسترس باشد.
readiness عمومی باید توسط Nginx مخفی بماند. route خصوصی بدون احراز هویت قابل استفاده نباشد؛ ماتریس [پذیرش](acceptance-tests.fa.md) را ببین.
نصاب جدید سپس نصب و تست شود؛ حذف کامل cache برای هر آپدیت لازم نیست.

## ۸. قطع نشست، خطا و برگشت نسخه

اگر MobaXterm قطع شد، اسکریپت را کورکورانه دوباره اجرا نکن.
در اتصال جدید، وضعیت processها و سرویس ها را طبق [عیب یابی](troubleshooting.fa.md) بخوان و از اولین مرحله ناتمام ادامه بده.
متن قدیمی پنجره اثبات فعال بودن فرمان نیست.

در شکست build یا preflight، سرویس مربوط را خاموش نگه دار و همان خطا را رفع کن؛ DB یا env را برای عبور از خطا حذف نکن.
پیش از شروع، SHA قبلی و وضعیت unitها ثبت شده باشند. برگشت کد باید با schema موجود سازگار باشد و runtime دوباره ساخته شود.
migration افزایشی `0031` نیاز به حذف جدول برای برگشت کد ندارد؛ سازگاری نسخه هدف جدا بررسی شود.
DNS به آلمان راه rollback عادی نیست، چون نویسنده و دیتابیس اصلی ایران اند.
restore دیتابیس فقط با توقف writerها و پذیرش صریح از دست رفتن نوشتن های بعد از snapshot انجام شود.
