# چیدمان جمع‌وجور، پنجرهٔ قابل‌تغییر و پارسر ریپلی

مبنا: آخرین `origin/main` تأییدشده، `773076b`، شاخهٔ تسک `fix/resizable-match-workspace`. لاگ واقعی VPS نیز همین نسخه را نشان داد. تغییرات این تسک هنوز توسط کاربر commit/deploy نشده‌اند.

## رفتار جدید

- max-width اصلی ۱۳۲۰px و سایدبار قبلی بازگشته‌اند. عرض پنجره به محتوای تمام‌عرض تحمیل نمی‌شود.
- جدول برای تمام ردیف‌ها و header یک تعریف مشترک ستون با gap ثابت ۲۰px دارد؛ hero/pos/result دیگر با gap کوچک قبلی فشرده نمی‌شوند. اندازهٔ hero ۶۴×۳۶، آیتم ۵۲×۳۶ و باف ۳۶×۳۶ است. شش آیتم با gap ۴px همیشه یک ردیف‌اند، فاصلهٔ گروه باف ۱۲px و gap داخلی باف ۶px است. عرض ستون آیتم از بیشترین تعداد باف صفحه محاسبه می‌شود؛ فضای بیشتری فقط به همان ستون تعلق دارد. اسکرول افقی مجاز است و ستونی حذف نمی‌شود.
- ترتیب ستون‌ها در هر دو زبان: Hero، Pos، W/L، KDA، IMP، Mode، Analysis، Duration، ID، Items، Details. header جدا از ناحیهٔ overflow بدنه به‌صورت عمودی sticky است؛ scrollLeft آن مستقیم با اسکرول افقی بدنه هماهنگ می‌شود، بدون React render در هر حرکت. font فارسی مود Vazir و ظاهر box آن هم‌سبک تحلیل است؛ مود طولانی wrap می‌شود.
- پیشرفت پردازش و خطا در بازدید جدید صفحه بسته‌اند. دکمهٔ خطا قرمز و با عنوان «خطا در آنالیز / Analysis failed» است. باز کردنش تحلیل را خودکار retry نمی‌کند؛ دکمهٔ جداگانهٔ تلاش مجدد داخل جزئیات وجود دارد. وقتی خود کاربر شروع/retry می‌زند، پیشرفت باز می‌شود. خطای برنامه‌نویسی به کاربر نمایش داده نمی‌شود.
- تنظیمات پنجره فقط کارت‌های نسبت 16:9، 16:10، 21:9، 4:3 و 3:2 دارد. resize و دکمهٔ native maximize فعال‌اند؛ گزینهٔ fullscreen نداریم. نسبت **ناحیهٔ محتوای پنجره** هنگام کشیدن لبه/گوشه در Windows با `WM_SIZING` حفظ می‌شود؛ قاب، عنوان، DPI و حداقل اندازه حساب شده‌اند. maximize همهٔ صفحه را استفاده می‌کند و از نسبت مستثناست.
- نصب handler روی UI thread انجام می‌شود؛ JS listener resize/move و چرخهٔ resize مجدد حذف شده است. startup/انتخاب، تنها command محدود `set_window_aspect_ratio` را صدا می‌زند. انتخاب موفق با کلید تازه ذخیره می‌شود و preset قدیمی resolution خوانده نمی‌شود. در مرورگر کارت‌ها غیرفعال‌اند؛ در native غیر Windows command خطای Settings می‌دهد و startup متوقف نمی‌شود.
- Rust dependency/Cargo.lock تغییر نکرده‌اند. permission فقط پنج نسبت را برای window main مجاز می‌کند. مجوزهای قبلی تغییر اندازه از JS حذف شده‌اند؛ export recovery codes هم در manifest فرمان‌های app ثبت شده است.

## تشخیص replay واقعی

