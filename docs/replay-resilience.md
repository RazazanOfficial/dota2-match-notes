# پچ پایداری دانلود Replay — راهنمای کامل

> این سند تحویل پچ تاریخی است. برای وضعیت کنونی و روش Git،
> [handoff](HANDOFF.md) و [روال انتشار](deployment-ubuntu.md)
> را بخوانید. دستورهای merge و استقرار همین سند را برای پچ‌های تازه تکرار نکنید.
> مهلت ۲۴ساعتهٔ صف در متن اولیهٔ این پچ با مهلت ۲۰روزهٔ درخواست تازه در
> [بازیابی metadata](replay-metadata-recovery.md) جایگزین شده است.

مبنای پچ: `aaecc22298c5c72c2d35897a0b9aaeafafe3b70b` از main.
برنچ پیشنهادی: `fix/replay-resilience`.
این پچ فرمول Score و Lane Efficiency را عوض نمی‌کند. فایل قابل حذف دستی ندارد.

## چه تغییری می‌کند؟

| اتفاق | رفتار جدید |
|---|---|
| Replay در ParsPack موجود است | ابتدا وجود فایل بررسی می‌شود؛ دانلود دوباره از Valve انجام نمی‌شود. |
| ParsPack موقتاً جواب نمی‌دهد | فایل به اشتباه deleted/missing نمی‌شود؛ درخواست دوباره تلاش می‌کند. فقط پاسخ واقعی 404 به معنی نبودن فایل است. |
| یکی از IPهای relay قطع است | IP بعدی خودکار امتحان می‌شود؛ hostname و اعتبارسنجی TLS حفظ می‌شود. |
| آدرس relay دوم تنظیم شده | مسیرهای آدرس‌های مختلف به نوبت امتحان می‌شوند. آدرس دوم باید واقعاً به Worker متصل و دارای همان token باشد. |
| دانلود وسط کار قطع شد | اگر strong ETag و اندازه معتبر داریم، از همان نقطه ادامه می‌دهد؛ اگر هویت فایل قابل اثبات نباشد از ابتدا می‌گیرد. |
| فایل کامل است ولی آپلود شکست خورد | فایل خصوصی موقت نگه داشته می‌شود؛ دفعه بعد دوباره دانلود نمی‌شود. تحلیل موفق ثبت‌شده نیز تکرار نمی‌شود. |
| کاربر چندبار درخواست می‌دهد | یک Job برای هر Match باقی می‌ماند؛ درخواست فعال deadline تازه نمی‌گیرد. |
| خطا ادامه دارد | فاصله retry بیشتر می‌شود؛ درخواست تازه تا `retry_deadline_at` (۲۰ روز) فرصت دارد و پس از انقضا به `failed` می‌رود. |
| کاربر فقط دانلود می‌خواهد | Parse انجام نمی‌شود؛ فقط دریافت و ذخیره در ParsPack. |
| کاربر تحلیل می‌خواهد | دریافت، Parse، آپلود و پاک‌کردن فایل موقت پس از موفقیت. |

این روش به خرید سرور نیاز ندارد، اما تضمین «هیچ‌وقت قطع نمی‌شود» ندارد. همه IPهای یک Cloudflare Worker هنوز به یک ارائه‌دهنده وابسته‌اند. اگر تمام مسیرها قطع باشند، یا Replay دیگر از Valve قابل دریافت نباشد و در آرشیو هم نباشد، کد نمی‌تواند فایل را ایجاد کند. خطا و زمان تلاش بعدی روشن نمایش داده می‌شوند.

نام incoming در مسیر دیسک فقط برای سازگاری تنظیمات قبلی باقی مانده؛ مسیر آپلود دستی جدید یا ورودی کاربر اضافه نشده است. دانلود خودکار مچ‌های ژورنال نیز اضافه نشده است.

## محدودیت‌های مشخص

