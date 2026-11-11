# راهنمای قابلیت کتابخانه خودکار

این قابلیت با `feat/automatic-library` در `main` و کامیت `0ab8d82` ادغام شده است.
این سند دیگر دستور نصب بسته روی مبنای قدیمی `0c01f6c` نیست و نباید شرط آن SHA یا شاخه اولیه را دوباره اجرا کرد.

| نیاز | مرجع جاری |
| --- | --- |
| Windows، Git و استقرار دو سرور | [استقرار عادی](deployment-ubuntu.md) |
| env، جدول های جدید و وضعیت unitها | [تنظیمات و سرویس ها](environment-and-services.fa.md) |
| GSI، Companion و Fetch دستی | [دریافت خودکار](automatic-match-discovery.fa.md) |
| انتشار assets و پاکسازی نصب اول | [رسانه و نصب](desktop-assets-and-install.fa.md) |
| دانلود مستقل از تحلیل | [دانلود مستقیم](direct-replay-download.fa.md) |
| تست های دو گروه پنج مچی و رابط | [پذیرش](acceptance-tests.fa.md) |
| گزارش بررسی تاریخی بسته اولیه | [validation اولیه](validation-automatic-library.fa.md) |

migration افزایشی این قابلیت `0031_automatic_library.sql` است. در ایران با مالک DB اجرا می شود؛ جدول های جدید باید برای نقش compute مجوز داشته باشند.
فعال سازی scheduled sync با ابزار محدود env فقط در اولین تنظیم compute لازم است؛ env کامل از روی فایل مثال جایگزین نمی شود.
تغییر مستندات فعلی migration، نصب fresh سرور یا حذف cache همه کاربران لازم ندارد.
