> سابقه تغییرات و قرارداد همان مرحله است. رفتار و دستور عملیاتی امروز در [معماری](two-vps-architecture.fa.md)، [استقرار](deployment-ubuntu.md)، [دریافت خودکار](automatic-match-discovery.fa.md) و [دانلود مستقیم](direct-replay-download.fa.md) آمده است. عدد تست و وضعیت VPS این متن تاریخی است.

# اعتبار آنالیز محلی، دریافت دستی و آرشیو ریپلی — ۲۱ اکتبر ۲۰۲۶

پایه: main `24b4ce2`؛ branch: `fix/local-analysis-sync`.
ZIP فقط فایل های جدید/تغییرکرده همین تسک در مسیر اصلی شان دارد. فایل نیازمند حذف نداریم. نسخه ساخته شده `dist` داخل ZIP نیست؛ build و release:prepare الزامی اند.

## رفتار اصلاح شده

1. تنها خروجی محلی با هویت صحیح و timeline/ده slot معتبر می تواند تحلیل بسازد. OpenDota همچنان اطلاعات پایه مچ، نتیجه، KDA، inventory نهایی و مشخصات دریافت ریپلی را تأمین می کند؛ marker نسخه آن نشانه اجرای Java نیست.
2. بعد از overlay محلی، benchmark، lane/position و فیلدهای پارس OpenDota با خروجی محلی مخلوط نمی شوند. purchase log و objective نیز از پارسر محلی می آیند. فرمول/وزن های IMP، Lane Efficiency و انتخاب مرجع ماهانه تغییر نکرده اند. اگر معیار معتبر برای ساخت نمره موجود نباشد نمره null می ماند، نه عدد ساخته شده از benchmark خارجی.
3. نسخه projection تاریخچه به 3 رسیده است. نمره های قبلی که فقط منبع OpenDota داشتند در پاسخ تازه پنهان می شوند. تحلیل های محلی موجود در batch کوچک بازفرافکنی می شوند؛ مچ ها، مرجع آماری و replay محلی حذف نمی شوند.
4. ذخیره موفق نتیجه محلی برای آماده شدن تحلیل کافی است. تلاش مجدد backup دیگر آن را به صف تحلیل یا مرحله دانلود برنمی گرداند؛ درخواست تحلیل آماده پیش از هر HEAD آرشیو پاسخ می گیرد. دانلود فایل همچنان به آرشیو تأییدشده وابسته است.
5. آرشیو فایل های بیش از 16MiB با multipart و بخش های 8MiB انجام می شود؛ هر بخش تا سه بار فقط برای خطای موقت تلاش می شود، شمارنده پیشرفت دوبار حساب نمی شود، upload ناقص abort می شود و HEAD اندازه/SHA را تأیید می کند. درخواست ها timeout اتصال/پاسخ محدود دارند و سقف کل قبلی شش دقیقه حفظ است. در شروع تلاش، upload_bytes از صفر شمرده می شود. خطای امن operator شامل phase، نام/کد transport و HTTP status است؛ URL، secret و response body چاپ نمی شود. multipart روی شبیه ساز محلی S3 تست شده؛ موفقیت روی سرویس واقعی VPS هنوز باید بررسی شود.
6. دریافت دستی در transaction با قفل حساب انجام می شود. فقط scheduled منتظر به نفع درخواست صریح کاربر supersede می شود؛ manual فعال یا lease پردازش زنده کنار زده نمی شود. cooldown و تغییر صف با هم commit/rollback می شوند؛ استقلال روز/هفته/ماه باقی است. بازیابی leaseهای processing بدون locked_at نیز اضافه شده و recovery scheduled حتی با scheduled-sync خاموش اجرا می شود.
7. worker و importer قبل از پذیرفتن تکمیل، timeline معتبر محلی را کنترل می کنند؛ ده player placeholder کافی نیست. retry UI مرحله مرتبط با خطا را نگه می دارد. دسکتاپ تحلیل آماده را بر preparation قدیمی آرشیو مقدم می داند.
8. پیش فرض `OPENDOTA_PARSE_ENABLED=false` شده؛ در VPS timer قدیمی remote parse متوقف/غیرفعال می شود و مقدار قبلی ENV خاموش می شود. worker Java و دریافت اطلاعات پایه OpenDota فعال می مانند.

Schema، migration، dependency، parser JAR و unit جدید نداریم. Next UI در این تسک بازنویسی نشده؛ API فعال Express و دسکتاپ اصلاح شده اند. تحلیل معتبر محلی در سطح Match مشترک است: اگر همین Match قبلاً محلی پردازش شده باشد، دریافت آن برای کاربر دیگر به اجرای دوباره Java نیاز ندارد.

## اعتبارسنجی این تحویل

- ۴۲۸ تست API در ۶۵ فایل؛ PostgreSQL/PGlite + Express، سناریوی OpenDota-only، local-ready + archive retry، projection قدیمی، اولویت manual، rollback cooldown، lease بدون locked_at و worker lifecycle.
- ۱۳۵ تست دسکتاپ در ۱۵ فایل؛ آماده بودن نتیجه هنگام backup retry، حذف preparation قدیمی، تکمیل در Quick Summary و کش/refresh موجود.
- انتقال واقعی بایت ها به شبیه ساز محلی S3: single PUT و GET، multipart سه بخشی، خرابی موقت بخش دوم، شمارش درست پیشرفت، abort خطای دائمی و تأیید SHA/اندازه.
- TypeScript/build API و desktop و release:prepare موفق. runtime و source چهار اسکریپت parser هم نسخه اند.
- Windows installer، JVM با DEM واقعی و storage واقعی VPS در محیط ساخت اجرا نشده اند. هیچ commit/push یا استقرار از این محیط انجام نشده است.