- یک Worker فعال با قفل سراسری PostgreSQL؛ هر اجرا یک مچ.
- هر اجرا حداکثر ۳ تلاش اتصال/دانلود؛ مسیرهای موقتاً خراب cooldown می‌گیرند.
- timeout اتصال: ۸ ثانیه؛ دریافت header: ۲۰ ثانیه؛ سکوت وسط انتقال: ۴۵ ثانیه؛ کل یک انتقال: ۳۰۰ ثانیه.
- retry: حدود ۱، ۲، ۵، ۱۰، ۲۰ و سپس ۳۰ دقیقه، با حداکثر ۱۰٪ پراکندگی؛ Retry-After نیز رعایت می‌شود.
- ۳ خطای نزدیک روی یک مسیر: توقف موقت آن مسیر از ۱۲۰ تا حداکثر ۶۰۰ ثانیه.
- حداکثر فایل: ۲۰۰ MiB؛ سقف فایل‌های موقت مدیریت‌شده: ۱ GiB؛ حداقل فضای آزاد محفوظ: ۲ GiB.
- فایل موقت شکست‌خورده: حداکثر حدود ۲۴ ساعت تا پاک‌سازی در اجرای بعدی Worker. فایل‌های قدیمی دستی `.dem` پاک نمی‌شوند.
- نگهداری eventها: ۳۰ روز؛ سابقه مسیر بدون تغییر: ۷ روز.
- درصد فقط برای دانلود با اندازه مشخص؛ برای Parse درصد ساختگی نمایش داده نمی‌شود.
- شمارنده‌های انتقال داخل اپ هستند و جای صورت‌حساب مصرف VPS را نمی‌گیرند.

## دیتابیس

Migration جدید `0022_replay_resilience.sql` افزایشی است و جدول ماهانه یا داده تحلیل قبلی را حذف نمی‌کند.

| محل | داده‌های اضافه‌شده |
|---|---|
| `local_replay_jobs` | مرحله، heartbeat، deadline، بایت دانلود/آپلود، سرعت، مسیر اخیر و مشخصات فایل موقت/ETag/SHA256 |
| `replay_transport_routes` | نتیجه اتصال به هر endpoint/IP، تعداد خطا و پایان cooldown |
| `replay_job_events` | رویدادهای مرحله‌ای هر مچ، کد خطا، مسیر و HTTP status |

## ۱. قرار دادن پچ روی ویندوز

از ریشه پروژه در PowerShell اجرا کنید. اگر `git status --short` تغییرات دیگری دارد ابتدا آن‌ها را نگه دارید/commit کنید؛ Discard لازم نیست.

```powershell
git status --short
git switch main
git pull --ff-only origin main
git switch -c fix/replay-resilience
```

محتوای ZIP را روی ریشه پروژه کپی و Replace کنید، نه داخل یک فولدر اضافه. سپس:

```powershell
npm ci
npm test
npm run typecheck
npm run dev
```

صفحه تست ظاهری بدون API و دیتابیس:

`http://localhost:3000/dev/mock/replay-resilience`

دکمه‌های صفحه حالت دانلود، Retry، Parse، آپلود و تکمیل را نشان می‌دهند. در Admin نیز بخش مانیتور Replay تا زمانی که بازش نکنید درخواست دریافت وضعیت نمی‌فرستد؛ با مخفی‌شدن صفحه polling متوقف می‌شود. این آدرس در production همچنان 404 است.

## ۲. آپدیت Worker کلادفلر

از **ریشه پروژه** در PowerShell:

```powershell
Push-Location deploy/cloudflare/replay-proxy
npm exec --yes --package=wrangler@4.140.0 -- wrangler deploy
Pop-Location
```

اگر login لازم شد، داخل همان فولدر Worker:

```powershell
npm exec --yes --package=wrangler@4.140.0 -- wrangler login --device --browser=false
```

سپس deploy را تکرار کنید. Worker همان نام و آدرس قبلی را دارد. **Token قبلی را عوض نکنید**؛ deploy معمولی secret قبلی را نگه می‌دارد. نسخه جدید Worker با client قبلی سازگار است؛ اول Worker، بعد VPS.

## ۳. Commit و انتقال به main

بعد از بررسی فایل‌ها و موفقیت تست:

```powershell
git status --short
git add README.md app components deploy docs drizzle lib scripts tests package.json package-lock.json
git diff --cached --stat
git commit -m "fix: make replay downloads resilient with failover and progress"
git push -u origin fix/replay-resilience
git switch main
git pull --ff-only origin main
git merge --no-ff fix/replay-resilience -m "Merge branch 'fix/replay-resilience'"
git push origin main
```

برای این پچ tag اجباری نیست. این بلوک نمونهٔ تاریخی است؛ نام branch و وضعیت
checkout هر انتشار تازه باید جداگانه بررسی شود.

## ۴. استقرار VPS: توقف، بکاپ، نصب و Build

