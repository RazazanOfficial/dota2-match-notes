# مرحلهٔ اول: بک‌اند مستقل، آمادهٔ استقرار

مبنای انتقال backend، نسخهٔ Next.js در commit `dcb721e03174376eca62629d28c6cd12de0c1f8c` است. در `web.zip` ارسالی کاربر، مسیرهای `(journal)` و gatewayهای وب با بک‌اند Express همخوان بودند. سورس وب ارسالی در پچ همراه است؛ چون `public` در فایل ارسالی نبود، در پچ نیز فایل‌های `apps/web/public` وجود ندارند و هنگام جایگزینی سورس وب باید همان `public` فعلی پروژه باقی بماند. بک‌اند برای ساخت تصویر مچ از `apps/api/public/heroes` داخل همین پچ استفاده می‌کند.

## نتیجه

- همهٔ ۳۹ route و ۴۹ عملیات اصلی Next.js همچنان در Express هستند؛ دو endpoint اضافه برای SSR قبلی ۵۱ عملیات را در registry می‌سازند. گزارش ماشینی در `backend-migration-coverage.json` هیچ مورد گمشده‌ای ندارد.
- `apps/api` بدون اجرای Next.js سرویس می‌دهد. `npm run build -w @dota-notes/api` فایل‌های `dist/main.js`، `dist/worker.js`، `dist/migrate.js`، `dist/check-database.js` و `dist/preflight.js` را می‌سازد.
- `npm run release:prepare -w @dota-notes/api` این خروجی‌ها و ۲۵ migration موجود، پرتره‌های لازم برای رندر و اسکریپت‌های ریپلی را به `apps/api/release` می‌برد. lockfile این پوشه مخصوص production است؛ dependencyهای وب، Next.js، `tsx`، تست و ابزار بیلد در آن نیست. اسکریپت اگر dependencyهای production سورس و lockfile مخصوص runtime ناهمخوان شوند، توقف می‌کند.
- `preflight` صرفاً تنظیمات، وجود فایل‌ها و شرایط وابسته به نقش worker را بررسی می‌کند؛ در صورت اجرای `--check-db` اتصال واقعی و وجود جدول‌ها و ستون‌های schema را نیز می‌سنجد. خطاها فقط با نام تنظیمات نامعتبر چاپ می‌شوند؛ secret و connection string در خروجی نیست. کارکرد واقعی Steam، STRATZ، OpenDota، S3، Java و ریپلی فقط روی سروری با credentials و سرویس‌های واقعی قابل تأیید است.
- واحدهای sync، images، STRATZ، performance-reference و OpenDota parse اکنون به `dota2notes-api.service` وابسته‌اند. unit اصلی از runtime production، ابتدا `preflight --check-db` و سپس Express را اجرا می‌کند. ریپلی نیز از `release/scripts/replay-parser` اجرا می‌شود. سرویس Next فعلی برای دورهٔ مهاجرت می‌تواند باقی بماند؛ API و workerها وابسته به آن نیستند.
- `API_PUBLIC_ORIGIN` آدرس عمومی بازگشت Steam است و در آینده می‌تواند مستقل از `APP_URL` سایت معرفی باشد. در دوره‌ای که کاربران همچنان از وب قدیمی وارد Steam می‌شوند، این متغیر را تنظیم نکنید تا callback روی آدرس اصلی و cookie قبلی کار کند. تغییر آن به `https://api.dota2notes.ir` باید همراه با تکمیل و تست handoff ورود دسکتاپ در مرحلهٔ بعد باشد؛ صرف داشتن یک زیردامنه ورود Steam در Tauri را کامل نمی‌کند. `deploy/nginx/api.dota2notes.ir.conf` فقط قالب host جدید است و پیش از دسترسی عمومی به DNS و TLS معتبر نیاز دارد.

## اجرا و بررسی محلی از روت پروژه

Node.js 24، PostgreSQL در دسترس، و `.env.local` روت مطابق `deploy/env.production.example` نیاز است. مقدارهای واقعی `DATABASE_URL`، `APP_URL` و `SYNC_WORKER_SECRET` را در فایل شخصی قرار دهید. کلیدهای سرویس‌های خارجی در مسیرهای مربوط به آن‌ها لازم‌اند. هیچ فایل secret شخصی داخل پچ نیست.

```sh
npm install
npm run build -w @dota-notes/api
npm run release:prepare -w @dota-notes/api
npm ci --prefix apps/api/release --workspaces=false
npm run db:migrate --prefix apps/api/release --workspaces=false
npm run preflight --prefix apps/api/release --workspaces=false -- --check-db
npm run start --prefix apps/api/release --workspaces=false
```

`db:migrate` از تاریخچهٔ Drizzle استفاده می‌کند. قبل از اجرای آن روی دیتابیس مهم، نسخهٔ پشتیبان معمول دیتابیس را داشته باشید. schema نسخهٔ قدیمی با migration جدید `0024_express_monthly_sync.sql` سازگار است؛ این migration ستون nullable برای cooldown ماهانه اضافه می‌کند. اینجا دیتابیس واقعی کاربر migrate نشده است. پس از بالا آمدن سرویس، `/health/live` باید ۲۰۰ و `/health/ready` در صورت تطابق schema باید ۲۰۰ بدهند.

برای دیدن رفتار در حالت توسعه، `npm run dev -w @dota-notes/api` کافی است. صف دریافت مچ برای پردازش به worker مستقل یا timer مربوط نیاز دارد؛ `npm run worker -w @dota-notes/api -- sync --watch` در ترمینال دیگر اجرا می‌شود. سرور production علاوه بر API به PostgreSQL، سرویس‌های worker و تنظیمات واقعی ذخیره‌سازی/Parser متناسب با قابلیت‌ها نیاز دارد.

## اعتبارسنجی این پچ

| بررسی | نتیجه |
| --- | --- |
| API build و typecheck | موفق |
| تست بک‌اند | ۳۶۵ تست در ۵۸ فایل، موفق؛ با مقدار قدیمی `OPENDOTA_MANUAL_SYNC_COOLDOWN_SECONDS=300` نیز بررسی شد |
| typecheck و تست وب ارسالی | موفق؛ ۲۷۳ تست در ۵۲ فایل |
| build وب ارسالی | موفق با webpack و shim فقط محیط sandbox برای خواندن حافظهٔ Node؛ shim داخل پچ نیست |
| نصب `release` با `npm ci` | موفق؛ ۱۲۶ پکیج runtime بدون Next.js یا ابزار توسعه |
| اجرای runtime مستقل | preflight و ۶ درخواست HTTP موفق؛ readiness با PostgreSQL آزمایشیِ خاموش ۵۰۳ داده است |
| بررسی SQL قدیمی و routeها | ۲۴ migration اصلی بدون تغییر، ۳۹ route و ۴۹ عملیات ثبت‌شده |
| audit dependencyهای production | صفر مورد گزارش‌شده |

این مرحله بک‌اند را برای VPS آماده می‌کند، اما به VPS کاربر دسترسی یا deploy انجام نشده است. اتصال کامل Tauri به API و بازگشت Steam از مرورگر به دسکتاپ، استقرار VPS، TLS زیردامنه، و حذف سرویس Next قدیمی مراحل بعدی هستند. فایل‌های داخل این پچ به نسبت روت پروژه مسیرگذاری شده‌اند.
