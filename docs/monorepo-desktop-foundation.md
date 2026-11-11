> سابقه تغییرات و قرارداد همان مرحله است. رفتار و دستور عملیاتی امروز در [معماری](two-vps-architecture.fa.md)، [استقرار](deployment-ubuntu.md)، [دریافت خودکار](automatic-match-discovery.fa.md) و [دانلود مستقیم](direct-replay-download.fa.md) آمده است. عدد تست و وضعیت VPS این متن تاریخی است.

# مرحله اول Monorepo و دسکتاپ

مبنای تغییر: آخرین `origin/main` با commit کامل `dcb721e03174376eca62629d28c6cd12de0c1f8c`.
شاخه تغییر: `chore/monorepo-desktop-foundation`. این سند برای **همین مرحله** است؛ انتقال کامل backend انجام نشده است.

## مرز برنامه ها

| برنامه | فناوری | مسئولیت اکنون |
| --- | --- | --- |
| `apps/web` | Next.js | معرفی در `/`، دفتر قبلی در `/journal`، API و workerهای فعلی |
| `apps/desktop` | Tauri 2 + React/Vite/Tailwind 4 | پنجره Native و فضای کار نمونه |
| `apps/mobile` | Expo SDK 57 + React Native 0.86 | scaffold مشترک Android/iOS |
| `apps/api` | Express 5 | health نسخه دار، Helmet، CORS allowlist و shutdown |

Expo و React Native دو اپ نیستند؛ Tauri نیز wrapper همین frontend دسکتاپ است.
بسته های قرارداد، client و design token زیر `packages` هستند. همه یک lockfile و نصب npm دارند.
وب و دسکتاپ React 19.2.4 فعلی را حفظ می کنند؛ موبایل React 19.2.3 مطابق renderer این Expo/RN دارد.
`apps/mobile/metro.config.cjs` همه importهای React در bundle موبایل، حتی از packageهای hoistشده،
را به نسخه خود موبایل resolve می کند تا دو React در یک app بارگذاری نشوند.
منطق دیتابیس، Steam، OpenDota و replay هنوز در `apps/web` باقی است؛ در مرحله بعد هر feature
با تست قرارداد به Express منتقل می شود. ساخت `domain` یا repositoryهای مشترک پیش از این انتقال لازم نبوده است.

## مسیرهای جابه جاشده

`app`، `components`، `data`، `lib`، `public`، `scripts`، `tests`، `drizzle` و تنظیمات Next/Drizzle/Vitest/TypeScript
به `apps/web` منتقل شده اند. صفحات قدیمی در route group `(journal)` هستند؛ خود group به URL اضافه نمی شود.
تنها صفحه اصلی دفتر به `/journal` منتقل شده است. بازگشت Steam و لینک های دفتر با همین مسیر هماهنگ اند.
`/match/...`، `/user/...`، `/admin` و `/api/...` آدرس قبلی خود را دارند.

env در ریشه است: Next با `@next/env` آن را از ریشه می خواند؛ Drizzle مسیر نسبی `DOTENV_CONFIG_PATH`
را از ریشه resolve می کند. parser از env موجود در systemd استفاده می کند. ذخیره replay و parser.jar در `/var/lib`
جابجا نشده اند. schema و محتوای SQL migrationها تغییر نکرده اند.

Workflow قدیمی GitHub Pages، که برای Next دارای API و دیتابیس مناسب نبود، با CI تست و build جایگزین شده است.
میزبانی وب همچنان VPS است؛ در این مرحله release عمومی یا deploy خودکار اضافه نشده است.

## دسکتاپ در این مرحله

- منوهای تحلیل، مچ ها، ریپلی، ژورنال و تنظیمات؛ جدول افقی تیم ها با فیلتر و انتخاب بازیکن.
- تب های نمای کلی، لین، خط زمان، بازیکنان و یادداشت با ناوبری صفحه کلید.
- سه palette: Obsidian / Radiant / Nebula؛ هر کدام Light / Dark / System.
- فارسی و انگلیسی؛ `lang` و `dir` واقعی و آینه شدن چیدمان؛ نام ها و اعداد با `bdi`.
- تنظیمات و یادداشت نمونه در localStorage دستگاه. نام کلیدها version دارند و تنظیمات خراب startup را نمی شکنند.
- بدون canvas متحرک پس زمینه و افکت blur سراسری؛ نمودار SVG سبک و UI با Tailwind/tokenها.
- پنجره با frame استاندارد سیستم عامل، حداقل 1024×700 و اندازه اولیه 1440×920.

**محدودیت صریح:** همه مقادیر بازی ساختگی اند و با علامت نمونه نمایش داده می شوند. ورود Steam Native،
درخواست دانلود/تحلیل واقعی و sync یادداشت هنوز پیاده نشده اند. صفحه Replay فقط نمونه وضعیت و دکمه بررسی
health Express محلی دارد؛ این دکمه job ایجاد نمی کند. معیار lag و مصرف RAM هنوز روی Windows اندازه گیری نشده است.

موبایل صفحه شروع با رنگ/زبان/حالت نمایش دارد؛ تنظیماتش هنوز persistent نیستند. این مرحله بازطراحی کامل موبایل نیست.

