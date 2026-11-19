# تحویل جاری پروژه

مبنای این بازبینی `0ab8d82beef0f790aea40b7fd42fddf44272518d` از `main` است.
این SHA مبنای خواندن سورس است؛ موفق بودن استقرار هر میزبان باید جدا با خروجی همان میزبان ثبت شود.
برای شروع از [فهرست مستندات](README.md) و [معماری](two-vps-architecture.fa.md) استفاده کن.

## قرارداد کار و تحویل

- ویندوز: checkout موجود، `pull` روی main، شاخه با الگوی `fix/<topic>` یا `feat/<topic>`، Copy/Replace و بررسی؛ سپس commit، push و merge با `--no-ff` را خود MeriJ انجام می دهد، نه عامل.
- VPS: همان checkout و کاربر `dota2notes`؛ Git همیشه با همین کاربر و `--no-pager` اجرا شود.
- اجرای پس زمینه با `nohup` راه بازیابی موردی یک نشست قطع شده بود؛ جزو استقرار عادی نیست.
- نصب مجدد OS، clone دوباره، `reset --hard`، `git clean` یا حذف دیتابیس بخشی از آپدیت نیست.
- رمز، env، dump، کلید خصوصی، device config و URL امضاشده وارد Git، ZIP یا گزارش عمومی نشوند.
- تغییر سرویس های دیگر مانند TeamSpeak جزو این پروژه و این راهنمای استقرار نیست.
- تغییر مستندات به تنهایی به بیلد، migration، restart یا نصاب جدید نیاز ندارد.

## نصب موجود

| مورد | ایران | آلمان |
| --- | --- | --- |
| IP | `87.107.165.50` | `143.20.60.45` |
| نقش | `app` | `compute` |
| SSH در نصب فعلی | `9011` | `9011` |
| سورس | `/var/www/dota2notes` | همان مسیر |
| env خصوصی | `/var/www/dota2notes/.env.production` | همان مسیر، با مقادیر نقش compute |
| دیتابیس | `dota_notes`؛ مالک `dota_notes_app` | اتصال به همان DB با `dota_notes_compute` |
| API | `127.0.0.1:4100` | `127.0.0.1:4100`، خصوصی |
| وب | Next روی `127.0.0.1:3000` | لازم نیست |

این جدول اطلاعات نصب شناخته شده است، نه مقدار مناسب برای هر محیط تازه.
نام `dota_notes_primary` در طرح مهاجرت اولیه پیشنهاد شده بود؛ DB فعلی را برای هماهنگ شدن با آن نساز یا تغییر نام نده.

## قابلیت های فعلی و مرز آنها

- Companion مستقل با Task Scheduler، GSI محلی و outbox؛ بستن UI آن را متوقف نمی کند.
- ثبت پایان بازی در ایران و دریافت اطلاعات توسط آلمان؛ شروع معمول پنج دقیقه بعد از رویداد و retry محدود.
- دریافت دوره ای سرور و Fetch دستی برای بازی روی سیستم دیگر یا رویداد جا افتاده باقی هستند.
- تاریخچه دستی snapshot دارد؛ مچ موجود دوباره وارد نمی شود و کش معتبر جزئیات قابل استفاده است. کشف شناسه های تازه همچنان ممکن است درخواست خارجی لازم داشته باشد.
- assets پیش از ورود بررسی و دریافت می شوند؛ لوگو، فونت و فایل های ضروری داخل نصب می مانند.
- تشخیص مسیر Steam/Dota خودکار است؛ مسیر پیش از دانلود اعتبارسنجی و انتخاب دستی به عنوان fallback حفظ می شود.
- parse و archive مستقل اند؛ درخواست دانلود اولویت آماده سازی/آرشیو می گیرد و منتظر همه تحلیل ها نمی ماند.
- وضعیت مشترک تسک، نسخه درخواست و انیمیشن کوتاه مرحله ها؛ درصد یا سرعت ساختگی نداریم.
- GC client اختصاصی، بات Telegram، resume بایتی و failover جهانی پیاده نشده اند.

## نگاشت کد

