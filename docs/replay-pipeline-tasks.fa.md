# صف موازی ریپلی و فعالیت‌های سراسری — ۲۳ اکتبر ۲۰۲۶

مبنا آخرین `origin/main` با commit `df6edb2` و branch تسک `feat/replay-pipeline-tasks` است. Git push و استقرار واقعی توسط دستیار انجام نشده‌اند.

## رفتار جدید

- daemon دائمی: دو دریافت هم‌زمان، یک parser Java و یک مسیر آرشیو. همان قفل advisory قبلی مانع اجرای هم‌زمان orchestrator دوم یا Worker قدیمی می‌شود. CPUQuota100% و MemoryMax2100M حفظ شده‌اند.
- آرشیو در `replay_archive_jobs` lease و retry مستقل دارد؛ شکست آن تحلیل کامل‌شده را pending نمی‌کند. قطعی آرشیو circuit مشترک ده‌دقیقه‌ای دارد و foreground را اشغال نمی‌کند.
- فایل کامل محلی با auth، مالکیت/مجوز خصوصی، NOFOLLOW و SHA-256 از همان descriptor بازشده تحویل می‌شود. فایل آرشیو fallback است. GET وضعیت هر بار HEAD آرشیو نمی‌زند.
- وضعیت `awaiting_parse` یعنی فایل آماده است و Java فعلاً مچ دیگری را تحلیل می‌کند. پس از آزادشدن lane، کار بعدی بدون انتظار tick timer آغاز می‌شود.
- نوبت‌دهی بر اساس آخرین خدمت به کاربر و سپس زمان درخواست است؛ Match مشترک همچنان یک job دارد. جای صف تقریبی است؛ ورود درخواست جدید می‌تواند آن را تغییر دهد. میانگین زمان parse فقط با سه نمونهٔ واقعی هفتهٔ اخیر محاسبه می‌شود؛ زمان شبکه یا retry جعل نمی‌شود.
- دو دریافت، فضای بدترین حالت را زیر قفل تراکنش رزرو می‌کنند. سقف پیش‌فرض spool دو GiB و حداقل فضای آزاد دو GiB است. `LOCAL_REPLAY_SPOOL_CAP_MIB` اختیاری است. کمبود فضا باعث backpressure می‌شود، نه حذف فایل آرشیونشده.
- heartbeat که دو دقیقه stale شود بازیابی می‌شود؛ کار parse به صف Java و کار دریافت به صف prepare برمی‌گردد. CAS lease جلوی ثبت نتیجهٔ Worker قدیمی را می‌گیرد. queryهای heartbeat و progress روی هر اتصال pg سری می‌شوند.
- اگر upload موفق شود ولی HEAD نهایی شکست بخورد، retry ابتدا همان object را بررسی می‌کند؛ آپلود مجدد بی‌دلیل انجام نمی‌شود. زیرمرحلهٔ خطای ذخیره‌سازی در log ثبت می‌شود. **اتصال واقعی S3/ParsPack هنوز روی VPS تأیید نشده است**؛ موفقیت تست mock به معنای رفع قطعی شبکه نیست.
- TaskManager بیرون از صفحه‌ها و در عمر حساب فعال است. تحلیل و دانلود دو نشانگر مستقل، hover، پنل جزئیات و اعلان تکمیل دارند. sync صفحه از feed مشترک استفاده می‌کند. poll هنگام کار سه ثانیه و در حالت عادی پانزده ثانیه است.
- دانلودهای پذیرفته‌شده به تفکیک حساب، بدون ذخیرهٔ bearer، نگه‌داری می‌شوند. تغییر صفحه دانلود را متوقف نمی‌کند. Ctrl+R انتقال Rust را دوباره اجرا نمی‌کند؛ قفل native از هم‌زمانی جلوگیری می‌کند و فایل کامل موجود دوباره دریافت نمی‌شود. بستن کل برنامه انتقال ناقص محلی را متوقف می‌کند؛ اجرای بعدی از فایل آمادهٔ سرور دوباره دریافت می‌کند؛ resume بایتی محلی پیاده نشده است.
- درصد از بایت‌های HTTP ورودی محاسبه می‌شود، نه حجم DEM بازشده. آماده‌سازی سرور، انتقال و آماده‌سازی نهایی فایل در UI تفکیک می‌شوند؛ سرعت و ETA با دادهٔ واقعی نمایش داده می‌شوند.
- فرمول score، Lane Efficiency، بررسی هویت ریپلی، دادهٔ مرجع STRATZ، JAR و کد وب تغییر نکرده‌اند. Parse خارجی OpenDota دوباره وارد مسیر تحلیل نشده است.

