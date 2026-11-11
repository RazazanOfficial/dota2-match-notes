# فهرست مستندات

مبنای تطبیق این مجموعه سورس `main` در `0ab8d82` است. وضعیت زنده سرورها جدا از مستندات ثبت می شود.
برای کار عملیاتی فقط راهنماهای جاری جدول اول استفاده شوند.

## راهنماهای جاری

| موضوع | مرجع |
| --- | --- |
| شروع کار، قرارداد همکاری و مسیرهای کد | [HANDOFF](HANDOFF.md) |
| نقش ایران، آلمان، دیتابیس و tunnel | [معماری دو VPS](two-vps-architecture.fa.md) |
| نصب اولیه یا بازسازی زیرساخت، فقط در صورت نیاز | [آماده سازی](two-vps-bootstrap.fa.md) |
| Windows: pull، branch، Copy/Replace و سپس استقرار عادی | [استقرار](deployment-ubuntu.md) |
| env نقش ها، DB واقعی و unitهای فعال/بازنشسته | [تنظیمات و سرویس ها](environment-and-services.fa.md) |
| دریافت خودکار، GSI، Companion و Fetch دستی | [کشف مچ](automatic-match-discovery.fa.md) |
| assets، manifest، ساخت نصاب و پاکسازی کامل تست | [رسانه و نصب](desktop-assets-and-install.fa.md) |
| ریپلی، parse/archive مستقل، اولویت و ticket | [دانلود مستقیم](direct-replay-download.fa.md) |
| نصب اول، مچ خودکار، دو گروه پنج مچی و هماهنگی UI | [پذیرش](acceptance-tests.fa.md) |
| قطع SSH، build، schema، GSI و دانلود | [عیب یابی](troubleshooting.fa.md) |
| snapshot مانیتور و تفسیر وضعیت compute | [مانیتور](service-monitoring.md) |
| tag، نسخه ها و یادداشت انتشار | [انتشار](releasing.md) |
| ساختار workspaceها | [چندسکویی](multiplatform-architecture.md) |
| بازبینی سورس، مستندات و فهرست تمام فایل ها | [گزارش بازبینی](documentation-review-2026-11.fa.md) |

## قراردادهای تخصصی و برنامه توسعه

| موضوع | مرجع |
| --- | --- |
| محاسبات مرجع آماری | [ماهانه](monthly-reference-services.md) و [weekly Meta](weekly-meta-reference.fa.md) |
| تشخیص STRATZ در compute | [ابزار تشخیص](stratz-connectivity-diagnostics.fa.md) |
| امتیازدهی و Lane | [Performance V3](match-performance-analysis-v3-spec.md)، [Phase 2](performance-scoring-phase2.md)، [Lane](lane-efficiency-next-step.md) |
| UI و نشانگر | [طراحی](ui-ux-redesign.md) و [cursor](cursor-themes.md) |
| برنامه آینده | [Learn & Practice](learn-and-practice-feature-todo.fa.md) |
| نمونه های اندازه گیری شبکه، با تاریخ و محدودیت | [اندازه گیری ۵ نوامبر](network-baseline-2026-11.fa.md) |
| مجوز third party | [React Bits](third-party/react-bits-LICENSE.md) |

## سابقه و سندهای مرحله ای

یادداشت های مرحله ای ریشه docs با برچسب «سابقه» نگهداری شده اند؛ قرارداد و نتیجه تست همان تغییر را ثبت می کنند.
دستورهای اجرایی منسوخ آنها حذف و به استقرار جاری ارجاع داده شده اند. ترتیب و تعداد تست، timer یا محل سرویس متن تاریخی مرجع نصب امروز نیست.
نام و طبقه بندی هر Markdown در [فهرست کامل بازبینی](documentation-review-2026-11.fa.md) آمده است.

- [استقرار تک VPS](history/deployment-single-vps.md) و [handoff تک VPS](history/handoff-single-vps.md) فقط تاریخچه اند.
- [validation دو VPS](validation-two-vps.fa.md) و [validation کتابخانه خودکار](validation-automatic-library.fa.md) نتایج بسته زمان خودشان اند.
- [راهنمای کتابخانه خودکار](deploy-automatic-library.fa.md) اکنون ورودی کوتاه به راهنماهای جاری است، نه دستور نصب دوباره patch قدیمی.
- `apps/web/docs` فقط لینک سازگاری به همین مجموعه دارد؛ نسخه دوم عملیاتی نگهداری نمی شود.

## قواعد نگهداری

راهنمای عملیاتی در یک محل نوشته شود؛ سند قابلیت برای دستور انتشار به آن لینک بدهد.
تغییر route، env، migration، unit، manifest یا قابلیت نصب باید همراه سند مرتبط بازبینی شود.
نتیجه تست با SHA، محیط، pass/skipped و محدودیت ثبت شود؛ نتیجه قدیمی به زمان حال تبدیل نشود.
فایل ها UTF-8 و LF مطابق `.gitattributes` باشند؛ Markdown و مجوزها نباید secret یا اطلاعات خصوصی محیط داشته باشند.
