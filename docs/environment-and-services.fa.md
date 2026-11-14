# تنظیمات محیط و فهرست سرویس ها

این سند نصب موجود را توضیح می دهد. مقدار واقعی فقط در env خصوصی هر میزبان نگهداری شود.
فایل های مثال، ورودی ساخت محیط تازه هستند؛ آنها را روی `.env.production` موجود کپی نکن.

## تنظیمات نقش ها

| متغیر | ایران | آلمان |
| --- | --- | --- |
| `DOTA_NODE_ROLE` | `app` | `compute` |
| `DATABASE_URL` | مالک DB، `127.0.0.1:5432/dota_notes` | نقش محدود، `127.0.0.1:15432/dota_notes` |
| `DOTA_COMPUTE_ORIGIN` | `http://127.0.0.1:14100` | برای نقش compute لازم نیست |
| `DOTA_COMPUTE_TOKEN` | secret یکسان دو میزبان | همان مقدار |
| `API_HOST` / `API_PORT` | `127.0.0.1` / `4100` | همان |
| `API_PUBLIC_ORIGIN` | `https://api.dota2notes.ir` | همان مبدا عمومی ایران |
| `APP_URL` | `https://dota2notes.ir` | همان |
| `LOCAL_REPLAY_WORKER_ENABLED` | `false` | `true` |
| `SCHEDULED_SYNC_ENABLED` | `off` | `on` برای دریافت دوره ای فعلی |
| `SCHEDULED_SYNC_LOOKBACK_SECONDS` | پردازش اجرا نمی شود | `172800` |
| `SCHEDULED_SYNC_INITIAL_MATCHES` | پردازش اجرا نمی شود | `20` |
| `LOCAL_REPLAY_DOWNLOAD_MODE` | worker غیرفعال | `direct` |

رمز URL باید encode شود؛ URL واقعی DB را در خروجی تشخیصی چاپ نکن.
`DOTA_COMPUTE_TOKEN` باید base64url تصادفی با طول ۴۳ تا ۱۲۸ کاراکتر باشد.
مقدار `DOTA_COMPUTE_TIMEOUT_MS` از ۱۰۰۰ تا ۱۸۰۰۰۰ معتبر است.
نمونه های `deploy/env.app.example` و `deploy/env.compute.example` هنوز نام پیشنهادی اولیه `dota_notes_primary` و حالت خاموش scheduled sync را دارند؛ برای نصب فعلی جدول بالا و env موجود مرجع هستند.

مقدار `API_ALLOWED_ORIGINS` باید origin واقعی Tauri را داشته باشد: `tauri://localhost`، `http://tauri.localhost` و `https://tauri.localhost`.
`API_TRUST_PROXY` فقط proxyهای مورد اعتماد محلی را شامل شود. به جای رفع خطا با wildcard، مبدا مورد نیاز بررسی شود.
`SUPER_ADMIN_STEAM_IDS`، سیاست حساب و `SYNC_WORKER_SECRET` باید با دو نقش سازگار باشند.
Steam، STRATZ و ایمیل روی compute نیازند؛ `CLOUD_SPACE_*` برای امضای دانلود در ایران و upload در آلمان لازم است.

## ظرفیت و مسیر فایل

| مورد | مقدار نصب فعلی |
| --- | --- |
| JAR فعال | `/var/lib/dota2notes/parser/parser.jar` روی آلمان |
| spool | `/var/lib/dota2notes/replays/incoming` روی آلمان |
| prepare / parse / archive | `2 / 2 / 1` |
| سقف spool | `LOCAL_REPLAY_SPOOL_CAP_MIB=4096` در مثال compute |
| runtime API | `/var/www/dota2notes/apps/api/release` |
| assets عمومی | `apps/api/release/public/desktop-assets/objects` روی ایران |
| snapshot مانیتور | `/var/lib/dota2notes/monitor/status.json` روی آلمان |

فایل `deploy/systemd/overrides/germany-replay.conf` برای میزبان چهار vCPU و هشت GiB نوشته شده است و محدودیت منابع و همزمانی را override می کند.
ENV به تنهایی همه مقادیر موثر systemd را نشان نمی دهد؛ `Environment=` در drop-in نیز بررسی شود.

## سرویس های جاری

| unit | ایران | آلمان |
| --- | --- | --- |
| `dota2notes.service` | Next فعال | غیرفعال |
| `dota2notes-api.service` | API عمومی فعال | API خصوصی فعال |
| `dota2notes-link.service` | SSH server پذیرنده؛ این client unit لازم نیست | فعال |
| `dota2notes-sync-daemon.service` | غیرفعال | فعال |
| `dota2notes-replay.service` | غیرفعال | فعال و مداوم |
| `dota2notes-images.timer` | غیرفعال | فعال؛ service تک اجراست |
| `dota2notes-monitor.timer` | فعال؛ گزارش ایران | فعال؛ گزارش آلمان |
| `dota2notes-performance-reference.timer` | غیرفعال | در نصب گزارش شده خاموش؛ فعال سازی جدا پس از بررسی STRATZ |

unitهای قدیمی sync/replay و workerهای Parse خارجی و enrichment مچ STRATZ از runtime حذف شده‌اند.
دریافت اطلاعات اولیه OpenDota و مرجع عمومی STRATZ باقی هستند. تولید عکس از نتیجهٔ local parser انجام می‌شود.
برای نصب collector هر دو میزبان و حذف unitهای نصب‌شدهٔ قدیمی، [راهنمای مانیتور](service-monitoring.md) را ببین.

این جدول وضعیت مورد انتظار است، نه گزارش لحظه ای systemd.
برای دیدن مقدار موثر، بدون چاپ env خصوصی:

```bash
sudo systemctl show dota2notes-api.service dota2notes-replay.service \
  dota2notes-sync-daemon.service -p Id -p ActiveState -p SubState -p NRestarts --no-pager
sudo systemctl list-timers --all --no-pager 'dota2notes-*'
```

## مهاجرت و دسترسی DB

migration فقط در ایران و با مالک DB اجرا می شود؛ compute مجوز ساخت schema یا جدول ندارد.
migration `0031_automatic_library.sql` سه جدول `sync_history_cache`، `companion_devices` و `match_observations` و ستون های صف را اضافه می کند.
نقش compute برای جدول های جدید به مجوز DML نیاز دارد. داشتن مجوز جدول های قبلی کافی نیست.
نام دیتابیس، مالک و مجوزهای migration آینده باید قبل از استقرار بررسی شوند؛ ساخت DB دوم راه آپدیت نیست.

## تغییر محدود scheduled sync

برای اولین فعال سازی قابلیت دریافت دوره ای در compute موجود:

```bash
cd /var/www/dota2notes
sudo python3 deploy/update-automatic-library-env.py \
  /var/www/dota2notes/.env.production
```

این ابزار فقط سه مقدار scheduled sync بالا را تنظیم می کند، نقش compute را کنترل و مالکیت و مجوز خصوصی فایل را حفظ می کند.
`SCHEDULED_SYNC_ENABLED=off` فقط reconciliation دوره ای را خاموش می کند؛ در کد فعلی پردازش observation و Fetch دستی پیش از این شرط انجام می شوند. برای توقف همه کارها باید خود daemon متوقف باشد.
جزو مراحل الزامی همه انتشارها نیست و نباید برای بازنویسی سلیقه ای env استفاده شود.