## اجرای Windows

Node 24، Rust stable با MSVC، Visual Studio Build Tools با workload `Desktop development with C++`
و WebView2 نصب باشند. [پیش نیازهای رسمی Tauri](https://v2.tauri.app/start/prerequisites/) مرجع نصب است.

از ریشه و در ترمینال های مستقل:

فرمان های اجرای این مرحله بازنشسته شده اند؛ برای دستور قابل اجرا از [راهنمای جاری](deployment-ubuntu.md) و برای آزمون از [پذیرش](acceptance-tests.fa.md) استفاده کن.

برای پیش نمایش بدون Rust:

فرمان های اجرای این مرحله بازنشسته شده اند؛ برای دستور قابل اجرا از [راهنمای جاری](deployment-ubuntu.md) و برای آزمون از [پذیرش](acceptance-tests.fa.md) استفاده کن.

برای دکمه health، نمونه `.env.example` را به `.env.local` ریشه کپی کنید و در ترمینال دیگر:

فرمان های اجرای این مرحله بازنشسته شده اند؛ برای دستور قابل اجرا از [راهنمای جاری](deployment-ubuntu.md) و برای آزمون از [پذیرش](acceptance-tests.fa.md) استفاده کن.

HTTP API پایه فقط روی loopback گوش می دهد. CORS فقط originهای تنظیم شده در `API_ALLOWED_ORIGINS`
را مجاز می کند و cookie مرورگر را به Native تعمیم نمی دهد. CSP دسکتاپ فقط شبکه health محلی را مجاز کرده است؛
قبل از اتصال VPS باید آدرس API و CSP هم زمان به آدرس production مشخص تغییر کنند.
Tauri قابلیت filesystem، shell یا اجرای فرمان به frontend نداده است.

Installer آزمایشی:

فرمان های اجرای این مرحله بازنشسته شده اند؛ برای دستور قابل اجرا از [راهنمای جاری](deployment-ubuntu.md) و برای آزمون از [پذیرش](acceptance-tests.fa.md) استفاده کن.

خروجی NSIS زیر `apps/desktop/src-tauri/target/release/bundle/nsis` است. نخستین build Rust فایل
`apps/desktop/src-tauri/Cargo.lock` را می سازد؛ آن را با همان نسخه toolchain پس از build موفق commit کنید.
Workflow دستی `Windows desktop test installer` نیز همین فرمان را روی Windows اجرا و artifact تولید می کند.
Installer فعلاً unsigned است؛ release عمومی، code signing و auto-update کارهای بعدی اند.

## دریافت ZIP و Git روی Windows

به علت جابه جایی فایل ها، صرفاً overwrite کردن ZIP کافی نیست؛ مسیرهای قبلی هم باید حذف شوند.
ZIP شامل فایل های تغییرکرده/جدید با مسیر نسبی مخزن و `.delivery/manifest.json` است.
اسکریپت Node در `.delivery/apply-delivery.mjs` ابتدا commit و تمیزی checkout و hash فایل های بسته را بررسی می کند،
سپس فقط فایل های قدیمی فهرست شده را حذف و فایل ها را کپی می کند. env، `.git`، node_modules و فایل های کاربر در فهرست نیستند.
اسکریپت با Node موجود در ابزار توسعه اجرا می شود و به تغییر ExecutionPolicy نیازی ندارد.
ZIP را در یک پوشه **خارج از مخزن** استخراج کنید و مسیر واقعی خودتان را جایگزین کنید.

فرمان های اجرای این مرحله بازنشسته شده اند؛ برای دستور قابل اجرا از [راهنمای جاری](deployment-ubuntu.md) و برای آزمون از [پذیرش](acceptance-tests.fa.md) استفاده کن.

commit پایه باید دقیقاً همان commit ابتدای سند باشد. اگر main جلو رفته است، اسکریپت توقف می کند؛ بسته باید
روی main جدید بازبینی شود. اسکریپت محتوا یا تغییرات محلی را force نمی کند. اگر نام branch از قبل وجود دارد،
branch قدیمی را حذف نکنید؛ وضعیت آن را بررسی و نام جدیدی انتخاب کنید.

پس از بررسی کد، ظاهر و تست ها:

فرمان های اجرای این مرحله بازنشسته شده اند؛ برای دستور قابل اجرا از [راهنمای جاری](deployment-ubuntu.md) و برای آزمون از [پذیرش](acceptance-tests.fa.md) استفاده کن.

`.delivery` داخل مخزن کپی نمی شود. این مرحله از این محیط commit، push یا deploy نشده است.

## ترتیب کار بعدی

۱. بررسی ظاهر و کارایی روی Windows واقعی و تثبیت طراحی؛ ۲. طراحی ورود Steam برای Native با مرورگر سیستم و
session مخصوص کلاینت؛ ۳. انتقال featureهای API به Express همراه تست قرارداد؛ ۴. اتصال مچ/صف/ژورنال دسکتاپ؛
۵. تولید Media از parse محلی؛ ۶. امضای installer و انتشار؛ سپس UI واقعی موبایل.
