> سابقه تغییرات و قرارداد همان مرحله است. رفتار و دستور عملیاتی امروز در [معماری](two-vps-architecture.fa.md)، [استقرار](deployment-ubuntu.md)، [دریافت خودکار](automatic-match-discovery.fa.md) و [دانلود مستقیم](direct-replay-download.fa.md) آمده است. عدد تست و وضعیت VPS این متن تاریخی است.

# خلاصه سریع مچ — ۱۲ اکتبر ۲۰۲۶

پایه Git: main `39eed0f`؛ branch تسک `feat/match-quick-summary`.
ZIP فقط فایل های جدید/تغییرکرده همین تسک دارد؛ هیچ فایل نیازمند حذف نیست.

## تغییر و قرارداد داده

- نام هر دو تیم در هدر باقی می ماند؛ Victory فقط روی برنده با هاله ثابت سبز/قرمز است. نتیجه نامعلوم برنده ساختگی نمی گیرد. رنگ متن در تم روشن تیره تر است.
- نام/وضعیت Won/Lost زیر Matchup با آیکن تیم ها کنار مرز دو roster جایگزین شده؛ متن انتخاب هیرو حذف و selected با border/background/glow ثابت مشخص است.
- هشت کارت آماری با عدد اصلی، اختلاف signed داخل پرانتز، میانگین و آیکن هیرو روی محور مقایسه دارند. مثبت سبز، منفی قرمز و صفر خنثی است. LH/DN هرکدام اختلاف خودشان را دارند. بدون مرجع، (?) و — نمایش داده می شوند و آیکن وسط می ماند.
- Net Worth تکراری زیر آیتم ها حذف شده؛ Neutral تصویر مستطیل را با object-fit:cover در دایره موجود پر می کند. تنها یک inventory برای هیروی انتخاب شده decode/render می شود و هیچ تصویر جدید یا asset خارجی اضافه نشده است.
- API صفحه جزئیات همان overlay معتبر Replay و همان analysis/resolver مورد استفاده Full Analysis را می خواند. پوزیشنِ null تحلیل با حدس قدیمی از داده پایه جایگزین نمی شود. داده پایه همچنان OpenDota است؛ inference تحلیل از شواهد replay overlay موجود استفاده می کند، نه درخواست تازه پوزیشن از STRATZ.
- دسکتاپ در خود تب Summary بررسی زنده انجام می دهد؛ درخواست page ابتدایی، analysis ناقص هر ۳ ثانیه هنگام پردازش یا ۳۰ ثانیه در حالت idle؛ پس از تکمیل polling متوقف است. focus، visible، reconnect و matches-updated بازخوانی پشت صحنه انجام می دهند. درخواست ها هم زمان نمی شوند؛ unmount لغو می کند؛ انتخاب هیرو حفظ می شود و کش صفحه با تحلیل تازه به روز می شود. آف لاین درخواست دوره ای ندارد.
- میانگین از نسخه active ماه قبلِ تاریخ Match یا fallback یک ماه عقب تر، همان Hero/Position و Divine/Immortal خوانده می شود. مقایسه فقط Ranked All Pick با lobby=7 است؛ نمونه Hero/Position باید همان شرط موجود (۱۰۰۰ یا ۵۰۰ با سهم حداقل ۲۰٪) را بگذراند.
- زمان مرجع `floor(durationSeconds/60)+1` است؛ STRATZ time13 دقیقه12 را نشان می دهد. برای Match دقیقه30، time31 مصرف می شود و دقیقه منبع در UI نوشته می شود. زمان غایب یا بیرون از پوشش0..75 به آخرین ردیف یا پوزیشن دیگری تبدیل نمی شود.
- Net Worth، LH، DN، Hero/Tower Damage و Heal مستقیم از meanهای موجود؛ XPM از mean XP تقسیم بر دقیقه است. Net Worth به GPM و mean XP به mean Level تبدیل نمی شوند: **GPM و Level میانگین مستقیم در مرجع فعلی ندارند** و placeholder/توضیح دو زبانه می گیرند. افت نمونه ها در پایان Match ممکن است مرجع هیرو/پوزیشن را ناموجود کند. صفر معتبر با نبود داده متفاوت است.
- در هر comparison، Hero ID و Position هم ثبت می شود؛ بعد از اصلاح محلی Position، UI میانگین نقش قبلی را نمایش نمی دهد. این تسک ذخیره override یا UX تب Full Analysis را بازطراحی نمی کند.

endpoint Performance مانند قرارداد قبلی فیلتر Mode ندارد؛ Ranked بودن cohort آن فرض موجود پروژه است، نه ویژگی تازه ای که این تسک تأیید کرده باشد.

فرمول IMP و Lane، schema/migration، dependencies/lock، ENV، parser/JAR، systemd یا Cloudflare تغییر ندارند. آگوست و سپتامبر قبلاً روی VPS active شده اند؛ حذف یا دریافت دوباره لازم نیست. فقط خواندن میانگین ها از DB انجام می شود و دانلود آماری STRATZ تازه در صفحه نداریم.

## بررسی انجام شده

۴۲۴ تست API در۶۵ فایل و۱۱۱ تست دسکتاپ در۱۳ فایل موفق اند. PGlite/Express یک مچ بدون replay را به replay معتبر تبدیل کرد و API page تحلیل و پوزیشن/Score آماده داد؛ میانگین همان hero/position/time، نبود GPM/Level، minute غایب و Turbo هم بررسی شدند. تست های Summary تکمیل بدون تغییر tab، نگه داشتن selection، کش آفلاین، reconnect/focus، serialize و unmount را کنترل کردند. API/desktop TypeScript/build، release:prepare و diff-check موفق اند.

نصاب/link Windows و بررسی تصویری در WebView واقعی در محیط ساخت انجام نشده اند؛ مرورگر تصویری تست در این محیط نصب نشد. آزمون های DOM و Build جای تست ظاهر واقعی کاربر را نمی گیرند. فایل dist، assets تغییرنکرده، node_modules یا secret داخل ZIP نیست؛ هیچ commit/push/استقرار توسط سازنده ZIP انجام نشده است.