دو مچ `9033813921` و `9034129766` spool کامل داشته‌اند؛ مشکل این دو دانلود ناقص نبوده است. آزمون مستقیم مچ اول نشان داد Clarity 4.0.1 هنگام entity parsing با `ArrayIndexOutOfBoundsException` در `ClientFrame.getEntity` شکست خورده. فایل اول Zstandard است، bzip2 نیست. لاگ OOM ارائه‌شده شاهدی بر کمبود RAM نداشت.

آزمایش جداگانه در VPS با OpenDota commit `e17d09ef40e63c387512057cef7250eebc96be96`، Clarity **4.0.3**، protobuf **6.3** و Java17، **ReplayInspector parse مچ 9033813921** را موفق تمام کرد. علت دقیق field در decoder ایزوله نشده؛ 4.0.1 از قبل تغییر ResourceId را داشت، آن را علت قطعی معرفی نکنید. هنوز موفقیت مچ دوم، Lane extraction، ذخیره و آرشیو واقعی با این نسخه تأیید نشده‌اند.

build-parser.sh همین ترکیب تأییدشده را pin می‌کند، revision و خروجی OpenDota را حفظ می‌کند و JitPack اختیاری را حذف می‌کند. JAR در Git یا ZIP نیست؛ باید جدا روی VPS ساخته شود. importer ابتدای exception را در لاگ محدود حفظ می‌کند و نتیجهٔ dry-run تعداد snapshotهای Lane را هم نشان می‌دهد. هویت ID صفر همچنان فقط با roster کامل تأیید می‌شود؛ برای عبور از خطا، اعتبارسنجی حذف نشده است.

## بررسی انجام‌شده و حدود آن

- ۴۱۲ تست ریشه (شامل ۷۲ دسکتاپ)، ۲۷۸ وب، ۴۰۱ API پاس شدند.
- typecheck تمام workspaceها، API build، release:prepare و Vite build موفق‌اند.
- چهار تست Rust geometry برای پنج نسبت، هشت جهت کشیدن، anchorها، DPI/frame/minimum و fit به فضای نمایشگر پاس شدند.
- ماژول geometry/Win32 با target ویندوز به metadata کامپایل شد؛ POM تبدیل‌شده با XML و نسخه‌های pinشده بررسی شد. این **link و installer کامل Tauri نیست**.
- WebView ویندوز، رفتار واقعی native/maximize، صفحه‌های با DPI متفاوت و بررسی تصویری sticky در این محیط اجرا نشده‌اند. نصب و تست زیر لازم است. build Next برای این تسک لازم نیست: سورس وب/dependency/schema/ENV/unit/Worker Cloudflare تغییر نکرده‌اند.

## سیستم شخصی

از ریشه، پیش از جایگزینی ZIP؛ اگر `git status` تغییر ثبت‌نشده نشان داد آن را بدون بررسی بازنویسی نکنید:

```powershell
git status -sb
git fetch origin
git switch main
git pull --ff-only origin main
git log -1 --oneline
git switch -c fix/resizable-match-workspace
```

فایل‌های ZIP را با مسیر خودشان روی ریشه copy/replace کنید. فایل نیازمند حذف نداریم. سپس:

```powershell
npm ci
npm run typecheck
npm run test -w @dota-notes/web
npx vitest run --maxWorkers=2 --testTimeout=15000
npm run test -w @dota-notes/api -- --maxWorkers=2 --testTimeout=15000
npm run api:build
npm run release:prepare -w @dota-notes/api
npm run desktop:installer
```

خروجی installer در `apps/desktop/src-tauri/target/release/bundle/nsis/` است. api build به‌تنهایی runtime release را تازه نمی‌کند؛ release:prepare لازم است. برای VPS انتقال dist دستی لازم نیست، سرور از main می‌سازد.

