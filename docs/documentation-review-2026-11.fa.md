# گزارش بازبینی سورس و مستندات، نوامبر ۲۰۲۶

## مبنا و دامنه

مبنای ثابت بازبینی `0ab8d82beef0f790aea40b7fd42fddf44272518d`، merge شاخه `feat/automatic-library` در main است.
هر ۷۹ فایل Markdown tracked این نسخه فهرست و از نظر مرجع جاری، تکرار، سابقه، فرمان های قدیمی و لینک بررسی شدند.
پس از این بازبینی هفت Markdown جدید داریم؛ فهرست کامل ۸۶ فایل در انتهای همین گزارش است.

بازبینی کد روی مسیرهای متاثر از دو VPS و قابلیت های اخیر متمرکز بود: topology/پل، ورود route، sync و companion، queue و archive، asset manifest، native download/Steam discovery، task manager، انیمیشن مراحل، unitها و CI.
این گزارش ادعای بازبینی خط به خط همه سورس مخزن، ممیزی امنیتی مستقل یا اثبات سلامت زنده همه providerها ندارد.

تمام تغییرات این بسته فقط `.md` هستند. runtime، env واقعی، dependency، lockfile، migration، JAR، Rust و تنظیم فعال سرورها تغییر نکرده اند؛ commit یا push انجام نشده است.

## اصلاحات انجام شده در اسناد

- استقرار عادی از مهاجرت اولیه جدا شد؛ DB نصب فعلی `dota_notes` ایران است و انتقال داده آلمان به DB تازه برای آپدیت تکرار نمی شود.
- روال همان pull، شاخه، Copy/Replace، بررسی و merge کاربر است. اجرای موردی پس زمینه در SSH روال دائمی نشده است.
- Git سرور با `sudo -u dota2notes -H` و `--no-pager` مستند شد؛ safe.directory برای root راه حل پیش فرض نیست.
- دو نقش و یک DB، tunnelهای loopback، HTTP allowlist و محدودیت قطع لینک روشن شدند.
- timerهای replay/sync قدیمی و enrichment بازنشسته از دستور انتشار جاری خارج شدند. مرجع آماری خاموش، خودکار فعال نمی شود.
- ترتیب انتشار assets پیش از `release:prepare` و ساخت Companion پیش از تست Tauri اصلاح شد.
- دریافت خودکار موجود از GC client و Telegram آینده تفکیک شد. GSI، credential دستگاه، زمان retry و fallback دستی/دوره ای مستند شدند.
- دانلود مستقیم پارس پک، archive مستقل از parse، اولویت محدود و تک انتقالی بودن کلاینت شرح داده شد.
- نصب پاک فقط برای تست، حفظ کش در uninstall عادی و سناریوهای دو گروه پنج مچی جدا شدند.
- ۱۸ Markdown تکراری `apps/web/docs` به لینک مرجع ریشه تبدیل شدند؛ فایل ها باقی اند تا لینک قبلی نشکند و Copy/Replace کافی باشد.
- یادداشت های مرحله ای قرارداد و نتیجه تاریخی را حفظ می کنند؛ فرمان های shell نصب قدیمی از آنها حذف شده است. دو سند تاریخچه نصب تک VPS فقط با برچسب صریح نگهداری شده اند.
- مجوز third party و اعداد گزارش شبکه دست نخورده اند. فایل فیزیکی حذف نشده و اسکریپت حذف لازم نیست.

## یافته های کد که با تغییر Markdown حل نمی شوند

