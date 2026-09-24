# Replay parser — مرحلهٔ نخست

## هدف و محدوده

در این پچ دادهٔ همان Match از replay واقعی استخراج و در ستون جداگانهٔ
`dota_matches.local_replay_data` ذخیره می‌شود. در تحلیل Match، آمار خام replay
برای همهٔ ۱۰ بازیکن بر دادهٔ replay برگشتی از OpenDota اولویت دارد. فیلدهای
مشخصات Match، Hero ID و KDA از Match summary در OpenDota می‌آیند؛ Position
با شواهد Laning Stage از replay و تخمین OpenDota تعیین می‌شود و در صورت
تأیید دستی، مقدار کاربر اولویت دارد. benchmarkهای
مرجع از snapshot آماری می‌آیند. **ورودی این مرحله دستی و فقط مخصوص
اپراتور سرور است**؛ دانلود خودکار replay، دکمهٔ کاربر و زمان‌بندی worker در
این پچ فعال نمی‌شوند. هدف: تثبیت کیفیت داده و مصرف RAM، قبل از اتصال به
دانلود خودکار Valve در VPS ایران.

## قرارداد اولویت داده

| داده | اولویت در این مرحله | محدودیت |
| --- | --- | --- |
| `networth_t`, LH, Deny, XP, Stack، Ward log، Heal/Damage timeline و سایر telemetry ثبت‌شده | parser محلی، بعد OpenDota | ورود فقط پس از تأیید Match ID داخل `.dem` و داشتن هر ۱۰ player |
| `purchase_log` و `objectives` | OpenDota؛ اگر آرایه موجود نباشد parser محلی | خروجی parser و نسخهٔ enrich‌شدهٔ OpenDota در نمونه اختلاف داشتند |
| `match_id`, start/duration, نتیجه، Hero ID، account، KDA، `picks_bans`, benchmarks | Match summary موجود در OpenDota | parser blob خام آن‌ها را به صورت قابل اتکا برنگردانده است |
| Position بازیکن | تأیید دستی، سپس موقعیت‌های ده دقیقهٔ اول replay، تخمین OpenDota و LH/Ward همان بازه | Position مستقیم در parser خام وجود ندارد؛ وقتی شواهد کافی نیست، نامشخص می‌ماند |
| IMP دقیقه‌ای اختصاصی STRATZ | در تحلیل مچ استفاده نمی‌شود | تا تعریف و اعتبارسنجی فرمول مستقل، مقدار آن ناموجود است |
| cohort ماهانه و benchmark مرجع | منابع آماری بیرونی پروژه | آمار یک replay جای مرجع آماری را نمی‌گیرد |

در خروجی API فیلد `replaySource` (`local`/`opendota`) و در player
`timelineSource` مشخص می‌کنند کدام ورودی انتخاب شده است. این برچسب‌ها
الزاماً منبع تک‌تک فیلدهای خلاصهٔ Match نیستند؛ دادهٔ خلاصه در هر حالت از
OpenDota می‌ماند. نسخهٔ خام OpenDota دست‌نخورده ذخیره می‌شود و با sync مجدد
هم local replay از بین نمی‌رود.

در پنل Farm، `killed` replay بر اساس نام یونیت و تیم بازیکن به Lane
(شامل Siege)، Jungle معمولی و Ancient تقسیم می‌شود. Deny، Summon، Hero،
Ward و Objective از این سه شمارنده حذف می‌شوند. `neutral_kills` خام OpenDota
خودش Ancient را شامل می‌شود؛ وقتی histogram `killed` در دسترس نیست،
`neutral_kills - ancient_kills` فقط برای Jungle معمولی استفاده می‌شود و
شمارش دقیق Lane ناموجود می‌ماند. فهرست یونیت‌های Ancient هنگام تغییر
کمپ‌ها در پچ‌های بازی باید بازبینی شود. تعداد این دسته‌ها الزامی ندارد
دقیقاً با LH بازی برابر باشد.

Banهای خودکار فقط از `picks_bans` خود OpenDota نمایش داده می‌شوند؛
این فهرست ممکن است در یک Match ناقص یا غایب باشد. Banهای مچ واردشده
فقط‌خواندنی‌اند؛ کاربر نمی‌تواند آن‌ها را اضافه یا حذف کند. حتی ورودی
`banIds` از نسخه‌های قدیمی client در API ذخیره‌سازی ژورنال نادیده گرفته
می‌شود. Banهای ثبت‌شدهٔ تاریخی صرفاً برای مچ‌هایی که هنوز summary
OpenDota ندارند، به صورت فقط‌خواندنی نمایش داده می‌شوند. دریافت Ban از
local replay تا وقتی دقت draft events در چند Match ثابت نشده فعال نیست.

