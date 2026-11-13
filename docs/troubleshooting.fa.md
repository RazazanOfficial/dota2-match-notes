# عیب یابی هدفمند

ابتدا لایه را مشخص کن: نشست SSH، سرویس، DB/link، provider، archive یا کلاینت.
از یک timeout یا پاسخ health، علت قطعی برای همه لایه ها نتیجه نگیر.

## MobaXterm بی خروجی یا قطع شده

یک بار `Ctrl+Q` می تواند توقف اتفاقی نمایش را آزاد کند. اگر پنجره پاسخ نداد، اتصال SSH جدید باز کن و قبل از تکرار اسکریپت وضعیت را بخوان:

```bash
sudo -u dota2notes -H git --no-pager -C /var/www/dota2notes log -1 --format='%H%n%s'
ps -eo pid,ppid,stat,etime,comm --forest
sudo systemctl show dota2notes-api.service dota2notes-replay.service \
  dota2notes-sync-daemon.service -p Id -p ActiveState -p SubState --no-pager
```

`T` در STAT یعنی process متوقف شده؛ `S` به تنهایی هنگ یا شکست نیست و می تواند انتظار عادی باشد.
`PPID=1` می تواند نشان دهد والد قبلی پایان یافته است؛ اجرای npm یا ادامه اسکریپت را از روی وجود یک Git تنها فرض نکن.
فقط بعد از شناسایی process مربوط به همان اجرای استقرار، آن را ادامه بده یا خاتمه بده؛ PIDهای قدیمی این گفتگو دستور قابل استفاده مجدد نیستند.
ریبوت، `killall node` یا شروع دوباره npm ci همزمان، قدم اول نیست.
استقرار عادی همچنان نشست معمول SSH با دستورهای [راهنمای استقرار](deployment-ubuntu.md) است؛ `nohup` روش الزامی آینده نیست.

## خطای dubious ownership

Git را با کاربر مالک checkout اجرا کن:

```bash
sudo -u dota2notes -H git --no-pager -C /var/www/dota2notes status -sb
```

برای این نصب، اضافه کردن `safe.directory` به root یا تغییر مالکیت کل checkout لازم نیست.

## build یا preflight ناموفق

| نشانه | بررسی |
| --- | --- |
| `npm ci` ناموفق | نسخه Node/npm و lockfile همان commit؛ تست بعدی اجرا نشود |
| فایل resource Companion نیست | روی Windows ابتدا `node apps/desktop/scripts/prepare-native.mjs` |
| اختلاف اندازه یا SHA رسانه | `.gitattributes` و بایت SVG/line ending؛ manifest مستقل ناسازگار نساز |
| schema یا permission | migration با مالک در ایران و grant جدول های جدید برای compute |
| compute connection | link آلمان و listenerهای loopback؛ DB اینترنتی باز نشود |
| JAR یا incoming نامعتبر | مسیر و دسترسی worker آلمان؛ spool در ایران جستجو نشود |

`/health/live` فقط زنده بودن API را نشان می دهد. readiness محلی schema/DB را هم کنترل می کند؛ provider و archive را ثابت نمی کند.

## Companion مچ را تشخیص نداده

PowerShell ویندوز:

```powershell
Get-ScheduledTask -TaskName "DotaNotes-Companion-*" -ErrorAction SilentlyContinue | Select-Object TaskName,State
Get-Process -Name dota-notes-companion -ErrorAction SilentlyContinue
Test-NetConnection -ComputerName 127.0.0.1 -Port 16272
```

وجود launch option، restart بازی، مسیر فایل GSI و حساب Steam درست را بررسی کن.
پورت باز صرفا listener را نشان می دهد؛ مشاهده post-game معتبر جداست.
روی ایران، بدون چاپ secret:

```bash
sudo -u postgres psql -X -d dota_notes -P pager=off -c \
  "SELECT match_id,status,attempts,ended_at,run_after,deadline_at,error_code FROM match_observations ORDER BY ended_at DESC LIMIT 10;"
```

نبود row: مسیر رویداد/ارسال بررسی شود. pending با موعد آینده طبیعی است. processing قدیمی یا failed: daemon آلمان و کد خطا بررسی شود.
رویداد ممکن است اصلا دریافت نشده باشد؛ Fetch دستی و reconciliation دوره ای fallback هستند.
`device.json`، credential، فایل GSI و URL موقت را برای عیب یابی عمومی نفرست.

## دانلود یا تحلیل معطل است

روی ایران:

