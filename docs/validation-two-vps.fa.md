# گزارش اعتبارسنجی تغییر دو VPS

## مبنا و دامنه

مبنای GitHub main: `072e48b27bfdf9bcb6ae9a925fac5136ed4cc3cd`.
main در پایان بازبینی نیز همین کامیت بود. commit، push یا تغییر زنده VPS انجام نشده است.
ZIP فقط فایل های تغییرکرده و جدید با مسیر نسبی ریپو دارد؛ باید پس از pull و ساخت
شاخه روی checkout موجود Copy/Replace شود. node_modules، dist، env خصوصی، dump و
کلید SSH در بسته نیستند. حذف فایل لازم نیست.

پیاده سازی: API عمومی و DB اصلی در ایران، workerها و دریافت خارجی در آلمان، پل
محدود SSH و API خصوصی، دانلود native مستقیم از پارس پک با ticket و SHA256.
GC، Telegram، کشف خودکار مچ، resume دانلود و failover جهانی اضافه نشده اند.

## بررسی روی checkout تمیز

یک checkout محلی تازه از همان کامیت مبنا ساخته شد؛ همه فایل های بسته با نسخه
بازبینی شده بایت به بایت تطبیق داشتند. محیط Node v24.22.1 و npm 11.9.0 بود.

| دستور | نتیجه |
| --- | --- |
| `npm ci --no-audit --no-fund` | exit 0؛ نصب 807 پکیج |
| `npx vitest run --maxWorkers=2` | exit 0؛ 617/617 تست در 86 فایل |
| `npm run test -w @dota-notes/api -- --maxWorkers=2` | exit 0؛ 501/501 تست در 71 فایل |
| `npm run test -w @dota-notes/web -- --maxWorkers=2` | exit 0؛ 279/279 تست در 52 فایل |
| `npm run typecheck` | exit 0؛ همه workspaceها |
| `npm run api:build` | exit 0 |
| `npm run release:prepare -w @dota-notes/api` | exit 0؛ runtime مستقل بازسازی شد |
| `npm ci --prefix apps/api/release --workspaces=false --no-audit --no-fund` | exit 0؛ نصب 128 پکیج |
| `npm run desktop:build` | exit 0؛ TypeScript و Vite |
| `cargo test --locked --manifest-path apps/desktop/native-tests/Cargo.toml -- --test-threads=1` | exit 0؛ 11/11 تست، doc-test صفر |
| `git diff --check` | exit 0 |
| تطبیق LF و فایل ها | هیچ CRLF و هیچ اختلاف سورس با checkout تمیز نبود |
| `npm run build` | exit 1؛ محدودیت محیط، توضیح پایین |

تست های جدول همپوشانی دارند؛ تعدادها نباید جمع شوند. `npm run test:desktop --
--maxWorkers=2` نیز در checkout کاری 212/212 پاس شد؛ همان تست های دسکتاپ در مجموعه
617 تایی checkout تمیز حضور دارند. suite مخصوص API فایل های mjs اضافی دارد.

تست های جدید نقش سرورها، مقصد ثابت loopback، توکن پل مستقل، عدم تکرار mutation،
حفظ session/cookie/body، قطع پردازش همراه با ادامه خواندن و enqueue محلی، عدم
استفاده از spool آلمان در ایران، وضعیت آرشیو و دانلود را پوشش می دهند. تست native
کد واقعی download-ticket و codec را بدون GUI وارد می کند: جداسازی bearer از storage،
محدودیت میزبان و اندازه، 401/409، هش و محتوای فشرده بررسی شدند.

## مواردی که پاس فرض نشده اند

build وب Next با `ENOENT: uv_resident_set_memory` متوقف شد. اجرای مستقل
`node -e 'console.log(process.memoryUsage())'` نیز همان خطا را داد؛ تلاش با webpack
هم همین نتیجه را داشت. هیچ shim یا عدد ساختگی حافظه برای سبز کردن build اضافه
نشد. build وب باید روی سیستم معمولی یا VPS، پیش از شروع سرویس، موفق شود.

نصاب کامل Windows و مجموعه کامل GUI/Tauri در این محیط Linux ساخته یا اجرا نشدند.
11 تست Rust بالا جای ساخت نصاب نیستند. workflow ویندوز و راهنمای استقرار دستور
ساخت و تست کامل را دارند؛ این بررسی قبل از انتشار نصاب لازم است.

SSH واقعی بین VPSها، restore دیتابیس، کلیدهای تولید، مجوز واقعی S3، ارسال ایمیل،
دانلود واقعی از نصاب و زمان پردازش زنده اجرا نشده اند. تست های لوکال جای مرحله
پذیرش روی دو VPS را نمی گیرند. هیچ تضمین تازه ای برای مسیر ISP یا زمان آنالیز
از این تست ها نتیجه گرفته نشده است.

## اصلاحات حین بررسی

اجرای اولیه تست ریشه برای تست مقایسه خطای login از سقف پیش فرض 5 ثانیه گذشت.
تنظیم ریشه با timeout موجود suite API، یعنی 30 ثانیه، همسان شد؛ assertionها،
رمزنگاری و رفتار ورود تغییر نکردند. اجرای checkout تمیز با این تنظیم کامل پاس شد.

تنها dependency جدید npm، `@aws-sdk/s3-request-presigner@3.1131.0` است؛ نسخه dependency
های قبلی تغییر نکرد. در lock مستقل production، چهار ورودی devOptional مربوط به
PGlite و typeها از درخت تولید حذف شده اند؛ نصب مستقل و بررسی همخوانی runtime پاس شد.
`sha2` در Rust وابستگی مستقیم شد و harness مستقل تست native اضافه شد.

راهنماهای قدیمی حذف کورکورانه نشدند؛ نسخه عملیاتی قبلی در history نگهداری و
سندهای تکمیلی با مرجع جاری مشخص شدند. فایل های نهایی در
[two-vps-changed-files.txt](two-vps-changed-files.txt) فهرست شده اند.

مرحله بعد: [استقرار](deployment-ubuntu.md)، از Windows و سپس هر دو VPS، با توقف
writerها، حفظ DB قبلی، تایید health و HTTPS پیش از تغییر DNS و تست پذیرش واقعی.