نسخهٔ نصبی را نصب و در fa/en این موارد را ببینید: فاصلهٔ یکسان ستون‌ها، شش آیتم یک‌ردیفی با باف، font فارسی مود، اسکرول افقی و هم‌راستایی header، sticky هنگام اسکرول عمودی، قرمز و بسته‌بودن خطای تحلیل در بازدید جدید، باز کردن بدون درخواست POST و retry با دکمهٔ خودش. نسبت‌های پنجره را انتخاب و از تمام لبه‌ها/گوشه‌ها resize کنید؛ maximize/restore ویندوز، بازگشایی برنامه و Scale/نمایشگر معمول خودتان را هم بررسی کنید.

پس از موفقیت تست‌ها:

```powershell
git add .
git commit -m "fix: restore compact match layout and resizable ratios; update replay decoder"
git push -u origin fix/resizable-match-workspace
git switch main
git pull --ff-only origin main
git merge --no-ff fix/resizable-match-workspace -m "Merge branch 'fix/resizable-match-workspace'"
git push origin main
```

tag برای این پچ ساخته نمی‌شود.

## استقرار VPS

checkout موجود `/var/www/dota2notes`، runtime `apps/api/release` و ENV `.env.production` ریشه‌اند. parser/spool خارج از Git هستند. در هر مرحله اگر command خطا داد ادامه ندهید و همان خروجی را بررسی کنید. `git status` باید تمیز و branch اصلی باشد؛ reset/clean یا apply کردن stash قدیمی لازم نیست.

```bash
cd /var/www/dota2notes
sudo -u dota2notes -H git status -sb
sudo -u dota2notes -H git log -1 --oneline
```

توقف کوتاه سرویس‌ها برای تعویض dependency/runtime:

```bash
sudo systemctl stop dota2notes-replay.timer dota2notes-sync-manual.timer dota2notes-opendota-parse.timer dota2notes-images.timer dota2notes-performance-reference.timer dota2notes-monitor.timer
sudo systemctl stop dota2notes-replay.service dota2notes-sync.service dota2notes-opendota-parse.service dota2notes-images.service dota2notes-performance-reference.service dota2notes-monitor.service
sudo systemctl stop dota2notes-api.service dota2notes.service
sudo -u dota2notes -H git fetch origin
sudo -u dota2notes -H git switch main
sudo -u dota2notes -H git pull --ff-only origin main
sudo -u dota2notes -H npm ci
sudo -u dota2notes -H npm run api:build
sudo -u dota2notes -H npm run release:prepare -w @dota-notes/api
sudo -u dota2notes -H npm ci --prefix apps/api/release --workspaces=false
```

migration/Next build لازم نیستند. API و وب را برگردانید؛ timerهای replay هنوز متوقف‌اند:

```bash
sudo systemctl start dota2notes-api.service dota2notes.service
curl --retry 5 --retry-connrefused --retry-delay 1 -fS http://127.0.0.1:4100/health/ready
```

Maven در همین VPS طی تست قبلی نصب شده است. نسخهٔ جدید را در مسیر جدا بسازید؛ فایل فعال هنوز جایگزین نمی‌شود:

```bash
mvn -version
sudo -u dota2notes -H bash apps/api/release/scripts/replay-parser/build-parser.sh /var/lib/dota2notes/parser/parser.clarity403.jar
```

آزمایش کامل importer بدون نوشتن در دیتابیس، روی **همان دو spool**:

```bash
sudo -u dota2notes -H env REPLAY_PARSER_JAR=/var/lib/dota2notes/parser/parser.clarity403.jar node --env-file=/var/www/dota2notes/.env.production apps/api/release/scripts/replay-parser/import-replay.mjs --match 9033813921 --file /var/lib/dota2notes/replays/incoming/.replay-d560e8ac-bcfa-4030-ad0c-9791404a9418.part --dry-run
sudo -u dota2notes -H env REPLAY_PARSER_JAR=/var/lib/dota2notes/parser/parser.clarity403.jar node --env-file=/var/www/dota2notes/.env.production apps/api/release/scripts/replay-parser/import-replay.mjs --match 9034129766 --file /var/lib/dota2notes/replays/incoming/.replay-12e2b7ab-b2ba-4e38-956d-2b8049ff2a80.part --dry-run
```