```bash
sudo -u postgres psql -X -d dota_notes -P pager=off -c \
  "SELECT match_id,status,phase,archive_status,download_requested_at,heartbeat_at,run_after,error_code FROM local_replay_jobs ORDER BY updated_at DESC LIMIT 10;"
```

روی آلمان:

```bash
sudo journalctl -u dota2notes-replay.service -u dota2notes-sync-daemon.service \
  --since '15 minutes ago' -n 100 --no-pager
```

archive ready با completed تحلیل متفاوت است. اگر archive حاضر است ولی native شروع نمی شود، صف انتقال دستگاه، session، ticket و خطای native بررسی شوند.
کندی انتقال مستقیم پارس پک را خودکار به VPS آلمان نسبت نده؛ Host واقعی درخواست و زمان readiness را جدا ثبت کن.
`NoSuchKey` یعنی object در همان URL موجود نیست؛ به تنهایی علت یا مقصر بودن OpenDota را اثبات نمی کند.

### صف ثابت و replay service با خروج موفق خاموش است

روی آلمان، وضعیت خروج را پیش از شروع دوباره ثبت کن:

```bash
sudo systemctl show dota2notes-replay.service \
  -p ActiveState -p SubState -p Result -p ExecMainStatus \
  -p ExecMainExitTimestamp -p NRestarts --no-pager
```

`inactive/dead` با `Result=success` و `ExecMainStatus=0` سلامت پردازش را ثابت نمی کند؛ با `Restart=on-failure` خروج موفق خودکار برنمی گردد.
در نسخه های پیش از اصلاح lifecycle، خطای اتصال DB یا heartbeat می توانست abort مشترک را فعال کند، retry تسک ذخیره شود و فرایند با خروج موفق خاموش بماند.
نسخه اصلاح شده خطای اصلی را نگه می دارد و با `replay_pipeline_failed` و خروج ناموفق پایان می یابد تا systemd دوباره اجرا کند؛ توقف عمدی با SIGTERM/SIGINT همچنان مسیر لغو عادی دارد.
برای تشخیص، زمان خروج را با آخرین `heartbeat_at`/`updated_at` تسک و journal همان بازه تطبیق بده؛ خروج موفق به تنهایی علت آغاز توقف را مشخص نمی کند.

`transportCode=55P03` در لاگ یعنی PostgreSQL قفل لازم را نگرفته است؛ برچسب مرحله مانند `replay_archive_check_failed` به تنهایی خطای storage را ثابت نمی کند.
شناسه خطا بدون URL، credential یا متن کامل query ثبت می شود. نبود blocker در بررسی فعلی نیز مالک قفل تاریخی را مشخص نمی کند.

برای اصلاح worker، سورس canonical در `apps/api/scripts/replay-parser/run-pipeline.mjs` تغییر می کند و runtime سرویس با `npm run api:build` و `npm run release:prepare -w @dota-notes/api` طبق [استقرار](deployment-ubuntu.md) تولید می شود؛ فایل generated را دستی patch نکن.
شروع مجدد سرویس روی production باید با مجوز همان عملیات انجام شود. پس از شروع، worker درخواست های آماده سازی pending با بودجه منقضی را failed می کند؛ checkpoint منتظر parse در مرحله `awaiting_parse` حفظ می شود. این رفتار با گیر کردن صف متفاوت است.
برای آن مچ ها از مسیر معمول برنامه درخواست تازه ثبت کن؛ deadline، attempts یا وضعیت تمام صف را با SQL گسترده بازنشانی نکن.
پذیرش بازیابی، علاوه بر `active/running`، تغییر واقعی وضعیت یک درخواست معتبر و ثبت نتیجه parse در DB است؛ سلامت provider و archive جدا بررسی می شوند.

## هشدارهای شناخته شده ساخت

- Rust `dead_code`: ماژول مشترک در دو executable بخش های استفاده نشده دارد؛ به تنهایی به معنی خراب بودن Companion نیست.
- Node `DEP0190`: در prepare فعلی، `npm run build` با shell در Windows اجرا می شود؛ الگوی invocation باید در تغییر جدا اصلاح شود، نه اینکه هشدار پنهان شود.
- Vite native loader: import بدون پسوند و JSON بدون attribute برای سازگاری آینده نیاز به اصلاح دارند؛ بیلد فعلی با loader موجود موفق بوده است.
- `PLUGIN_TIMINGS`: زمان افزونه ها در ساخت است، نه مصرف CPU نرم افزار نصب شده.

این هشدارها جای نتیجه واقعی دستور را نمی گیرند. گزارش بازبینی کد و محدودیت ها در [بازبینی مستندات](documentation-review-2026-11.fa.md) ثبت شده است.