| موضوع | مرجع سورس |
| --- | --- |
| نقش، مسیرهای compute و اعتبارسنجی topology | `apps/api/src/runtime/topology.ts` |
| پل خصوصی و timeout | `apps/api/src/http/compute-proxy.ts` |
| tick و daemon | `apps/api/scripts/worker.ts` |
| دریافت دستی و کش تاریخچه | `apps/api/src/lib/sync/manual-service.ts` و `apps/api/src/lib/opendota/service.ts` |
| دستگاه و رویداد مچ | `apps/api/src/lib/sync/companion.ts` و مسیرهای `routes/sync/` |
| صف های آماده سازی، parse و archive | `apps/api/scripts/replay-parser/run-pipeline.mjs` |
| وضعیت و download ticket | `apps/api/src/lib/replay/job-repository.ts` و `download-ticket.ts` |
| رسانه و manifest | `apps/desktop/scripts/asset-pack.mjs` و `src-tauri/src/asset_cache.rs` |
| تشخیص بازی و Companion | `apps/desktop/src-tauri/src/steam_paths.rs` و `companion_core.rs` |
| وضعیت مشترک UI | `apps/desktop/src/taskManager.ts` و `useLiveMatch.ts` |

## وضعیت و بررسی های باقی مانده

### Performance و Lane · تغییرات محلی 2026-11-19

- شاخهٔ کار: `feat/performance-lane-workspace`؛ پوستهٔ Performance دسکتاپ و صفحهٔ Lane بازطراحی شده‌اند. قرارداد جاری محاسبه، دادهٔ ناقص، Join مکانی و تغییر نقش در [Lane](lane-efficiency-next-step.md) ثبت شده است.
- Lane فقط از استخراج v2 در ثانیهٔ 600 استفاده می‌کند؛ مرجع STRATZ از `time11` خوانده می‌شود. نسبت‌گیری معیارهای موجود، وزن‌های جدید Pos2/3 و پاداشِ مبتنی بر حضور نزدیک actor و target پیاده شده‌اند. کش تحلیل قدیمی و projection تاریخچهٔ نسخهٔ قبل برای این قرارداد معتبر نیستند.
- بررسی محلی: 81 تست مرتبط پاس؛ API build، desktop build، web typecheck و Next production build پاس؛ ظاهر واقعی در Chrome با fixture، fa/en و عرض‌های 800/1280/1480، همراه با حالت ناقص/قدیمی، تغییر نقش و کیبورد بررسی شد. تست‌های عمومی نامرتبط، native/installer و بررسی زندهٔ VPS اجرا نشده‌اند.
- بررسی نهایی انتشار، هشدار امنیتی Next.js 16.4.3 را پیدا کرد؛ فقط Next وب و بسته‌های همراه آن به نسخهٔ اصلاحی 16.4.5 ارتقا یافتند و بیلد production وب پاس شد. اطلاعات lockfile پلتفرم‌های دیگر حفظ شده است؛ dependencyهای runtime API تغییر ندارند. [یادداشت رسمی اصلاحات](https://github.com/vercel/next.js/releases/tag/v16.4.5).
- `release:prepare` خروجی API را از سورس تولید کرده است. commit/push/merge و استقرار انجام نشده‌اند؛ این عملیات با MeriJ است. تغییرات قبلی Tauri schema/permissions خارج از این تسک حفظ شده‌اند.
- انتشار API و parser به میزبان‌های مربوط و انتشار کلاینت هنوز لازم است؛ schema جدید نداریم. Replayهای قدیمی به backfill صریح روی compute نیاز دارند؛ هیچ آرشیو یا مرجع ماهانه‌ای حذف نشده است. تأیید مختصات با JAR مستقر و Replay واقعی هنوز پذیرش عملیاتی است؛ نبود شاهد، پاداش حدسی تولید نمی‌کند.

timer مرجع آماری در نصب گزارش شده عمدا خاموش بوده است؛ انتشار عادی نباید خودکار آن را فعال کند.
موفقیت بیلد، فعال بودن daemon یا پاسخ health، موفقیت Steam/GSI، STRATZ، ایمیل و دانلود واقعی را ثابت نمی کند.
گزارش های validation تاریخ دار هستند؛ تعداد تست آنها معیار ثابت انتشارهای بعدی نیست.
[گزارش بازبینی](documentation-review-2026-11.fa.md) یافته های سورس و محدوده بررسی این نوبت را ثبت می کند.