## سیستم Windows؛ قبل از copy/replace

اگر status تغییرات قبلی نشان داد ابتدا آن‌ها را حفظ/commit کنید؛ reset یا clean نزنید.

```bash
git status -sb
git fetch origin
git switch main
git pull --ff-only origin main
git log -1 --oneline
git switch -c feat/replay-pipeline-tasks
```

فایل‌های ZIP را در ریشهٔ پروژه copy/replace کنید. حذف دستی نداریم. سپس:

```bash
npm ci
npm test
npm run test -w @dota-notes/api
npm run typecheck
npm run api:build
npm run release:prepare -w @dota-notes/api
npm run desktop:build
npm run desktop:installer
```

نصاب Windows، Java روی ریپلی واقعی و شبکهٔ VPS باید در محیط واقعی بررسی شوند؛ Cargo در محیط دستیار در دسترس نیست.

## Commit، push و merge

```bash
git status --short
git add .
git commit -m "feat: pipeline replay processing and persist desktop tasks"
git -c http.version=HTTP/1.1 push -u origin feat/replay-pipeline-tasks
git switch main
git pull --ff-only origin main
git merge --no-ff feat/replay-pipeline-tasks -m "Merge branch 'feat/replay-pipeline-tasks'"
git -c http.version=HTTP/1.1 push origin main
git status -sb
```

Tag خودکار نداریم.

## VPS پس از push main

اگر هر دستور خطا داد همان‌جا متوقف شوید. تغییر محلی حل‌نشدهٔ Git را حفظ کنید. ابتدا timerهای فعال را ببینید و در پایان فقط timerهای قبلاً فعال را بازگردانید؛ replay timer استثناست و باید خاموش بماند. هیچ فایل incoming یا سرویس دیگری در این استقرار پاک نمی‌شود.

```bash
cd /var/www/dota2notes
sudo -u dota2notes -H git status -sb
sudo -u dota2notes -H git fetch origin
sudo systemctl list-timers --all --no-pager 'dota2notes-*'
sudo install -d -m 0700 -o postgres -g postgres /var/backups/dota2notes
sudo -u postgres pg_dump -Fc -f /var/backups/dota2notes/replay-pipeline-before-migration-$(date -u +%Y%m%dT%H%M%SZ).dump dota_notes
sudo systemctl disable --now dota2notes-replay.timer dota2notes-opendota-parse.timer
sudo systemctl stop dota2notes-sync-manual.timer dota2notes-images.timer dota2notes-performance-reference.timer dota2notes-monitor.timer
sudo systemctl stop dota2notes-replay.service dota2notes-sync.service dota2notes-opendota-parse.service dota2notes-images.service dota2notes-performance-reference.service dota2notes-monitor.service
sudo systemctl stop dota2notes-api.service dota2notes.service
sudo -u dota2notes -H git switch main
sudo -u dota2notes -H git pull --ff-only origin main
sudo -u dota2notes -H git log -1 --oneline
sudo -u dota2notes -H npm ci
sudo -u dota2notes -H npm run api:build
sudo -u dota2notes -H npm run release:prepare -w @dota-notes/api
sudo -u dota2notes -H npm ci --prefix apps/api/release --workspaces=false
sudo -u dota2notes -H env DOTENV_CONFIG_PATH=/var/www/dota2notes/.env.production npm run db:migrate --prefix apps/api/release --workspaces=false
sudo -u dota2notes -H env DOTENV_CONFIG_PATH=/var/www/dota2notes/.env.production npm run preflight --prefix apps/api/release --workspaces=false -- --check-db
sudo -u dota2notes -H env DOTENV_CONFIG_PATH=/var/www/dota2notes/.env.production npm run preflight --prefix apps/api/release --workspaces=false -- --role=replay
sudo install -m 0644 deploy/systemd/dota2notes-replay.service /etc/systemd/system/dota2notes-replay.service
sudo systemctl daemon-reload
sudo systemctl start dota2notes-api.service dota2notes.service
curl --retry 5 --retry-connrefused --retry-delay 1 -fS http://127.0.0.1:4100/health/ready
curl -fS https://api.dota2notes.ir/health/live
sudo systemctl enable --now dota2notes-replay.service
sudo systemctl start dota2notes-sync-manual.timer dota2notes-images.timer dota2notes-performance-reference.timer dota2notes-monitor.timer
sudo systemctl status dota2notes-replay.service --no-pager -l
sudo journalctl -u dota2notes-replay.service --since "5 minutes ago" --no-pager -o cat | tail -80
```