`lane_pos` در خروجی parser، موقعیت‌های ثبت‌شده تا دقیقهٔ ۱۰ را به‌صورت
تجمیعی نگه می‌دارد. تشخیص Safe/Mid/Off از تراکم همین موقعیت‌ها می‌آید؛
برای جدا کردن Core و Support هم LH و Ward همان بازه بررسی می‌شوند.
GPM یا تعداد Ward کل بازی به‌تنهایی نباید یک Position ظاهراً قطعی بسازند.

مسیر همگام‌سازی مچ دیگر STRATZ را فراخوانی نمی‌کند؛ job جدیدی برای آن ساخته
نمی‌شود و endpoint قدیمی worker پاسخ 410 می‌دهد. Draft قابل اتکا از
`picks_bans` و ترکیب نهایی بازیکنان OpenDota گرفته می‌شود؛ اگر ban ثبت
نشده باشد، ban ساختگی نمایش داده نمی‌شود. اطلاعات تاریخی STRATZ در DB
باقی می‌ماند، ولی صفحه تحلیل و دفتر آن را نمی‌خوانند. STRATZ برای snapshot
آماری جمعیت Hero/Position همچنان کاربرد دارد.

**این مرحله هنوز دانلود خودکار replay ندارد.** در غیاب import دستی، تحلیل
از replay پارس‌شدهٔ OpenDota استفاده می‌کند و اگر آن هم موجود نباشد داده‌های
وابسته به replay ناموجود می‌مانند. پس هدف نهایی «parser محلی برای هر مچ کاربر»
فقط پس از اضافه شدن صف و دانلود/انتقال replay کامل خواهد شد.

## آماده‌سازی آفلاین روی سرور یا سیستم تست

پیش‌نیاز: Java JDK 17 (شامل کامپایلر)، Maven، Git، Python 3، `zstd` و
`bzip2`، Node و وابستگی‌های نصب‌شدهٔ پروژه. اسکریپت build یک revision ثابت
از OpenDota parser را می‌گیرد، با Java 17 می‌سازد و مجوز MIT آن را کنار JAR
نگه می‌دارد. اگر دانلود وابستگی‌های Maven در VPS ایران ممکن نبود، همین
اسکریپت را روی سیستم با دسترسی اجرا کرده و JAR و LICENSE ساخته‌شده را
به VPS منتقل کنید. اجرای build جزو راه‌اندازی و با تأیید مرحلهٔ استقرار است.

```bash
bash scripts/replay-parser/build-parser.sh /var/www/dota2notes/var/replay-parser/parser.jar
```

پس از نصب کد و اجرای migration، برای نمونهٔ دستی و بدون اتصال به DB:

```bash
REPLAY_PARSER_JAR=/var/www/dota2notes/var/replay-parser/parser.jar \
  node scripts/replay-parser/import-replay.mjs \
    --match 9008411473 --file /path/to/9008411473_68543098.dem.bz2 --dry-run
```

برای ذخیره در DB، پس از اطمینان از وجود Match summary همین ID در
`dota_matches`، `--dry-run` را حذف و `DATABASE_URL` را از محیط سرور فراهم
کنید. این فرمان Match ID را از `CDemoFileInfo` در خود replay می‌خواند؛
پسوند `.bz2` معیار تشخیص فشرده‌سازی نیست و magic bytes مبنا هستند. پردازش
در فرایند جدا با `-Xmx1200m`، timeout، محدودیت حجم فایل و پوشهٔ موقت
پاک‌شونده اجرا می‌شود. مسیر پیش‌فرض پوشهٔ موقت `/tmp` است و در محیط‌هایی
که `/tmp` قابل نوشتن نیست می‌توان `REPLAY_WORK_DIR` را روی مسیر قابل نوشتن
تنظیم کرد. فایل `.dem` در DB ذخیره نمی‌شود.

## کنترل کیفیت و ادامهٔ کار

در فایل نمونهٔ 9008411473، parser هر ۱۰ slot را برگرداند و Net Worth و
Stack timeline آن با raw OpenDota برابر بود؛ `purchase_log` و بعضی
`objectives` دقیقاً برابر نبودند و عمدی با OpenDota حفظ شدند. قبل از
اعمال Score جدید باید چند Match و patch مختلف بررسی شوند. سپس worker
دارای صف پایدار و دانلود کنترل‌شدهٔ Valve افزوده می‌شود، دسترسی شبکهٔ VPS
ایران تست می‌شود و فقط در صورت نیاز یک worker خارج از ایران در نظر می‌گیریم.

یادداشت UI برای مرحلهٔ جداگانه: صفحهٔ فعلی به‌خصوص روی گوشی لگ دارد، گاهی
روی لپ‌تاپ هم کند است و اندازهٔ متن/تصویر و تراکم المان‌ها زیاد است.
بعد از تثبیت دادهٔ replay، بازطراحی ساده‌تر و سبک‌تر بررسی شود.
