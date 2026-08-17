# Dota 2 Match Notes

دفتر فارسی و واکنش‌گرا برای ثبت، مرور و گزارش مچ‌های Dota 2 با Next.js و PostgreSQL.

## امکانات

- تقویم شمسی هفتگی از شنبه ۳ مرداد ۱۴۰۵
- جست‌وجو و انتخاب همه هیروها همراه تصویر
- انتخاب چندگانه هیروهای بن‌شده
- ثبت Role و Queue Type هر بازی
- ثبت، ویرایش و حذف بازی با به‌روزرسانی فوری رابط
- ورود بازیکن با Steam OpenID و نشست امن ۳۰روزه
- مشاهده عمومی و فقط‌خواندنی مچ‌ها با Handle بازیکن
- گزارش هفتگی با باکس مستقل برای هر روز
- ذخیره اطلاعات در PostgreSQL از طریق API داخلی Next.js
- انتشار تصاویر تولیدشده مچ توسط بک‌اند در Object Storage سازگار با S3 پارس‌پک
- دریافت و ذخیره آمار واقعی مچ از OpenDota با محدودیت همگام‌سازی دستی

## آماده‌سازی محلی

ابتدا `.env.example` را با نام `.env.local` کپی و مقادیر واقعی را فقط در فایل محلی وارد
کنید:

```dotenv
APP_URL=http://localhost:3000
STEAM_WEB_API_KEY=YOUR_STEAM_WEB_API_KEY
SUPER_ADMIN_STEAM_IDS=YOUR_STEAM_ID_64
DATABASE_URL=postgresql://dota_notes_app:YOUR_PASSWORD@127.0.0.1:5432/dota_notes
JOURNAL_TIME_ZONE=Asia/Tehran

OPENDOTA_API_BASE_URL=https://api.opendota.com/api
OPENDOTA_API_KEY=
OPENDOTA_TIMEOUT_MS=30000
OPENDOTA_MAX_RESPONSE_BYTES=8388608
OPENDOTA_MANUAL_SYNC_COOLDOWN_SECONDS=300
OPENDOTA_MANUAL_SYNC_LOOKBACK_SECONDS=21600
OPENDOTA_MINUTE_REQUEST_LIMIT=50
OPENDOTA_DAILY_REQUEST_LIMIT=2900
OPENDOTA_MAX_NEW_MATCHES_PER_SYNC=20

SYNC_WORKER_SECRET=GENERATE_A_RANDOM_32_PLUS_CHARACTER_SECRET
SCHEDULED_SYNC_INTERVAL_SECONDS=3600
SCHEDULED_SYNC_ENQUEUE_BATCH_SIZE=25
SCHEDULED_SYNC_PROCESS_BATCH_SIZE=1
SCHEDULED_SYNC_STALE_LOCK_SECONDS=900
SCHEDULED_SYNC_MAX_ATTEMPTS=3
SCHEDULED_SYNC_RETRY_BASE_SECONDS=60
SCHEDULED_SYNC_LOOKBACK_SECONDS=21600
SCHEDULED_SYNC_INITIAL_MATCHES=1

CLOUD_SPACE_END_POINT_URL=https://YOUR_ENDPOINT
CLOUD_SPACE_BUCKET=YOUR_BUCKET
CLOUD_SPACE_PUBLIC_BASE_URL=https://YOUR_PUBLIC_BUCKET_ROOT
CLOUD_SPACE_ACCESS_KEY=YOUR_ACCESS_KEY
CLOUD_SPACE_SECRET_KEY=YOUR_SECRET_KEY
CLOUD_SPACE_REGION=us-east-1
CLOUD_SPACE_FORCE_PATH_STYLE=true
GENERATED_IMAGE_MAX_BYTES=12582912
```

سپس وابستگی‌ها و migrationهای دیتابیس را آماده کنید:

```bash
npm ci
npm run db:migrate
npm run dev
```

سایت محلی روی `http://localhost:3000` اجرا می‌شود.

## بررسی

```bash
npm test
npm run typecheck
npm run build
```

برای مشاهده دیتابیس در رابط Drizzle Studio:

```bash
npm run db:studio
```

راهنمای استقرار بدون Docker روی Ubuntu، شامل PostgreSQL، systemd، Timerهای Worker، Nginx و
TLS در [`docs/deployment-ubuntu.md`](docs/deployment-ubuntu.md) قرار دارد. فایل‌های آماده‌ی
سرور داخل پوشه `deploy` هستند و برای دامنه `dota2notes.ir` تنظیم شده‌اند.

## API ژورنال

- `GET /api/journal/me?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `PUT /api/journal/days/YYYY-MM-DD`
- `GET /api/journal/users/HANDLE?from=YYYY-MM-DD&to=YYYY-MM-DD`

Handle عمومی را می‌توان به شکل کامل مانند `steam_123456789` یا فقط Steam Account ID
مانند `123456789` وارد کرد.

هر مچ در پاسخ خواندن ژورنال علاوه بر یادداشت‌های قابل ویرایش، فیلدهای فقط‌خواندنی منبع،
Match ID، زمان و مدت، K/D/A، GPM، XPM، Net Worth، Damageها و شناسه و نام Game Mode و
Lobby Type را نیز برمی‌گرداند. Match ID در JSON به‌شکل رشته ارسال می‌شود تا دقت عددی در
مرورگر از بین نرود. مچ دستی برای این فیلدها مقدار `null` دارد.

## API تصاویر مچ

- `GET /api/matches/MATCH_ID/images`

کاربر API آپلود فایل ندارد. بک‌اند می‌تواند برای هر مچ یک تا سه تصویر تولیدشده را از حافظه
مستقیماً به پارس‌پک منتشر کند؛ فایل موقت دائمی روی VPS ساخته نمی‌شود. هنگام تولید دوباره،
رکوردها و فایل‌های نسخه قبلی جایگزین و پاک می‌شوند. فقط کلید پایدار و metadata در PostgreSQL
نگهداری می‌شود و API عمومی بالا تصاویر نهایی را به‌ترتیب برمی‌گرداند.

تابع داخلی `publishGeneratedMatchImages` قرارداد اتصال مولد تصویر به فضای ذخیره‌سازی است.
Image Worker بعد از دریافت داده کامل مچ از OpenDota این تابع را فراخوانی می‌کند.

موتور `renderGeneratedMatchImages` از داده معتبر OpenDota سه تصویر WebP با ابعاد
`1280x720` می‌سازد: نمای کلی مچ، Scoreboard دو تیم و کارت عملکرد بازیکن. تمام SVG و WebPها
در حافظه ساخته می‌شوند و موتور هیچ فایل موقتی روی دیسک ایجاد نمی‌کند. پرتره هیروها فقط از
URLهای ثابت Steam CDN که از فهرست داخلی هیروها ساخته شده‌اند دریافت می‌شوند؛ اندازه و زمان
دریافت محدود است و در صورت خطای CDN، تصویر با Placeholder امن تولید می‌شود.

تنظیمات موتور تصویر:

```dotenv
MATCH_IMAGE_ASSET_TIMEOUT_MS=5000
MATCH_IMAGE_ASSET_MAX_BYTES=1572864
MATCH_IMAGE_WEBP_QUALITY=88
```

هر مچ OpenDota یک Job پایدار و یکتا در `match_image_jobs` دارد. ثبت مچ و ایجاد Job در یک
Transaction انجام می‌شود، اما رندر و انتشار جدا از Sync اجرا می‌شوند؛ بنابراین خطای Sharp،
Steam CDN یا پارس‌پک ثبت مچ و Worker همگام‌سازی را Rollback نمی‌کند. Migration مچ‌های
OpenDota موجود را نیز به‌صورت `pending` وارد این صف می‌کند.

### Worker تصاویر مچ

- `POST /api/internal/images/tick`
- Header اجباری: `Authorization: Bearer SYNC_WORKER_SECRET`

هر Tick تعداد محدودی Job را با `FOR UPDATE SKIP LOCKED` دریافت می‌کند، سه تصویر را در RAM
می‌سازد و مستقیم در پارس‌پک منتشر می‌کند. نسخه قبلی فقط پس از موفقیت نسخه جدید پاک می‌شود.
خطاهای موقت با تأخیر نمایی Retry می‌شوند و Jobهای دارای قفل قدیمی در Tick بعدی بازیابی
می‌شوند. خطاهای دائمی داده بدون Retry بی‌فایده به `failed` می‌روند.

```dotenv
MATCH_IMAGE_PROCESS_BATCH_SIZE=1
MATCH_IMAGE_STALE_LOCK_SECONDS=900
MATCH_IMAGE_MAX_ATTEMPTS=3
MATCH_IMAGE_RETRY_BASE_SECONDS=60
```

## API همگام‌سازی OpenDota

- `POST /api/matches/JOURNAL_MATCH_UUID/opendota`
- بدنه: `{ "dotaMatchId": "8981928176" }`

این مسیر فقط برای صاحب مچ و با نشست Steam قابل استفاده است و درخواست مرورگر باید از Origin
خود سایت ارسال شود. هر کاربر به‌صورت پیش‌فرض هر ۵ دقیقه یک همگام‌سازی دستی دارد. پاسخ کامل
OpenDota در `dota_matches.raw_data` ذخیره می‌شود و آمار همان بازیکن شامل نتیجه، هیرو، K/D/A،
GPM، XPM، Net Worth و Damageها در `journal_matches` ثبت می‌شود. Match ID به‌شکل رشته ارسال
می‌شود تا تبدیل عددی ناخواسته در کلاینت‌های مختلف رخ ندهد.

کلید `OPENDOTA_API_KEY` اختیاری است و نباید با پیشوند `NEXT_PUBLIC_` تعریف یا Commit شود.
علاوه بر Cooldown هر کاربر، شمارنده‌های سراسری دقیقه و روز در PostgreSQL نگهداری می‌شوند تا
مجموع درخواست کاربران از سقف پلن OpenDota عبور نکند. مقادیر پیش‌فرض کمی پایین‌تر از سقف
عمومی ۶۰ درخواست در دقیقه و ۳۰۰۰ درخواست در روز انتخاب شده‌اند.

### کشف خودکار مچ‌های اخیر

- `POST /api/sync/me`

این مسیر بدون دریافت Match ID، مچ‌های حساب Steam را از زمان عضویت کاربر در سایت بررسی
می‌کند. بعد از Sync موفق یک Cursor داخلی با هم‌پوشانی امن شش‌ساعته جلو می‌رود تا هم پاسخ
OpenDota کوچک بماند و هم مچی که با تأخیر منتشر شده از دست نرود. مچ‌های تکراری نادیده گرفته
می‌شوند و در هر اجرا حداکثر تعداد مشخص‌شده در
`OPENDOTA_MAX_NEW_MATCHES_PER_SYNC` با اطلاعات کامل دریافت و در تاریخ واقعی مچ ثبت می‌شوند.
مقدار پیش‌فرض ۲۰ مچ است؛ بنابراین چند بازی همان روز با یک کلیک وارد می‌شوند. همان
Cooldown پنج‌دقیقه‌ای و سهمیه‌های سراسری OpenDota روی این مسیر نیز اعمال می‌شوند.

پاسخ شامل تعداد مچ‌های بررسی‌شده، تکراری، ثبت‌شده، ناموفق و عقب‌افتاده است. روز مچ با منطقه
زمانی `JOURNAL_TIME_ZONE` محاسبه می‌شود که مقدار پیش‌فرض آن `Asia/Tehran` است؛ بنابراین ساعت
UTC سرور VPS تاریخ دفتر را جابه‌جا نمی‌کند. وضعیت Cooldown و صف ساخت تصاویر با
`GET /api/sync/me` برای رابط کاربری خوانده می‌شود.

اگر کاربر یک مچ متصل به OpenDota را از دفتر حذف کند، شناسه آن در جدول
`dismissed_dota_matches` ثبت می‌شود و Syncهای بعدی آن را دوباره وارد نمی‌کنند. داده این جدول
فقط تصمیم حذف کاربر را نگه می‌دارد و شامل آمار یا اطلاعات خصوصی نیست. اتصال صریح همان Match
ID از مسیر همگام‌سازی تکی، این علامت حذف را برمی‌دارد و مچ را دوباره فعال می‌کند.

## Worker همگام‌سازی زمان‌بندی‌شده (غیرفعال)

- `POST /api/internal/sync/tick`
- Header اجباری: `Authorization: Bearer SYNC_WORKER_SECRET`

هر Tick ابتدا Jobهای گیرکرده را بازیابی می‌کند، کاربران موعدرسیده را با رعایت Job فعال یکتا
در صف می‌گذارد و سپس تعداد محدودی Job را پردازش می‌کند. Claim هر Job با قفل ردیفی
`FOR UPDATE SKIP LOCKED` انجام می‌شود؛ بنابراین اجرای هم‌زمان دو Tick باعث پردازش دوباره یک
کاربر نمی‌شود. خطاهای موقت OpenDota با تأخیر نمایی Retry می‌شوند و بعد از سقف تلاش، Job به
`failed` می‌رود. زمان آخرین بررسی کاربر نیز پس از موفقیت یا شکست نهایی ثبت می‌شود تا Worker
در هر Tick همان کاربر را دوباره صف نکند.

اگر کاربر قبلاً Sync دستی یا زمان‌بندی‌شده داشته باشد، Worker فقط مچ‌های جدیدتر از آن زمان را
با هم‌پوشانی `SCHEDULED_SYNC_LOOKBACK_SECONDS` بررسی می‌کند. برای حسابی که هیچ Sync قبلی
ندارد، فقط `SCHEDULED_SYNC_INITIAL_MATCHES` مچ اول وارد می‌شود تا تاریخچه قدیمی ناخواسته
Backfill نشود. همه درخواست‌های Worker از همان سهمیه سراسری OpenDota عبور می‌کنند و در صورت
پرشدن سهمیه، پردازش Batch زودتر متوقف می‌شود.

برای ساخت Secret محلی:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

این Secret فقط در `.env.local` یا تنظیمات سرویس VPS قرار می‌گیرد و نباید به Git، مرورگر یا
متغیرهای `NEXT_PUBLIC_` وارد شود. کد Scheduler برای استفاده آینده حفظ شده، اما Timer آن در
استقرار فعلی نصب یا فعال نمی‌شود؛ Sync کاربران فقط با دکمه خودشان انجام می‌شود.

اطلاعات ثابت هیروها از پروژه MIT
[`odota/dotaconstants`](https://github.com/odota/dotaconstants) تهیه شده و تصاویر هیروها
از CDN رسمی Steam دریافت می‌شوند.

## API مدیریت

دسترسی Super Admin از طریق allowlist متغیر `SUPER_ADMIN_STEAM_IDS` تعیین می‌شود. مقدار آن
یک یا چند SteamID64 با جداکننده ویرگول است و به رمز، Session یا API Token شخصی کاربر دیگری
نیاز ندارد. بعد از تغییر این متغیر، سرور را دوباره اجرا کنید و با همان حساب Steam وارد شوید.

- `GET /api/admin/overview`
- `GET /api/admin/users?query=&limit=25&offset=0`
- `POST /api/admin/users`
- بدنه ساخت/به‌روزرسانی کاربر: `{ "steamIdentifier": "988195076" }`

شناسه ورودی می‌تواند Steam Account ID کوتاه یا SteamID64 باشد. بک‌اند با کلید سروری Steam
پروفایل عمومی را دریافت می‌کند، حساب را بدون ساخت Session ثبت می‌کند و ورود واقعی کاربر فقط
بعد از تأیید OpenID توسط خود Steam اتفاق می‌افتد. ساخت و تازه‌سازی کاربر در جدول
`admin_audit_logs` ثبت می‌شود. API نمای کلی نیز تعداد کاربران، Sessionهای فعال، مچ‌ها، تصاویر،
Jobهای همگام‌سازی، Jobهای تصویر و مصرف پنجره‌های OpenDota را برمی‌گرداند. هیچ‌کدام از این
مسیرها اطلاعات نشست یا کلیدهای محرمانه را نمایش نمی‌دهند.
