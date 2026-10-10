# راهنمای مستندات Dota2 Notes

برای شروع کار در چت تازه، ابتدا [handoff](HANDOFF.md) را بخوانید. این فایل وضعیت پروژه، قراردادهای کدنویسی، مسیرهای داده، روش Git و استقرار، خطاهای شناخته‌شده و ترتیب کار بعدی را به مستندات و کد وصل می‌کند. README ریشه برای معرفی و راه‌اندازی محلی است. **کد، migration و فایل unit در تعارض با سند قدیمی مرجع رفتار واقعی‌اند.** وضعیت VPS را از خروجی خود VPS باید تأیید کرد.

## راهنماهای جاری

| موضوع | فایل |
| --- | --- |
| مشخصات مچ در ریپلی و آموزش‌های دو زبانه (جاری) | [replay-match-tutorials.fa.md](replay-match-tutorials.fa.md) |
| رفع 400 جست‌وجوی ریپلی و Git/VPS | [replay-lookup-routing.fa.md](replay-lookup-routing.fa.md) |
| راهنمای ریپلی، اجرای دوتا، وضعیت زنده و Git/VPS | [replay-setup-live-status.fa.md](replay-setup-live-status.fa.md) |
| چیدمان جمع‌وجور، نسبت پنجره، Clarity و Git/VPS | [resizable-match-workspace.fa.md](resizable-match-workspace.fa.md) |
| مرحلهٔ قبلی اندازهٔ ثابت پنجره و باف (رفتار پنجره/جدول جایگزین شده) | [fixed-window-loadout.fa.md](fixed-window-loadout.fa.md) |
| کش آفلاین، جدول آیتم/باف، فیلتر نمودار و Git/VPS | [offline-match-workspace.fa.md](offline-match-workspace.fa.md) |
| پوزیشن ساپورت‌های چرخشی، ساعت ۲۴ ساعته، گزارش نمایشی و Git/VPS | [support-position-time-ui.fa.md](support-position-time-ui.fa.md) |
| اعتبارسنجی ID صفر ریپلی، خطا/پیشرفت تحلیل و استقرار روی VPS موجود | [replay-validation-progress.fa.md](replay-validation-progress.fa.md) |
| فولدربندی جدید، دسکتاپ و اولین انتشار monorepo | [monorepo-desktop-foundation.md](monorepo-desktop-foundation.md) |
| نسخه‌گذاری، tag و انتشار قطعی | [releasing.md](releasing.md) |
| استقرار و انتشار Ubuntu | [deployment-ubuntu.md](deployment-ubuntu.md) |
| دریافت Replay، آرشیو و ParsPack | [replay-on-demand-archive.md](replay-on-demand-archive.md)، [replay-download-admin-stage.md](replay-download-admin-stage.md) |
| بازسازی metadata ناقص و retry | [replay-metadata-recovery.md](replay-metadata-recovery.md) |
| پایداری اتصال و checkpoint دانلود | [replay-resilience.md](replay-resilience.md)، فقط بخش «رفتار و محدودیت‌ها»؛ دستورات Git و نصب تاریخی‌اند |
| Worker خصوصی Cloudflare | [replay-proxy-cloudflare.md](replay-proxy-cloudflare.md)، با تطبیق کد Worker و وضعیت واقعی حساب |
| مرجع آماری ماهانه | [monthly-reference-services.md](monthly-reference-services.md)، [service-monitoring.md](service-monitoring.md) |
| قرارداد پچ Lane Efficiency دقیقهٔ ۱۲ | [lane-efficiency-next-step.md](lane-efficiency-next-step.md)؛ حضور پچ در `main` را بررسی کنید. برای پوزیشن و نقش، `apps/web/lib/dota/position-resolver.ts` و `apps/web/lib/journal/repository.ts` |
| محصول و رابط | [ui-ux-redesign.md](ui-ux-redesign.md)، [cursor-themes.md](cursor-themes.md)، [multiplatform-architecture.md](multiplatform-architecture.md) |

## سندهای مرحله‌ای و تاریخی

| سند | کاربرد امروز |
| --- | --- |
| [replay-parser-stage1.md](replay-parser-stage1.md) | قرارداد منشأ داده و تاریخچهٔ parser؛ روش ورود دستی فایل جاری نیست. |
| [replay-queue-stage2.md](replay-queue-stage2.md) | تاریخچهٔ صف اولیه؛ دستورهای `incoming` دستی و کشف خودکار Match جاری نیستند. |
| [match-performance-analysis-v3-spec.md](match-performance-analysis-v3-spec.md) | چشم‌انداز و قواعد محصول؛ زمان‌بندی ۷۲ ساعته و قرارداد قدیمی Lane مبنای عملیاتی نیست. |
| [performance-scoring-phase2.md](performance-scoring-phase2.md) | دلیل طراحی Score، Lane Impact و Vision؛ قرارداد وزن/بازهٔ Lane Efficiency را از سند جاری بالا بخوانید. |

در هر تغییر، README و سند جاری مربوط را هم‌زمان با کد به‌روز کنید. اگر یک سند مرحله‌ای را برای سابقه نگه می‌دارید، وضعیت تاریخی آن را در بالای همان فایل روشن بنویسید.