| موضوع | شاهد سورس | نتیجه و اقدام بعدی |
| --- | --- | --- |
| اجرای shell در Windows | `apps/desktop/scripts/prepare-native.mjs` | `spawnSync` برای `npm run build` از `shell: true` استفاده می کند. آرگومان فعلی ثابت است؛ نشانه ای از ورودی کاربر در همان فراخوانی نیست. الگوی DEP0190 در تغییر کد جدا اصلاح شود، نه با مخفی کردن هشدار یا فرض اجرای مستقیم npm.cmd بدون shell. |
| سازگاری loader آینده | `apps/desktop/vite.config.ts` و `scripts/asset-plugin.ts` همان workspace | import بدون پسوند و JSON بدون import attribute با native loader آینده سازگار نیستند؛ loader فعلی در لاگ کاربر موفق بوده است. اصلاح به هماهنگی TypeScript و تست Windows نیاز دارد. |
| خطاهای راه اندازی GSI | `apps/desktop/src-tauri/src/companion.rs` و `companion_core.rs` | بعضی خطاهای install_gsi و اجرای اولیه task نادیده گرفته می شوند؛ موفق بودن UI به تنهایی رسیدن رویداد را ثابت نمی کند. برای بهبود قابل مشاهده بودن خطا، بررسی کد جدا مناسب است. فعلا سناریوی واقعی و راه عیب یابی صریح اضافه شده است. |
| مثال های env قدیمی | `deploy/env.app.example` و `deploy/env.compute.example` | نام DB پیشنهادی اولیه و scheduled sync خاموش باقی اند. این بسته آنها را تغییر نداده است؛ راهنمای جاری صریحا می گوید برای نصب فعلی از env موجود و جدول نقش ها استفاده شود. |
| کد مشترک Rust | `apps/desktop/src-tauri/src/companion_core.rs` | بعضی توابع در یکی از دو executable مصرف ندارند و dead_code می دهند؛ این به تنهایی نبودن اجرای Companion را ثابت نمی کند. تفکیک ماژول ها بهبود نگهداری است. |
| وضعیت نمایش و واقعیت سرور | `taskManager.ts`، `useLiveMatch.ts` و `useStageTransition.ts` در دسکتاپ | نسخه درخواست و زمان به روزتر، timer مستقل readiness و تاخیر نمایشی مرحله ها در کد وجود دارند. نتیجه واقعی دو سناریوی همزمان باید روی نصب منتشرشده ثبت شود؛ از روی سورس تضمین زمان ثابت نمی دهیم. |

هیچ یک از این موارد با تغییر پنهان رفتار برنامه یا تغییر تست برای سبز شدن برطرف اعلام نشده اند.
اینها شواهد جدید برای نسبت دادن خطای شبکه قبلی به VPS، اپراتور یا Cloudflare نیستند.

## اعتبارسنجی این بسته

| بررسی این نوبت | نتیجه |
| --- | --- |
| تمام Markdownهای مبنا / مجموعه نهایی | ۷۹ / ۸۶ |
| تغییر فایل موجود / فایل جدید | ۷۷ / ۷؛ فقط Markdown |
| لینک نسبی داخل مجموعه | همه مقصدها موجود؛ خطای لینک صفر |
| توازن code fence و UTF-8/LF | موفق؛ CRLF یا BOM اضافه نشده |
| syntax فرمان های Bash جاری | ۲۴ بلوک با `bash -n`؛ موفق |
| مسیر سورس در راهنماهای عملیاتی | ۴۰ مرجع موجود |
| manifest رسانه موجود | ۷۶۸ فایل؛ اندازه و SHA256 همه مطابق سورس |
| `git diff --check` | موفق |
| فایل اجرایی، dependency، env یا schema تغییرکرده | صفر |
| مجوز third party و اعداد گزارش شبکه | بدون تغییر |
تست های runtime تکرار نمی شوند، چون فایل اجرایی تغییر نکرده است. تست API/دسکتاپ و بیلد موفق گزارش قبلی، نتیجه اجرای دوباره در این نوبت محسوب نمی شوند.
دسترسی زنده به VPS یا اجرای PowerShell/NSIS در این بازبینی انجام نشده است. Bash فقط syntax-check می شود؛ فرمان های آن روی سرور اجرا نشده اند.

## روش اعمال همین بسته

این ZIP فقط Markdown جدید/تغییرکرده دارد و برای Copy/Replace روی همان مخزن موجود است.
روی main ابتدا pull، سپس شاخه `chore/documentation-refresh` بساز و فایل ها را با مسیر نسبی جایگزین کن.
لینک ها و `git diff --check` را بررسی و سپس طبق [روال Git](deployment-ubuntu.md) commit/push/merge کن.
اگر main از مبنا جلو رفته و روی همین اسناد تغییر جدید دارد، اختلاف ها باید حفظ و ادغام شوند؛ کپی کورکورانه نکن.
برای این بسته بیلد نصاب، migration، تغییر env، restart یا نصب مجدد برنامه لازم نیست.
بعد از merge می توان در فرصت مناسب فقط checkout سرورها را با main هماهنگ کرد؛ runtime موجود با تغییر `.md` عوض نمی شود.

## فهرست کامل Markdownها

