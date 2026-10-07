# نتیجهٔ بررسی مرحلهٔ اول چندسکویی

مبنا: `dcb721e03174376eca62629d28c6cd12de0c1f8c`؛ شاخهٔ محلی `chore/monorepo-desktop-foundation`.
این بررسی در محیط Linux توسعه انجام شده و ادعای استقرار یا عملکرد دادهٔ واقعی نیست.

| بررسی | نتیجه |
| --- | --- |
| نصب مجدد از lockfile با `npm ci --ignore-scripts` | موفق؛ ۷۸۱ package |
| تست‌های وب فعلی پس از انتقال | ۲۷۳ تست در ۵۲ فایل موفق |
| تست‌های جدید | ۹ تست در ۴ فایل موفق؛ ترجیحات/RTL/System، تعامل دسکتاپ و یادداشت، پاسخ و خطای API، CORS و مرز Express |
| TypeScript | هر چهار app و سه package موفق |
| `desktop:build` | موفق؛ JS حدود ۳۰۵KB و ۹۵KB gzip، CSS حدود ۱۵KB و ۴KB gzip، بدون احتساب تصاویر/فونت |
| `api:build` و اجرای process ساخته‌شده | موفق؛ health v1 پاسخ صحیح داد |
| Metro export برای Android و iOS | هر دو موفق؛ bytecode و export JS برای بررسی resolver ساخته شدند |
| React در bundle موبایل | فقط patch موردنیاز موبایل 19.2.3؛ نسخهٔ React وب وارد bundle نمی‌شود |
| تنظیمات Tauri | schema رسمی CLI نصب‌شده تأیید شد؛ CLI برنامه و مسیرهای build را شناخت |
| وب ساخته‌شده | صفحه‌های `/` و `/journal`، فایل فونت و تصویر هیرو ۲۰۰؛ `/me` بدون نشست به `/journal` با ۳۰۷ می‌رود؛ صفحهٔ معرفی canvas قدیمی را ندارد |
| تفاوت‌های Git | بررسی whitespace موفق؛ Cloudflare Worker و محتوای migrationها تغییر نکرده‌اند |

## محدودیت build وب در این محیط

`npm run build` پیش‌فرض Next/Turbopack در این محیط با `ENOENT uv_resident_set_memory` متوقف می‌شود؛
این محیط به آمار RSS دسترسی ندارد و همین خطا قبل از این تغییر نیز وجود داشت.
برای بررسی واقعی کامپایل، یک preload **موقت و خارج از مخزن** فقط خواندن RSS ناموجود را جایگزین کرد و
`next build --webpack` اجرا شد: کامپایل، TypeScript، تولید صفحات و build traces موفق بودند.
shim در Git/ZIP نیست و برای VPS پیشنهاد نشده است. build پیش‌فرض باید در CI یا VPS معمولی نیز اجرا شود.

## بررسی‌های انجام‌نشده

- Rust/Cargo و کتابخانهٔ WebView لینوکس در این محیط نصب نیستند؛ binary ویندوز یا NSIS ساخته نشده است.
- اجرای واقعی Windows، تست بصری مرورگر، مصرف RAM و تأخیر UI روی لپ‌تاپ انجام نشده‌اند؛ تعامل‌ها با JSDOM بررسی شدند.
- export موفق موبایل معادل نصب و اجرای دستگاه Android/iOS یا build از Xcode/Gradle نیست.
- ورود واقعی Steam، Valve/OpenDota/ParsPack و اجرای timerهای VPS بررسی نشده‌اند؛ secret و دسترسی production استفاده نشده است.
- scaffold Express فقط سلامت process را نشان می‌دهد و readiness دیتابیس یا صف را تضمین نمی‌کند.

پیش از merge/deploy، روی Windows `npm run desktop:tauri` و بررسی ظاهری را انجام دهید؛ روی Linux معمولی/CI
build پیش‌فرض وب را بگیرید. دستورهای Git و اولین نصب unitهای جدید در [راهنمای مرحله](monorepo-desktop-foundation.md) هستند.

## اصلاحیهٔ lockfile پس از لاگ Windows

بستهٔ اولیهٔ v2 با npm 11.9 بررسی شده بود، اما خطای `Missing: @esbuild/*@0.28.2` با npm 11.6.2
و تنظیم انتخاب packageهای Windows بازتولید شد. lockfile در workspace بدون node_modules با npm 11.6.2
اصلاح شد؛ versionهای وابستگی‌های موجود و manifest برنامه‌ها تغییر نکردند.

- انتخاب packageهای Windows x64 در dry-run نصب با npm 11.6.2 و 11.9 موفق شد؛ این بررسی اجرای Windows واقعی نیست.
- نصب واقعی `npm ci` با npm 11.6.2 روی Linux، بدون `--ignore-scripts`، موفق شد: ۷۷۹ package.
- پس از نصب جدید، ۲۸۲ تست و typecheck همهٔ workspaceها و build فرانت دسکتاپ/Express دوباره موفق شدند.
- CI به ماتریس Windows/Linux با بررسی نصب در npm 11.6.2 توسعه یافت؛ اجرای این CI بعد از push کاربر انجام می‌شود.

بستهٔ اصلاحیه روی v2 اعمال‌شده کپی می‌شود؛ اسکریپت اولیهٔ جابه‌جایی روی checkout تغییرکرده دوباره اجرا نمی‌شود.
ترجیح tag انتشار در [releasing.md](releasing.md) ثبت شده و هنوز tag یا انتشار جدید ایجاد نشده است.

## اصلاحیهٔ مهلت تست تصاویر پس از نصب موفق Windows

لاگ Windows با npm 11.6.2 نصب موفق `npm ci` را تأیید کرد. اجرای تست وب با ۲۷۲ تست موفق و یک شکست
به علت عبور تست تولید سه تصویر واقعی WebP از مهلت پیش‌فرض ۵ ثانیه متوقف شد؛ بنابراین تست‌های جدید ریشه اجرا نشدند.

فقط مهلت همان تست در `apps/web/tests/match-image-renderer.test.ts` به ۳۰ ثانیه افزایش یافت.
تمام assertionهای تعداد تصاویر، اعتبار bytes، فرمت WebP و ابعاد 1280×720 حفظ شده‌اند؛ کد renderer،
کیفیت تصاویر، مهلت عملیاتی سرویس و مهلت سایر تست‌ها تغییر نکردند. این اصلاح ادعای بهبود سرعت renderer نیست.

- تست مستقل تصاویر: هر ۶ تست روی Linux موفق شد.
- اجرای کامل `npm test` پس از اصلاح: ۲۷۳ تست وب و ۹ تست ریشه، همگی روی Linux موفق شدند.
- نتیجهٔ تست اصلاح‌شده روی Windows هنوز تأیید نشده است؛ پس از کپی اصلاحیه، `npm test` دوباره اجرا شود.
- مبنا با fetch مجدد بررسی شد؛ `origin/main` همچنان `dcb721e03174376eca62629d28c6cd12de0c1f8c` بود.
