# انتقال کامل بک‌اند Next.js به Express

مبنای انتقال، ریپوی `RazazanOfficial/dota2-match-notes` در commit زیر است:

`dcb721e03174376eca62629d28c6cd12de0c1f8c`

بک‌اند در `apps/api` است و با Express اجرا می‌شود. نام پوشه لازم نیست `express` یا `backend` باشد. در پوشه ارسالی قبلی، API فقط health اولیه داشت؛ این پچ کنترلرها، منطق، دیتابیس و workerهای واقعی را اضافه می‌کند. `apps/desktop` در این پچ تغییر نکرده است؛ اتصال تمام صفحات دسکتاپ به API کار مستقلی است.

## پوشش و ساختار

- ۳۹ فایل route و ۴۹ عملیات HTTP نسخه اصلی، با حفظ مسیرهای `/api/...` در Express ثبت شده‌اند.
- ۱۲۱ ماژول اصلی شامل احراز هویت، مدیریت، ژورنال، hero pool، جست‌وجوی بازیکن، sync، تحلیل، scoring، lane/farm، position resolver، references، replay، storage و تصاویر منتقل شده‌اند. Express برای اجرای این منطق به Next.js وابسته نیست.
- دو endpoint اضافه، داده SSR پروفایل و صفحه مچ را فراهم می‌کنند: `GET /api/players/:identifier` و `GET /api/journal/matches/:matchId/page`. تعداد عملیات registry اکنون ۵۱ است.
- نسخه وب، APIها را به Express forward می‌کند. سه صفحه SSR دیگر به دیتابیس مستقیم وصل نمی‌شوند. helperها و typeهای قدیمی مورد نیاز فرانت‌اند ممکن است همچنان در web باشند؛ اجرای business handlerها در API انجام می‌شود.
- workerهای sync، images، STRATZ، performance-reference و OpenDota parse منتقل شده‌اند. worker مستقل replay، صف، retry، lease، resume، archive، metadata recovery، failover، کد Java و ابزار ساخت parser نیز موجودند. ۲۲ فایل اسکریپت اصلی حفظ شده‌اند.
- Nginx، systemd، فراخوانی worker و monitor برای API روی پورت ۴۱۰۰ و فرانت‌اند روی ۳۰۰۰ تنظیم شده‌اند. این فایل‌ها آماده استقرارند؛ هیچ سرویس واقعی نصب یا restart نشده است.

تمام مسیرهای اصلی:

| مسیر اصلی | متدها |
| --- | --- |
| `/api/admin/monthly-references` | GET, POST |
| `/api/admin/overview` | GET |
| `/api/admin/releases/[releaseId]` | PUT |
| `/api/admin/releases` | GET, POST |
| `/api/admin/replay-archive` | GET, POST |
| `/api/admin/replay-monitor` | GET |
| `/api/admin/service-monitor` | GET |
| `/api/admin/stratz-diagnostics` | GET |
| `/api/admin/users/[userId]/matches/reprocess` | POST |
| `/api/admin/users/[userId]/password` | PUT, DELETE |
| `/api/admin/users` | GET, POST |
| `/api/auth/logout` | POST |
| `/api/auth/password/login` | POST |
| `/api/auth/password/me` | PUT, DELETE |
| `/api/auth/session` | GET |
| `/api/auth/steam/callback` | GET |
| `/api/auth/steam` | GET |
| `/api/health` | GET |
| `/api/hero-pool/me` | GET, PUT |
| `/api/internal/images/tick` | POST |
| `/api/internal/opendota-parse/tick` | POST |
| `/api/internal/performance-reference/tick` | POST |
| `/api/internal/stratz/tick` | POST |
| `/api/internal/sync/tick` | POST |
| `/api/journal/days/[date]` | PUT |
| `/api/journal/me` | GET |
| `/api/journal/users/[handle]` | GET |
| `/api/matches/[matchId]/analysis` | GET, POST |
| `/api/matches/[matchId]/images` | GET |
| `/api/matches/[matchId]/opendota` | POST |
| `/api/matches/[matchId]/replay` | POST |
| `/api/releases/[releaseId]/read` | POST |
| `/api/releases` | GET |
| `/api/replays/[matchId]/analysis` | GET |
| `/api/replays/[matchId]/file` | GET |
| `/api/replays/[matchId]` | GET, POST |
| `/api/replays/lookup` | POST |
| `/api/sync/me` | GET, POST |
| `/api/users/search` | GET |

## قرارداد سازگاری