انتظار برای هر دو: `mode:"validated"`، `players:10`، `laneEventsAvailable:true` و `laneSnapshots:10`. اگر فایل دیگر موجود نبود یا یکی شکست خورد/هشدار `Lane events unavailable` داد، پارسر فعال را تعویض نکنید؛ خروجی همان تست را برای بررسی بفرستید. در این مسیر Zstandard خودکار تشخیص و باز می‌شود؛ فایل diagnostic دستی را جای spool نگذارید.

**فقط پس از موفقیت هر دو تست**، از نسخهٔ قبلی کپی نگه دارید و پارسر جدید را فعال کنید. cp -n نسخهٔ قبلی backup را بازنویسی نمی‌کند:

```bash
sudo -u dota2notes -H cp -n /var/lib/dota2notes/parser/parser.jar /var/lib/dota2notes/parser/parser.before-clarity403.jar
sudo install -m 0600 -o dota2notes -g dota2notes /var/lib/dota2notes/parser/parser.clarity403.jar /var/lib/dota2notes/parser/parser.jar
sudo install -m 0600 -o dota2notes -g dota2notes /var/lib/dota2notes/parser/parser.clarity403.jar.LICENSE /var/lib/dota2notes/parser/parser.jar.LICENSE
sudo -u dota2notes -H env DOTENV_CONFIG_PATH=/var/www/dota2notes/.env.production npm run preflight --prefix apps/api/release --workspaces=false -- --check-db
sudo -u dota2notes -H env DOTENV_CONFIG_PATH=/var/www/dota2notes/.env.production npm run preflight --prefix apps/api/release --workspaces=false -- --role=replay
```

برای تلاش واقعی همان دو مچ، به‌جای تغییر دستی SQL از enqueue موجود استفاده کنید (یا در اپ هر کدام را retry کنید؛ هر دو راه همزمان لازم نیست):

```bash
sudo -u dota2notes -H node --env-file=/var/www/dota2notes/.env.production apps/api/release/scripts/replay-parser/run-queue.mjs --enqueue 9033813921
sudo -u dota2notes -H node --env-file=/var/www/dota2notes/.env.production apps/api/release/scripts/replay-parser/run-queue.mjs --enqueue 9034129766
sudo systemctl start dota2notes-replay.timer dota2notes-sync-manual.timer dota2notes-opendota-parse.timer dota2notes-images.timer dota2notes-performance-reference.timer dota2notes-monitor.timer
curl -fS https://api.dota2notes.ir/health/live
sudo systemctl status dota2notes-api.service dota2notes.service --no-pager -l
sudo systemctl list-timers --all --no-pager 'dota2notes-*'
```

worker هر نوبت یک مچ می‌گیرد؛ نتیجه فوری برای هر دو تضمین نمی‌شود. پس از اجرا وضعیت و لاگ را ببینید:

```bash
sudo -u postgres psql -d dota_notes -P pager=off -c \
"SELECT j.match_id, j.status, j.phase, j.attempts, j.error_code, j.archive_status,
        (d.local_replay_data IS NOT NULL) AS replay_parsed
 FROM local_replay_jobs j JOIN dota_matches d USING (match_id)
 WHERE j.match_id IN (9033813921,9034129766)
 ORDER BY j.match_id;"
sudo journalctl -u dota2notes-replay.service --since "15 minutes ago" --no-pager -o cat
```

هدف نهایی `status=completed`، `archive_status=active` و `replay_parsed=true` است؛ سپس در اپ IMP/پوزیشن و جزئیات تحلیل را بررسی کنید. parse موفق یک dry-run جای این تأیید نهایی DB/archive را نمی‌گیرد. readiness عمومی عمداً 404 است؛ readiness را محلی و live را عمومی تست کنید.
