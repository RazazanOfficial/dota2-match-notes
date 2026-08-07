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
- نگهداری تصاویر مچ در Object Storage سازگار با S3 پارس‌پک

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

- `POST /api/matches/MATCH_ID/images/presign`
- آپلود مستقیم فایل با `PUT` به `uploadUrl` برگشتی
- `POST /api/matches/MATCH_ID/images/confirm`
- `GET /api/matches/MATCH_ID/images`
- `DELETE /api/matches/MATCH_ID/images/IMAGE_ID`

حداکثر سه تصویر برای هر مچ ثبت می‌شود. فایل از سرور Next.js عبور نمی‌کند و فقط کلید پایدار
و metadata آن در PostgreSQL ذخیره می‌شود. URL امضاشده موقت و کلیدهای دسترسی پارس‌پک
هرگز در دیتابیس یا مرورگر به‌صورت دائمی نگهداری نمی‌شوند.

اطلاعات ثابت هیروها از پروژه MIT
[`odota/dotaconstants`](https://github.com/odota/dotaconstants) تهیه شده و تصاویر هیروها
از CDN رسمی Steam دریافت می‌شوند.