مسیرهای `/api/v1/...` نیز در دسترس‌اند. تنها استثنا، `GET /api/v1/health` است: پاسخ چهار فیلدی قدیمی desktop SDK با `status: foundation` و header deprecation برای سازگاری حفظ شده است. این واژه وضعیت فعلی پیاده‌سازی بک‌اند را توصیف نمی‌کند. وضعیت واقعی process در `/health/live`، آمادگی schema در `/health/ready` و اتصال دیتابیس در مسیر اصلی `/api/health` بررسی می‌شود.

ورود با cookie همان قرارداد وب را دارد. برای کلاینت native، `POST /api/auth/password/login?session=bearer` یک session token opaque و زمان انقضا برمی‌گرداند؛ آن را در `Authorization: Bearer ...` ارسال کنید. خروج، همان session را باطل می‌کند. Steam login همچنان redirect/cookie flow اصلی را دارد؛ تکمیل handoff مخصوص Tauri جزو این پچ نیست.

## دیتابیس و دریافت مچ

PostgreSQL و schema اصلی Drizzle حفظ شده‌اند. hash هر ۲۴ فایل SQL قبلی دقیقاً با ریپو یکسان است. migration جدید `0024_express_monthly_sync` فقط ستون nullable `users.last_month_sync_at` را اضافه می‌کند؛ جدول‌ها را recreate یا داده‌های قبلی را حذف نمی‌کند. migrator از history موجود و یک advisory lock روی همان connection استفاده می‌کند. `db:check` وجود تمام جدول‌ها و ستون‌های لازم را بررسی می‌کند؛ بررسی کامل type/index drift نیست.

بازه دریافت مچ از شنبه هفته ثبت‌نام، با timezone ژورنال، مجاز است. درخواست قبل از این محدوده پیش از مصرف cooldown یا ایجاد job رد می‌شود. دریافت روزانه ۹۰ ثانیه، هفتگی ۱۸۰ ثانیه و ماهانه ۷۲۰۰ ثانیه cooldown جدا دارد؛ برای تغییر مدت هر بازه به‌ترتیب از `OPENDOTA_MANUAL_DAY_COOLDOWN_SECONDS`، `OPENDOTA_MANUAL_WEEK_COOLDOWN_SECONDS` و `OPENDOTA_MANUAL_MONTH_COOLDOWN_SECONDS` استفاده می‌شود. متغیر قدیمی `OPENDOTA_MANUAL_SYNC_COOLDOWN_SECONDS` دیگر بر بازه هفتگی اثر ندارد. یک job فعال همچنان مانع اجرای هم‌زمان job دیگر می‌شود. بازه ماهانه حداکثر ۳۱ روز و داخل یک ماه میلادی است؛ تبدیل انتخاب ماه شمسی رابط کاربری به چند درخواست، در این پچ اضافه نشده است.

هیچ اتصال یا migration روی دیتابیس واقعی شما انجام نشده است؛ credentials آن در اختیار نبود. مسیر ارتقای دیتابیس قبلی با داده موجود، دو بار اجرای migration، و سرویس‌های واقعی API روی موتور PostgreSQL در PGlite تست شده‌اند. تست load، چند process و اجرای production PostgreSQL جداگانه انجام نشده است.

## اصلاحات امنیتی

- session token به صورت hash ذخیره می‌شود؛ password hash در پاسخ session منتشر نمی‌شود.
- خطای ورود ناموجود/رمز اشتباه یکسان است و محدودیت bcrypt بر اساس ۷۲ بایت UTF-8 رعایت می‌شود.
- اعتبارسنجی Origin برای عملیات cookie، CORS با originهای صریح، محدودیت body واقعی، جلوگیری از compressed/non-JSON body و rate limit در Express اضافه شده‌اند.
- IP headerهای دریافتی قابل اعتماد فرض نمی‌شوند؛ فقط proxyهای صریح `API_TRUST_PROXY` معتبرند. rate limit عمومی در هر process است؛ quota و قفل‌های اصلی دیتابیس حفظ شده‌اند.
- مسیرهای internal در gateway و Nginx، با پوشش نسخه v1 و تفاوت حروف، مسدودند. خود workerها همچنان secret مستقل لازم دارند.
- پیام‌های عمومی خطا و logهای API از نمایش SQL، token، password و پیام خام provider جلوگیری می‌کنند. درخواست غیرمجاز worker reference باعث ثبت failure در دیتابیس نمی‌شود.
- دانلود replay streaming است و backpressure/cancellation حفظ می‌شود.

این موارد رفع مشکلات شناسایی‌شده‌اند و ادعای ممیزی امنیتی مستقل یا تضمین نبود هر باگ ممکن نیستند.

## اعتبارسنجی انجام‌شده

