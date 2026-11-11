> سابقه تغییرات و قرارداد همان مرحله است. رفتار و دستور عملیاتی امروز در [معماری](two-vps-architecture.fa.md)، [استقرار](deployment-ubuntu.md)، [دریافت خودکار](automatic-match-discovery.fa.md) و [دانلود مستقیم](direct-replay-download.fa.md) آمده است. عدد تست و وضعیت VPS این متن تاریخی است.

# اصلاح انتقال جامعه آماری STRATZ

> وضعیت تاریخی: انتقال curl در VPS تأیید شد. رفتار انتظار `winMonth` با [Meta هفتگی](weekly-meta-reference.fa.md) جایگزین می شود؛ دستورهای این سند برای استقرار پچ جدید اجرا نشوند.

پایه: `origin/main` در `dd241eb`، ۱۱ اکتبر ۲۰۲۶. branch: `fix/stratz-reference-transfer`.

## رفتار پچ

1. `STRATZ_TRANSPORT=curl` مسیر آزمایش شده HTTPS pinned با gzip را انتخاب می کند. default بدون ENV برای سازگاری `node` است. curl از shell اجرا نمی شود؛ token و query فقط از stdin خصوصی می روند، نه argv یا فایل. TLS و hostname بررسی می شوند، redirect دنبال نمی شود، timeout و سقف decoded body حفظ اند؛ پاسخ ناقص HTTP 200 ذخیره نمی شود.
2. Performance هر batch موجود چهار-Hero را با چهار درخواست تک Hero دریافت می کند. تمام Positionها، دقیقه ها و metricها حفظ اند. فقط پس از موفقیت تمام درخواست ها، write و cursor در تراکنش اصلی جلو می روند. ترتیب jobها، policy، وزن نمونه ها و فرمول IMP تغییر نکرده اند. حداکثر تعداد درخواست های ماه از ۱۲۸ به ۵۱۲ می رسد؛ این ۱۲۸ همچنان تعداد batchهای progress است. quota مشترک و retry محدود هر درخواست حفظ شده اند.
3. ماه Meta غایب به صورت `waiting-source` با retry ساعتی ثبت می شود. Tick انتظار HTTP 200 و رویداد info دارد؛ هر دقیقه درخواست و رویداد خطای جدید نمی سازد. Cursor صفر می ماند و داده اوت به نام سپتامبر ذخیره نمی شود. مرجع سالم فعال حفظ می شود و با برگشت ماه خواسته شده، دریافت ادامه می یابد.
4. preflight در حالت curl دسترسی به ابزار HTTPS را بررسی می کند. لاگ خطای STRATZ کد provider و metadata محدود انتقال را نگه می دارد، بدون چاپ متن درخواست/پاسخ، URL یا secret.
5. `stratz-reference-check.js` در dist/release به کد production متصل است: چهار ترکیب Meta و اولین batch Performance را بررسی می کند. snapshot و داده مرجع را تغییر نمی دهد؛ تنها سهمیه مشترک PostgreSQL را رزرو می کند. `ok:true` با `waiting-source` یعنی انتقال سالم است اما Meta آن ماه در پاسخ نیست، نه اینکه snapshot همان ماه تکمیل شده باشد.

schema، migration، dependency، desktop، Next، parser JAR، unit و Worker کلادفلر تغییر ندارند. فایل حذف شدنی ندارد.

## بررسی انجام شده و حدود آن

۴۱۶ تست API در ۶۵ فایل موفق اند؛ TypeScript/API build و release:prepare موفق اند. آزمون TLS محلی واقعی با curl، gzip، UTF-8، حفظ status/Retry-After، عدم redirect، argv بدون token/query، رد پاسخ ناقص، سقف decoded و نبود curl انجام شد. آزمون PostgreSQL سازگار PGlite، حفظ اوت و cursor در حالت انتظار، cooldown پایدار، ادامه پس از رسیدن Meta سپتامبر و اتمیک بودن Performance/cursor را تأیید کرد. این تست ها جای نتیجه runtime جدید روی VPS را نمی گیرند. هیچ commit/push یا استقرار از این محیط انجام نشده است.