این قسمت downtime کوتاه دارد. در ترمینال root VPS اجرا کنید. بلوک با اولین خطا متوقف می‌شود؛ اگر شکست خورد سرویس‌ها را کورکورانه روشن نکنید و همان خطا را بررسی کنید.

ابتدا:

```bash
cd /var/www/dota2notes
git status --short
```

فایل‌های تشخیصی قدیمی untracked به‌خودی‌خود مانع pull نیستند، اما فایل‌های tracked تغییرکرده باید بررسی شوند؛ `git reset --hard` نزنید.

بلوک زیر timerهای فعال فعلی را ثبت می‌کند تا فقط همان‌ها دوباره روشن شوند؛ سرویس‌های قدیمی غیرفعال را فعال نمی‌کند. علاوه بر timer، اجرای فعال Workerها هم متوقف می‌شود.

```bash
(
set -euo pipefail
cd /var/www/dota2notes
install -d -m 700 /root/dota2notes-deploy
if [ -e /root/dota2notes-deploy/replay-resilience-active-timers.txt ]; then
  echo 'Deployment state already exists. Inspect it before repeating this block.'
  exit 1
fi
systemctl list-units --type=timer --state=active --no-legend --plain 'dota2notes-*' |
  awk '{print $1}' > /root/dota2notes-deploy/replay-resilience-active-timers.txt
git rev-parse HEAD > /root/dota2notes-deploy/replay-resilience-previous-commit.txt
mapfile -t replay_deploy_timers < /root/dota2notes-deploy/replay-resilience-active-timers.txt
for replay_deploy_timer in "${replay_deploy_timers[@]}"; do
  systemctl stop "$replay_deploy_timer"
done
mapfile -t replay_deploy_services < <(systemctl list-units --type=service --no-legend --plain 'dota2notes-*' | awk '{print $1}')
for replay_deploy_service in "${replay_deploy_services[@]}"; do
  systemctl stop "$replay_deploy_service"
done
systemctl stop dota2notes.service
replay_backup="/var/backups/dota2notes/dota_notes-before-replay-resilience-$(date -u +%Y%m%dT%H%M%SZ).dump"
sudo -u postgres pg_dump -Fc -d dota_notes -f "$replay_backup"
chmod 600 "$replay_backup"
sudo -u postgres pg_restore -l "$replay_backup" >/dev/null
ls -lh "$replay_backup"
sudo -u dota2notes -H git pull --ff-only origin main
sudo -u dota2notes -H npm ci
sudo -u dota2notes -H env DOTENV_CONFIG_PATH=.env.production npm run db:migrate
sudo -u dota2notes -H npm test
sudo -u dota2notes -H npm run typecheck
sudo -u dota2notes -H npm run build
)
```

خروجی موفق Build و migration را نگه دارید. بکاپ در همان پوشه قبلی شماست. این پچ فایل systemd/nginx را عوض نمی‌کند و نیاز به نصب مجدد unit ندارد.

## ۵. تنظیم مسیر جایگزین و حذف pin دستی

```bash
sudoedit /var/www/dota2notes/.env.production
```

مقادیر قبلی Worker URL، token، Parser و ParsPack را حفظ کنید. فقط این دو تنظیم را یک‌بار اضافه/ویرایش کنید:

```dotenv
LOCAL_REPLAY_PROXY_FALLBACK_URLS=
LOCAL_REPLAY_PROXY_FALLBACK_IPS=188.114.99.0
```

IP بالا همان IPای است که قبلاً روی VPS شما پاسخ 401 و دانلود موفق داده بود؛ تضمین دائمی برای آن نیست و این بار فقط یکی از گزینه‌هاست. DNS و مسیرهای دیگر هم بررسی می‌شوند. مقدار `LOCAL_REPLAY_WORKER_ENABLED=true` باید حفظ شود.

اگر دامنه دیگری واقعاً به همین Worker متصل کردید، می‌توانید URL آن را در `FALLBACK_URLS` بگذارید. صرف نوشتن یک URL در env آن دامنه را به Worker متصل نمی‌کند. برای اجرای فعلی خرید دامنه یا تغییر DNS سایت لازم نیست.

از hosts بکاپ بگیرید و **فقط hostname همین Worker** را از خط pin قبلی حذف کنید؛ خط‌های دیگر را نگه دارید:

```bash
sudo cp -p /etc/hosts "/etc/hosts.before-replay-resilience-$(date -u +%Y%m%dT%H%M%SZ)"
sudoedit /etc/hosts
```

خطی که قبلاً اضافه کردیم:

```text
188.114.99.0 dota2notes-replay-proxy.dota2notes-replays.workers.dev
```

اگر این خط فقط همین hostname را دارد کل همان خط را حذف کنید. IP در env به‌عنوان fallback باقی می‌ماند. فایل قدیمی hosts را به‌طور کامل روی فایل جدید Restore نکنید.

## ۶. تست واقعی سوییچ خودکار؛ قبل از روشن‌کردن صف

مچ `9019098197` در آخرین لاگ شما cluster=272 و salt=1090002789 داشت. تست اول فقط ۳۲ بایت است:

```bash
cd /var/www/dota2notes
sudo -u dota2notes -H node --env-file=/var/www/dota2notes/.env.production \
  scripts/replay-parser/probe-proxy.mjs 272 9019098197 1090002789
```

برای اثبات failover، این تست **یک فایل کامل** دریافت می‌کند؛ به همان اندازه ترافیک دانلود VPS مصرف می‌شود:

```bash
sudo -u dota2notes -H node --env-file=/var/www/dota2notes/.env.production \
  scripts/replay-parser/verify-failover.mjs 272 9019098197 1090002789 --full-test-failover
```

در این تست همان downloader اصلی استفاده می‌شود. فقط مسیر اول داخل همین process عمداً خطا می‌دهد؛ مسیر بعدی باید واقعاً کل Replay را بگیرد. به IP آزمایشی token یا درخواست ارسال نمی‌شود و hosts، firewall، دیتابیس، صف و ParsPack تغییر نمی‌کنند. فایل موقت در پایان پاک می‌شود.

خروجی موفق باید این ترتیب را داشته باشد:

1. `synthetic-first-address-failure`
2. `simulated_primary_outage`
3. تلاش بعدی روی IP واقعی و `download_complete`
4. خروجی نهایی `ok:true`، `injectedFailures` حداقل ۱، اندازه کامل در `bytes` و `sha256`.

این تست خطای اول را شبیه‌سازی می‌کند؛ ادعا نمی‌کند یک قطعی واقعی سراسری Cloudflare رخ داده است. اما ادامه خودکار همان کد و دریافت کامل واقعی را اثبات می‌کند.

اگر Replay قدیمی دیگر قابل دریافت نبود، یک مچ جدید با دریافت ساده وارد سایت کنید و cluster/salt آن را از این query بگیرید، سپس همان سه عدد را در دو دستور بالا جایگزین کنید:

```bash
sudo -u postgres psql -d dota_notes -P pager=off -c \
"SELECT match_id,raw_data->>'cluster' AS cluster,raw_data->>'replay_salt' AS salt
 FROM dota_matches WHERE match_id=9019098197;"
```

هیچ تستی نمی‌تواند Replay حذف‌شده از Valve را به‌جای فایل واقعی دانلود کند؛ 520 نیز به‌تنهایی اثبات حذف‌شدن فایل نیست.

## ۷. روشن‌کردن سایت و timerها

پس از موفقیت مراحل بالا:

```bash
(
set -euo pipefail
sudo systemctl start dota2notes.service
sudo -u dota2notes -H bash /var/www/dota2notes/deploy/scripts/health-check.sh
while IFS= read -r replay_deploy_timer; do
  [ -z "$replay_deploy_timer" ] || sudo systemctl start "$replay_deploy_timer"
done < /root/dota2notes-deploy/replay-resilience-active-timers.txt
sudo systemctl enable --now dota2notes-replay.timer
mv /root/dota2notes-deploy/replay-resilience-active-timers.txt \
  /root/dota2notes-deploy/replay-resilience-active-timers.completed.txt
)
sudo systemctl status dota2notes.service dota2notes-replay.timer --no-pager
systemctl list-timers 'dota2notes-*'
```

health باید موفق و timer باید active(waiting) باشد. `dota2notes-replay.service` از نوع oneshot است؛ بعد از پایان کار `inactive (dead)` با exit موفق طبیعی است. بستن MobaXterm کار timer را متوقف نمی‌کند.

Job قدیمی که وسط توقف processing بوده، پس از ۱۰ دقیقه نبود heartbeat بازیابی می‌شود. لازم نیست داده آن را پاک کنید.