| بررسی | نتیجه |
| --- | --- |
| build/typecheck بک‌اند | موفق |
| تست API و منطق منتقل‌شده | ۳۵۳ تست در ۵۷ فایل، موفق |
| اجرای فایل buildشده | ۷ بررسی موفق: health، session، admin و worker authorization |
| typecheck وب | موفق |
| تست‌های وب | ۲۷۳ تست در ۵۲ فایل، موفق |
| بیلد production وب با webpack | موفق؛ محیط sandbox به shim فقط محیطی برای خواندن حافظه Node نیاز داشت. آن shim در پچ نیست. بیلد عادی بدون این shim در همین sandbox موفق نبود. |
| audit پوشش انتقال | ۳۹ route، ۴۹ عملیات اصلی، ۱۲۱ ماژول، دو catalog، ۲۴ SQL بدون تغییر، بدون مورد مفقود |
| syntax اسکریپت‌های Node و shell | موفق |
| audit dependencyهای production API | صفر آسیب‌پذیری گزارش‌شده |

`backend-source-inventory.json` مبنا و `backend-migration-coverage.json` نتیجه بررسی ماشینی است. دستور audit، حضور فایل‌ها، exports، ثبت route، hashهای SQL/catalog و importهای backend را کنترل می‌کند؛ صرف موفقیت این audit به معنی اثبات برابری همه رفتارها نیست. تست‌های domain، transport، DB، stream و gateway شواهد رفتاری مکمل هستند.

سرویس زنده Steam/OpenDota/STRATZ/S3، parser JAR روی سرور، دانلود واقعی replay و استقرار Nginx/systemd با credentials شما در این محیط اجرا نشده‌اند. رفتار آن‌ها با تست‌ها و fixtureهای موجود بررسی شده است.

## تنظیمات و دستورهای اجرا از روت پروژه

root package، root lock، SDK مشترک و فایل env شخصی شما با این پچ جایگزین نمی‌شوند. `npm install` باید lock workspace موجود را با dependencyهای جدید هماهنگ کند. `.env.local` روت به صورت پیش‌فرض خوانده می‌شود؛ برای فایل دیگر از `DOTENV_CONFIG_PATH` استفاده کنید. نمونه env در `deploy/env.production.example` است؛ مقادیر واقعی و کلیدها را خودتان نگه دارید.

متغیرهای ضروری: `DATABASE_URL`، `APP_URL` و برای workerها `SYNC_WORKER_SECRET` معتبر. `API_PORT` پیش‌فرض ۴۱۰۰، `API_HOST` پیش‌فرض localhost و `API_INTERNAL_ORIGIN` پیش‌فرض `http://127.0.0.1:4100` است. origin واقعی desktop preview را در صورت اتصال، صریحاً به `API_ALLOWED_ORIGINS` اضافه کنید. `API_TRUST_PROXY` فقط برای proxy واقعی مورد اعتماد تنظیم شود. سایر provider/storage/parser envها مانند نسخه اصلی هستند.

```sh
npm install
npm run db:migrate -w @dota-notes/api
npm run db:check -w @dota-notes/api
npm run migration:audit -w @dota-notes/api
npm run typecheck -w @dota-notes/api
npm run test -w @dota-notes/api
npm run dev -w @dota-notes/api
```

برای اجرای production API، به جای دستور dev:

```sh
npm run build -w @dota-notes/api
npm run start -w @dota-notes/api
```

اجرای worker از روت، در process جدا:

```sh
npm run worker -w @dota-notes/api -- sync --watch
npm run worker -w @dota-notes/api -- images --watch
npm run worker -w @dota-notes/api -- stratz --watch
npm run worker -w @dota-notes/api -- performance-reference --watch
npm run worker -w @dota-notes/api -- opendota-parse --watch
npm run worker:replay -w @dota-notes/api
```

بدون `--watch`، worker HTTP یک tick اجرا می‌کند. روی VPS از timer/unitهای موجود استفاده کنید و workerهای watch هم‌زمان را اضافه نکنید. replay worker به env، مسیر قابل نوشتن و JAR قبلی نیاز دارد.

پچ مسیرهای SSR وب را مطابق ساختار monorepo قبلی داخل `apps/web/app/(journal)/...` قرار می‌دهد؛ APIهای وب داخل `apps/web/app/api` هستند. ZIP خروجی هیچ `node_modules`، فایل env شخصی یا build output ندارد.


## آمادگی استقلال بک‌اند

جزئیات مرحلهٔ اول و دستورهای release در `docs/phase-1-api-readiness.md` آمده است. در استقرار جدید، واحدهای systemd و اجرای production از `apps/api/release` استفاده می‌کنند و تنظیم `API_PUBLIC_ORIGIN` تا زمان تکمیل ورود Steam دسکتاپ اختیاری است.
