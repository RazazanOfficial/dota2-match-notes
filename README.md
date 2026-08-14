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

OPENDOTA_API_BASE_URL=https://api.opendota.com/api
OPENDOTA_API_KEY=
OPENDOTA_TIMEOUT_MS=10000
OPENDOTA_MAX_RESPONSE_BYTES=8388608
OPENDOTA_MANUAL_SYNC_COOLDOWN_SECONDS=300
OPENDOTA_MINUTE_REQUEST_LIMIT=50
OPENDOTA_DAILY_REQUEST_LIMIT=2900

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

## API ژورنال

- `GET /api/journal/me?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `PUT /api/journal/days/YYYY-MM-DD`
- `GET /api/journal/users/HANDLE?from=YYYY-MM-DD&to=YYYY-MM-DD`

Handle عمومی را می‌توان به شکل کامل مانند `steam_123456789` یا فقط Steam Account ID
مانند `123456789` وارد کرد.

## API تصاویر مچ

- `GET /api/matches/MATCH_ID/images`

کاربر API آپلود فایل ندارد. بک‌اند می‌تواند برای هر مچ یک تا سه تصویر تولیدشده را از حافظه
مستقیماً به پارس‌پک منتشر کند؛ فایل موقت دائمی روی VPS ساخته نمی‌شود. هنگام تولید دوباره،
رکوردها و فایل‌های نسخه قبلی جایگزین و پاک می‌شوند. فقط کلید پایدار و metadata در PostgreSQL
نگهداری می‌شود و API عمومی بالا تصاویر نهایی را به‌ترتیب برمی‌گرداند.

تابع داخلی `publishGeneratedMatchImages` قرارداد اتصال مولد تصویر آینده به فضای ذخیره‌سازی
است. مولد گرافیکی پس از دریافت داده کامل مچ از OpenDota به این تابع متصل خواهد شد.

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
Jobهای همگام‌سازی و مصرف پنجره‌های OpenDota را برمی‌گرداند. هیچ‌کدام از این مسیرها اطلاعات
نشست یا کلیدهای محرمانه را نمایش نمی‌دهند.