| فایل | وضعیت پس از بازبینی |
| --- | --- |
| [README.md](../README.md) | مرجع جاری؛ بازنویسی و تطبیق با سورس |
| [apps/desktop/public/tutorials/README.md](../apps/desktop/public/tutorials/README.md) | مرجع جاری؛ بازنویسی و تطبیق با سورس |
| [apps/web/README.md](../apps/web/README.md) | مرجع جاری؛ بازنویسی و تطبیق با سورس |
| [apps/web/docs/HANDOFF.md](../apps/web/docs/HANDOFF.md) | نسخه تکراری حذف محتوایی؛ لینک به مرجع ریشه |
| [apps/web/docs/README.md](../apps/web/docs/README.md) | نسخه تکراری حذف محتوایی؛ لینک به مرجع ریشه |
| [apps/web/docs/cursor-themes.md](../apps/web/docs/cursor-themes.md) | نسخه تکراری حذف محتوایی؛ لینک به مرجع ریشه |
| [apps/web/docs/deployment-ubuntu.md](../apps/web/docs/deployment-ubuntu.md) | نسخه تکراری حذف محتوایی؛ لینک به مرجع ریشه |
| [apps/web/docs/lane-efficiency-next-step.md](../apps/web/docs/lane-efficiency-next-step.md) | نسخه تکراری حذف محتوایی؛ لینک به مرجع ریشه |
| [apps/web/docs/match-performance-analysis-v3-spec.md](../apps/web/docs/match-performance-analysis-v3-spec.md) | نسخه تکراری حذف محتوایی؛ لینک به مرجع ریشه |
| [apps/web/docs/monthly-reference-services.md](../apps/web/docs/monthly-reference-services.md) | نسخه تکراری حذف محتوایی؛ لینک به مرجع ریشه |
| [apps/web/docs/multiplatform-architecture.md](../apps/web/docs/multiplatform-architecture.md) | نسخه تکراری حذف محتوایی؛ لینک به مرجع ریشه |
| [apps/web/docs/performance-scoring-phase2.md](../apps/web/docs/performance-scoring-phase2.md) | نسخه تکراری حذف محتوایی؛ لینک به مرجع ریشه |
| [apps/web/docs/replay-download-admin-stage.md](../apps/web/docs/replay-download-admin-stage.md) | نسخه تکراری حذف محتوایی؛ لینک به مرجع ریشه |
| [apps/web/docs/replay-metadata-recovery.md](../apps/web/docs/replay-metadata-recovery.md) | نسخه تکراری حذف محتوایی؛ لینک به مرجع ریشه |
| [apps/web/docs/replay-on-demand-archive.md](../apps/web/docs/replay-on-demand-archive.md) | نسخه تکراری حذف محتوایی؛ لینک به مرجع ریشه |
| [apps/web/docs/replay-parser-stage1.md](../apps/web/docs/replay-parser-stage1.md) | نسخه تکراری حذف محتوایی؛ لینک به مرجع ریشه |
| [apps/web/docs/replay-proxy-cloudflare.md](../apps/web/docs/replay-proxy-cloudflare.md) | نسخه تکراری حذف محتوایی؛ لینک به مرجع ریشه |
| [apps/web/docs/replay-queue-stage2.md](../apps/web/docs/replay-queue-stage2.md) | نسخه تکراری حذف محتوایی؛ لینک به مرجع ریشه |
| [apps/web/docs/replay-resilience.md](../apps/web/docs/replay-resilience.md) | نسخه تکراری حذف محتوایی؛ لینک به مرجع ریشه |
| [apps/web/docs/service-monitoring.md](../apps/web/docs/service-monitoring.md) | نسخه تکراری حذف محتوایی؛ لینک به مرجع ریشه |
| [apps/web/docs/ui-ux-redesign.md](../apps/web/docs/ui-ux-redesign.md) | نسخه تکراری حذف محتوایی؛ لینک به مرجع ریشه |
| [docs/HANDOFF.md](HANDOFF.md) | مرجع جاری؛ بازنویسی و تطبیق با سورس |
| [docs/README.md](README.md) | مرجع جاری؛ بازنویسی و تطبیق با سورس |
| [docs/acceptance-tests.fa.md](acceptance-tests.fa.md) | راهنمای جاری یا گزارش جدید |
| [docs/automatic-match-discovery.fa.md](automatic-match-discovery.fa.md) | راهنمای جاری یا گزارش جدید |
| [docs/backend-migration.md](backend-migration.md) | سابقه تغییر؛ دستور اجرایی قدیمی بازنشسته شده |
| [docs/cursor-themes.md](cursor-themes.md) | قرارداد تخصصی؛ مرز عملیات و تاریخ روشن شده |
| [docs/dashboard-period-distribution.fa.md](dashboard-period-distribution.fa.md) | سابقه تغییر؛ دستور اجرایی قدیمی بازنشسته شده |
| [docs/dashboard-visuals.fa.md](dashboard-visuals.fa.md) | سابقه تغییر؛ دستور اجرایی قدیمی بازنشسته شده |
| [docs/deploy-automatic-library.fa.md](deploy-automatic-library.fa.md) | مرجع جاری؛ بازنویسی و تطبیق با سورس |
| [docs/deployment-ubuntu.md](deployment-ubuntu.md) | مرجع جاری؛ بازنویسی و تطبیق با سورس |
| [docs/desktop-assets-and-install.fa.md](desktop-assets-and-install.fa.md) | راهنمای جاری یا گزارش جدید |
| [docs/desktop-experience-overhaul.fa.md](desktop-experience-overhaul.fa.md) | سابقه تغییر؛ دستور اجرایی قدیمی بازنشسته شده |
| [docs/desktop-match-calendar-update.fa.md](desktop-match-calendar-update.fa.md) | سابقه تغییر؛ دستور اجرایی قدیمی بازنشسته شده |
| [docs/desktop-match-calendar-update.md](desktop-match-calendar-update.md) | سابقه تغییر؛ دستور اجرایی قدیمی بازنشسته شده |
| [docs/desktop-profile-admin.fa.md](desktop-profile-admin.fa.md) | سابقه تغییر؛ دستور اجرایی قدیمی بازنشسته شده |
| [docs/desktop-refinement.md](desktop-refinement.md) | سابقه تغییر؛ دستور اجرایی قدیمی بازنشسته شده |
| [docs/desktop-ui-redesign.md](desktop-ui-redesign.md) | سابقه تغییر؛ دستور اجرایی قدیمی بازنشسته شده |
| [docs/direct-replay-download.fa.md](direct-replay-download.fa.md) | مرجع جاری؛ بازنویسی و تطبیق با سورس |
| [docs/documentation-review-2026-11.fa.md](documentation-review-2026-11.fa.md) | راهنمای جاری یا گزارش جدید |
| [docs/environment-and-services.fa.md](environment-and-services.fa.md) | راهنمای جاری یا گزارش جدید |
| [docs/fixed-window-loadout.fa.md](fixed-window-loadout.fa.md) | سابقه تغییر؛ دستور اجرایی قدیمی بازنشسته شده |
| [docs/germany-direct-replay.fa.md](germany-direct-replay.fa.md) | سابقه تغییر؛ دستور اجرایی قدیمی بازنشسته شده |
| [docs/history/deployment-single-vps.md](history/deployment-single-vps.md) | تاریخچه؛ برچسب و اصلاح لینک |
| [docs/history/handoff-single-vps.md](history/handoff-single-vps.md) | تاریخچه؛ برچسب و اصلاح لینک |
| [docs/lane-efficiency-next-step.md](lane-efficiency-next-step.md) | قرارداد تخصصی؛ مرز عملیات و تاریخ روشن شده |
| [docs/learn-and-practice-feature-todo.fa.md](learn-and-practice-feature-todo.fa.md) | roadmap؛ تفکیک assets موجود از فیچرهای آینده |
| [docs/local-analysis-sync.fa.md](local-analysis-sync.fa.md) | سابقه تغییر؛ دستور اجرایی قدیمی بازنشسته شده |
| [docs/match-performance-analysis-v3-spec.md](match-performance-analysis-v3-spec.md) | قرارداد تخصصی؛ مرز عملیات و تاریخ روشن شده |
| [docs/match-quick-summary.fa.md](match-quick-summary.fa.md) | سابقه تغییر؛ دستور اجرایی قدیمی بازنشسته شده |
| [docs/monorepo-desktop-foundation.md](monorepo-desktop-foundation.md) | سابقه تغییر؛ دستور اجرایی قدیمی بازنشسته شده |
| [docs/monorepo-validation.md](monorepo-validation.md) | سابقه تغییر؛ دستور اجرایی قدیمی بازنشسته شده |
| [docs/monthly-reference-services.md](monthly-reference-services.md) | قرارداد تخصصی؛ مرز عملیات و تاریخ روشن شده |
| [docs/multiplatform-architecture.md](multiplatform-architecture.md) | مرجع جاری؛ بازنویسی و تطبیق با سورس |
| [docs/network-baseline-2026-11.fa.md](network-baseline-2026-11.fa.md) | اندازه گیری تاریخ دار؛ بدون تغییر اعداد |
| [docs/offline-match-workspace.fa.md](offline-match-workspace.fa.md) | سابقه تغییر؛ دستور اجرایی قدیمی بازنشسته شده |
| [docs/performance-scoring-phase2.md](performance-scoring-phase2.md) | قرارداد تخصصی؛ مرز عملیات و تاریخ روشن شده |
| [docs/phase-1-api-readiness.md](phase-1-api-readiness.md) | سابقه تغییر؛ دستور اجرایی قدیمی بازنشسته شده |
| [docs/phase-1-test-fix.md](phase-1-test-fix.md) | سابقه تغییر؛ دستور اجرایی قدیمی بازنشسته شده |
| [docs/phase-2-desktop-connection.md](phase-2-desktop-connection.md) | سابقه تغییر؛ دستور اجرایی قدیمی بازنشسته شده |
| [docs/releasing.md](releasing.md) | مرجع جاری؛ بازنویسی و تطبیق با سورس |
| [docs/replay-download-admin-stage.md](replay-download-admin-stage.md) | سابقه تغییر؛ دستور اجرایی قدیمی بازنشسته شده |
| [docs/replay-lookup-routing.fa.md](replay-lookup-routing.fa.md) | سابقه تغییر؛ دستور اجرایی قدیمی بازنشسته شده |
| [docs/replay-match-tutorials.fa.md](replay-match-tutorials.fa.md) | سابقه تغییر؛ دستور اجرایی قدیمی بازنشسته شده |
| [docs/replay-metadata-recovery.md](replay-metadata-recovery.md) | سابقه تغییر؛ دستور اجرایی قدیمی بازنشسته شده |
| [docs/replay-on-demand-archive.md](replay-on-demand-archive.md) | سابقه تغییر؛ دستور اجرایی قدیمی بازنشسته شده |
| [docs/replay-parser-stage1.md](replay-parser-stage1.md) | سابقه تغییر؛ دستور اجرایی قدیمی بازنشسته شده |
| [docs/replay-pipeline-tasks.fa.md](replay-pipeline-tasks.fa.md) | سابقه تغییر؛ دستور اجرایی قدیمی بازنشسته شده |
| [docs/replay-proxy-cloudflare.md](replay-proxy-cloudflare.md) | سابقه تغییر؛ دستور اجرایی قدیمی بازنشسته شده |
| [docs/replay-queue-stage2.md](replay-queue-stage2.md) | سابقه تغییر؛ دستور اجرایی قدیمی بازنشسته شده |
| [docs/replay-resilience.md](replay-resilience.md) | سابقه تغییر؛ دستور اجرایی قدیمی بازنشسته شده |
| [docs/replay-setup-live-status.fa.md](replay-setup-live-status.fa.md) | سابقه تغییر؛ دستور اجرایی قدیمی بازنشسته شده |
| [docs/replay-validation-progress.fa.md](replay-validation-progress.fa.md) | سابقه تغییر؛ دستور اجرایی قدیمی بازنشسته شده |
| [docs/resizable-match-workspace.fa.md](resizable-match-workspace.fa.md) | سابقه تغییر؛ دستور اجرایی قدیمی بازنشسته شده |
| [docs/service-monitoring.md](service-monitoring.md) | مرجع جاری؛ بازنویسی و تطبیق با سورس |
| [docs/stratz-connectivity-diagnostics.fa.md](stratz-connectivity-diagnostics.fa.md) | مرجع جاری؛ بازنویسی و تطبیق با سورس |
| [docs/stratz-reference-transfer.fa.md](stratz-reference-transfer.fa.md) | سابقه تغییر؛ دستور اجرایی قدیمی بازنشسته شده |
| [docs/support-position-time-ui.fa.md](support-position-time-ui.fa.md) | سابقه تغییر؛ دستور اجرایی قدیمی بازنشسته شده |
| [docs/third-party/react-bits-LICENSE.md](third-party/react-bits-LICENSE.md) | مجوز؛ بدون تغییر |
| [docs/troubleshooting.fa.md](troubleshooting.fa.md) | راهنمای جاری یا گزارش جدید |
| [docs/two-vps-architecture.fa.md](two-vps-architecture.fa.md) | مرجع جاری؛ بازنویسی و تطبیق با سورس |
| [docs/two-vps-bootstrap.fa.md](two-vps-bootstrap.fa.md) | راهنمای جاری یا گزارش جدید |
| [docs/ui-ux-redesign.md](ui-ux-redesign.md) | قرارداد تخصصی؛ مرز عملیات و تاریخ روشن شده |
| [docs/validation-automatic-library.fa.md](validation-automatic-library.fa.md) | گزارش تاریخی؛ نتیجه قدیمی حفظ شده |
| [docs/validation-two-vps.fa.md](validation-two-vps.fa.md) | گزارش تاریخی؛ نتیجه قدیمی حفظ شده |
| [docs/weekly-meta-reference.fa.md](weekly-meta-reference.fa.md) | قرارداد تخصصی؛ مرز عملیات و تاریخ روشن شده |