## ۸. تست پذیرش در سایت و Admin

در Admin بخش مانیتور Replay را باز کنید. فقط همان بخشِ باز polling دارد. مسیر، مرحله، خطا، تلاش بعدی و رویدادهای اخیر نمایش داده می‌شوند.

### تست دانلود و تحویل

1. یک Match جدید و قابل دانلود را جست‌وجو کنید و «دانلود Replay» بزنید.
2. مرحله‌ها باید از queued/checking_archive به connecting/downloading و سپس uploading/completed برسند؛ در download-only نباید parsing ببینید.
3. لینک نهایی را کلیک کنید و فایل را واقعاً در مرورگر دانلود کنید؛ کامل‌شدن Job به‌تنهایی جای تست دانلود کاربر را نمی‌گیرد.
4. همان Match را دوباره درخواست کنید؛ باید فایل آرشیو موجود استفاده شود و دانلود تازه از Valve شروع نشود.

### تست تحلیل

برای یک مچ تازه، در Performance درخواست تحلیل بدهید. parsing باید دیده شود و سپس تحلیل و آرشیو آماده باشند. فرمول Lane در این پچ تغییر نکرده است.

برای مشاهده وضعیت، Match ID را عوض کنید:

```bash
sudo -u postgres psql -d dota_notes -P pager=off -c \
"SELECT j.match_id,j.status,j.intent,j.phase,j.attempts,
 j.downloaded_bytes,j.total_bytes,j.transfer_bytes,j.upload_bytes,
 j.last_endpoint,j.last_address,j.error_code,j.error_message,
 j.run_after AT TIME ZONE 'Asia/Tehran' AS next_try_tehran,
 j.archive_status,j.archive_key,j.spool_name,
 d.local_replay_data IS NOT NULL AS parsed
 FROM local_replay_jobs j JOIN dota_matches d USING(match_id)
 WHERE j.match_id=9019098197;"
sudo journalctl -u dota2notes-replay.service --since '15 minutes ago' --no-pager
```

معیار موفقیت نهایی: `completed`، `archive_status=active`، `spool_name` خالی و لینک دانلود سالم. برای intent=analysis علاوه بر آن `parsed=t`؛ برای download-only پارس‌نشدن کاملاً طبیعی است.

اگر فایل از قبل آرشیو شده باشد ممکن است مرحله‌های انتقال را نبینید؛ برای مشاهده دانلود واقعی یک مچ تازه انتخاب کنید. فایل‌های واقعی کاربران را برای تست حذف نکنید.

## نتیجه بررسی قبل از تحویل

- `npm test`: تعداد ۲۴۸ تست در ۵۰ فایل موفق.
- `npm run typecheck`: موفق.
- `npm run build`: Build استاندارد Turbopack موفق.
- محیط اجرای این بررسی شمارنده حافظه سیستم‌عامل را در اختیار Next نمی‌گذاشت (`uv_resident_set_memory`). صرفاً در node_modules همین محیط، ثبت telemetry حافظه با try/catch محافظت شد تا Build اجرا شود. این تغییر محیطی داخل ZIP نیست؛ روی VPS باید Build عادی مطابق دستور بالا موفق شود.
- تست تصویری مرورگر اجرا نشده؛ صفحه mock برای بررسی ظاهری شما آماده است.

## ۹. حدود تست و بازگشت

تست‌های خودکار شامل TLS/hostname، timeout، تعویض مسیر، قطع stream، ETag/Range، پاسخ نامعتبر، retry، migration و SQL واقعی با PostgreSQL تعبیه‌شده PGlite هستند. دسترسی به env/ParsPack/VPS شما در محیط ساخت پچ وجود ندارد؛ تأیید نهایی شبکه و لینک کاربر با مراحل ۶ تا ۸ انجام می‌شود.

اگر استقرار شکست خورد، قبل از هر تغییر بیشتر timer و اجرای فعال replay را متوقف نگه دارید. commit قبلی در `/root/dota2notes-deploy/replay-resilience-previous-commit.txt` ثبت است. Migration افزایشی است؛ برای بازگشت برنامه معمولاً لازم نیست دیتابیس یا داده کاربران حذف/Restore شود. بازگشت را با بررسی خطای واقعی انجام دهید و فایل‌های موقت نگه‌داری‌شده را دستی پاک نکنید.
