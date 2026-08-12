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

## آماده‌سازی محلی

ابتدا `.env.example` را با نام `.env.local` کپی و مقادیر واقعی را فقط در فایل محلی وارد
کنید:

```dotenv
APP_URL=http://localhost:3000
STEAM_WEB_API_KEY=YOUR_STEAM_WEB_API_KEY
DATABASE_URL=postgresql://dota_notes_app:YOUR_PASSWORD@127.0.0.1:5432/dota_notes

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

اطلاعات ثابت هیروها از پروژه MIT
[`odota/dotaconstants`](https://github.com/odota/dotaconstants) تهیه شده و تصاویر هیروها
از CDN رسمی Steam دریافت می‌شوند.
