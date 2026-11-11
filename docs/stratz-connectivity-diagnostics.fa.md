# تشخیص اتصال و قرارداد STRATZ

این راهنما برای اجرای هدفمند ابزار موجود روی compute آلمان است؛ تغییر production، روشن کردن timer مرجع یا ساخت proxy جدید نیست.
شواهد پاسخ ناقص اکتبر مربوط به VPS و تاریخ همان گزارش اند. با نتیجه آن آزمایش ها درباره مسیر آلمان امروز نتیجه قطعی نگیر.

## چه چیزی کنترل می شود

ابزار `apps/api/scripts/diagnose-stratz.mjs` انتقال کامل، JSON معتبر، خطای GraphQL و قرارداد داده را بررسی می کند.
`HTTP 200` یا چند بایت پاسخ، موفقیت دریافت مرجع ماهانه نیست.
اجرای معمول اندازه های مختلف درخواست، gzip، Meta و Performance و تفاوت Node/curl را بررسی می کند.
`--targeted` تقسیم پاسخ به Hero/Position، بازه دقیقه و مقادیر تاریخ را دقیق تر مقایسه می کند.
تعداد probe و حدود زمان، مشخصات نسخه ابزارند؛ با quota و تنظیم interval سرور تغییر می کنند. ابزار در 429 متوقف می شود و retry خودکار نامحدود ندارد.

## اجرا در آلمان

از سورس همان main مستقر استفاده کن؛ branch تشخیصی قدیمی دوباره ساخته نمی شود.
این ابزار به Node 24، curl و env خصوصی همان compute نیاز دارد؛ build یا migration مستقلی انجام نمی دهد.
برای انتخاب ماه هدف کامل شده، در نشست معمول SSH:

```bash
cd /var/www/dota2notes
read -r -p 'Reference month (YYYY-MM): ' DotaReferenceMonth
sudo install -d -m 0700 -o dota2notes -g dota2notes /var/lib/dota2notes/diagnostics
sudo -u dota2notes -H node \
  --env-file=/var/www/dota2notes/.env.production \
  apps/api/scripts/diagnose-stratz.mjs \
  --targeted --month "$DotaReferenceMonth" \
  --output-dir /var/lib/dota2notes/diagnostics
```

خروجی مسیر گزارش JSON را اعلام می کند. گزارش باید فقط اطلاعات پاکسازی شده provider را داشته باشد؛ env یا پاسخ خام دارای اطلاعات خصوصی ارسال نشود.
probe به سرویس خارجی درخواست می زند و می تواند quota مصرف کند؛ برای هر انتشار عادی الزامی نیست.

## تفسیر

- `transferComplete=true` همراه JSON و قرارداد معتبر لازم است؛ HTTP 200 ناقص قابل ذخیره به عنوان مرجع نیست.
- موفقیت Meta به تنهایی Performance یا تکمیل همه هفته ها و پوزیشن ها را ثابت نمی کند.
- نبود داده یک ماه در یک query به تنهایی نبود آن داده در تمام endpointها را اثبات نمی کند.
- پاسخ کوچک یا پنجره دقیقه ۰ تا ۱۵ جای دریافت کامل ۰ تا ۷۵ نیست.
- موفقیت ابزار، فعال شدن نسخه مرجع در DB را ثابت نمی کند؛ cursor و activation جدا بررسی شوند.
- timer مرجع خاموش برای سبز شدن پنل یا دیدن چند پاسخ HTTP روشن نشود.
- مرجع فعال قبلی حذف یا با داده ناقص جایگزین نشود.

قرارداد داده در [مرجع آماری](monthly-reference-services.md)، [weekly Meta](weekly-meta-reference.fa.md) و وضعیت unitها در [تنظیمات](environment-and-services.fa.md) است.