Migration `0030_replay_pipeline` جدول/ستون اضافه می‌کند و retryهای قدیمی آرشیو را برای اعتبارسنجی checkpoint به صف برمی‌گرداند؛ نتیجهٔ تحلیل و فایل‌ها حذف نمی‌شوند. ENV جدید اجباری نداریم؛ `LOCAL_REPLAY_WORKER_ENABLED=true` و تنظیمات موجود parser/proxy/storage حفظ شوند. JAR، Cloudflare Worker، nginx و Next source تغییر نکرده‌اند؛ Next build لازم نیست. service ریپلی باید دائماً active باشد؛ timer آن را start نکنید. readiness عمومی nginx عمداً 404 است؛ تست readiness محلی است.

## تست واقعی پس از استقرار

نصاب جدید را نصب کنید. چند مچ را درخواست تحلیل بدهید؛ دریافت‌ها می‌توانند هم‌پوشانی داشته باشند و Java تک‌نفره می‌ماند. ریپلی دارای فایل کامل محلی، مثل `9057632410` در صورت باقی‌بودن فایل، باید بدون انتظار برای آرشیو وارد انتقال شود. هنگام دانلود به صفحهٔ دیگری بروید؛ نشانگر و درصد باقی بمانند. پس از تکمیل تحلیل/دانلود/دریافت مچ، اعلان و دادهٔ تازهٔ تاریخچه را بررسی کنید.

گزارش یکجا، بدون token یا raw response:

```bash
sudo -u postgres psql -d dota_notes -P pager=off -c \
"SELECT j.match_id,j.intent,j.status,j.phase,j.attempts,j.spool_complete,j.reserved_bytes,j.archive_status,a.status AS archive_job,a.attempts AS archive_attempts,a.error_code AS archive_error FROM local_replay_jobs j LEFT JOIN replay_archive_jobs a USING(match_id) ORDER BY j.updated_at DESC LIMIT 20;"
sudo journalctl -u dota2notes-replay.service --since "15 minutes ago" --no-pager -o cat | tail -120
free -m
df -h /var/lib/dota2notes/replays
```

## پیگیری بعدی: incoming و فضای VPS

اتمام مرحلهٔ پنجم الزاماً موفقیت آرشیو نیست. لاگ قبلی چند فایل کامل آرشیونشده داشت؛ بنابراین ۷۰۰ MiB الزاماً فایل زائد نیست. daemon این تحویل **پاک‌سازی خودکار ندارد**. در قطعی طولانی آرشیو، پرشدن سقف باعث توقف موقت دریافت جدید می‌شود؛ داده حذف نمی‌شود.

پس از تست این پچ، فایل‌های incoming باید با DB و HEAD موفق آرشیو تطبیق داده شوند؛ سپس orphanها و diagnosticهای قدیمی جدا بررسی شوند. **TeamSpeak و فایل‌ها و سرویس آن دست‌نخورده بمانند. هیچ پاک‌سازی عمومی VPS، volume، cache سرویس‌های دیگر یا reset/clean مخزن انجام نشود.** این بررسی و پاک‌سازی هنوز انجام نشده است.
