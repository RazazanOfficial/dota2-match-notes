# Match Performance Analysis V3

## Product rules

- همه قابلیت‌های این نسخه برای همه کاربران فعال‌اند؛ هیچ Free/Premium gate وجود ندارد.
- Match Details یک workspace تمام‌صفحه است و با دکمه × به Journal برمی‌گردد.
- اطلاعات ثابت Match فقط در Overview دیده می‌شود. Performance، Journal و Media فضای مستقل دارند.
- اصطلاحات شناخته‌شده Dota مانند GPM، XPM، LH، Denies و Position انگلیسی می‌مانند و توضیح کوتاه فارسی دارند.
- هیچ تحلیل ناقصی نباید به‌صورت عدد قطعی نمایش داده شود. وضعیت `ready`، `partial` یا `unavailable` همراه منبع داده نمایش داده می‌شود.

## Benchmark و Percentile

OpenDota مقدار `benchmarks.*.pct` را از قبل به‌شکل quality percentile برمی‌گرداند. بنابراین برای `Deaths / min` نباید دوباره `100 - pct` انجام شود. مقدار `83.54%` یعنی عملکرد بهتر از 83.54 درصد cohort، چون OpenDota جهت کمتر-بهتر را قبلاً لحاظ کرده است.

ترتیب مرجع:

1. Meta خارجی STRATZ با ترکیب `Hero + Confirmed Position + Rank + Mode` در پنجره هفت‌روزه.
2. Benchmark همان Hero از OpenDota؛ confidence متوسط و بدون تفکیک Position.
3. مقایسه با ۱۰ بازیکن همان Match؛ confidence پایین.
4. نمایش «داده کافی نیست»؛ بدون ساخت percentile مصنوعی.

وزن cohort تخصصی از فرمول زیر به دست می‌آید:

`heroPositionWeight = n / (n + 200)`

بنابراین ۳۰ Match حذف نمی‌شود و confidence آن حدود ۱۳٪ است. این وزن برای نشان‌دادن میزان اتکاپذیری است و Pick Rate پایین مستقیماً امتیاز بازیکن را جریمه نمی‌کند. Role Share، Meta Pick Rate، Win Rate، تعداد نمونه و Confidence در UI نمایش داده می‌شوند. هیچ Benchmark یا Pick Rate از Matchهای کاربران سایت ساخته نمی‌شود.

Worker هر ۷۲ ساعت یک Snapshot تازه می‌سازد. Meta از `heroStats.winWeek` در STRATZ برای Positionهای ۱ تا ۵، Rank bracket و Modeهای Ranked/Turbo دریافت می‌شود. منحنی‌های هفت معیار Hero-level از endpoint رسمی OpenDota Benchmarks ذخیره می‌شوند. در صورت شکست refresh، Snapshot قبلی فعال می‌ماند. چون فیلتر دقیق Patch برای این query عمومی STRATZ تأیید نشده، UI صریحاً محدودیت پنجره هفت‌روزه و نبود تفکیک Patch را اعلام می‌کند.

## معیارهای اصلی

- GPM و XPM
- Kills / min، Deaths / min و Assists / min
- Fight Participation از `(Kills + Assists) / Team Kills`.
- Lane Efficiency در صورت وجود داده‌ی معتبر OpenDota.
- LH / min
- Denies @10؛ Denies کل بازی از تحلیل اصلی حذف شده است.
- Hero DMG / min
- Heal / min با relevance وزنی؛ Heal صفر یا کم حذف نمی‌شود اما Strength و Score را بی‌دلیل بالا نمی‌برد.
- Tower DMG با relevance وزنی؛ حجم پایین نباید صرفاً به‌خاطر percentile بالا معیار غالب شود.
- Progression جداگانه برای LH، NW و XP در @5، @10، @20، @30، @40 و @60.

## Performance Score

امتیاز ابتدا داخل شش domain محاسبه می‌شود و سپس وزن domain براساس Position اعمال می‌شود:

| Position | Laning | Economy | Fighting | Survival | Objectives | Utility |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Pos 1 | 20 | 25 | 20 | 15 | 15 | 5 |
| Pos 2 | 20 | 20 | 25 | 15 | 15 | 5 |
| Pos 3 | 20 | 15 | 25 | 15 | 20 | 5 |
| Pos 4 | 15 | 10 | 25 | 15 | 10 | 25 |
| Pos 5 | 15 | 5 | 20 | 15 | 10 | 35 |

فرمول هر domain یک weighted mean از quality percentileهاست. وزن هر معیار از سه عامل تشکیل می‌شود:

`metric relevance × volume relevance × cohort confidence`

Confidence پایین ضریب `0.55` و متوسط ضریب `0.82` دارد. Heal و Tower DMG کم‌حجم وزن کمتری می‌گیرند. این امتیاز ranking کاربردی برای همان Match است و ادعای MMR یا skill rating مطلق ندارد.

رنگ‌ها ثابت‌اند: 80–100 سبز، 60–79.99 آبی، 40–59.99 نارنجی مایل به قرمز و کمتر از 40 قرمز.

## Role Swap

- Assigned Position از Role ثبت‌شده در Journal می‌آید.
- Detected Position ابتدا از STRATZ و سپس OpenDota گرفته می‌شود.
- تفاوت این دو به‌عنوان «Role Swap احتمالی» نمایش داده می‌شود.
- کاربر می‌تواند Position واقعی هر یک از ۱۰ بازیکن را دستی روی Pos 1–5 تأیید کند.
- تأیید دستی در `journal_matches.position_overrides` ذخیره می‌شود، confidence برابر 100 دارد و در محاسبه Score و مقایسه Position اولویت اول است.
- مچ `8978303598` regression case اصلی است: پروفایل با Undying، Assigned Pos4 و Detected/Confirmed Pos3.
- Resolver ابتدا Manual، سپس STRATZ و بعد شواهد Lane/Farm/Vision در OpenDota را بررسی می‌کند. پنج Position هر تیم به‌صورت مشترک حل می‌شوند.
- هنگام اختلاف Assigned/Detected، بازیکن جفت Role Swap نیز پیدا و با فلش نمایش داده می‌شود؛ کاربر می‌تواند جفت پیشنهادی را تأیید یا هر دو Hero را دستی انتخاب کند.

## Progression و Event Context

- حالت Solo، مقایسه با Position متناظر حریف و هر ۱۰ بازیکن وجود دارد.
- در حالت چندبازیکنه، کارت‌های تک‌Hero حذف و آمار لحظه‌ای کنار Chart قرار می‌گیرد.
- Net Worth تم Gold، XP تم آبی و Last Hits تم سبز دارد.
- رخدادهای Kill، Death، Ward، Sentry، Dust، Smoke، Buyback و Item در بازه ±۱ دقیقه کنار نقطه Timeline نمایش داده می‌شوند.
- UI از عبارت «هم‌زمان با» استفاده می‌کند؛ هم‌زمانی به‌تنهایی رابطه علّی را ثابت نمی‌کند.

## Map Engine 7.41

- asset پایه `public/maps/dota-7.41.webp` یک WebP 4096×4096 از پروژه Sloppy است.
- Towers، Camps، Lotus Pools، Twin Gates، Tormentors، Bounty/Power/Wisdom Runes، Watchers و Roshan لایه‌های مستقل و قابل خاموش/روشن‌شدن هستند.
- بازه‌های 0–5، 5–10، 10–20، 20–30، 30–40، کل Match و بازه دستی X تا Y پشتیبانی می‌شوند.
- نقاط بدون timestamp فقط در نمای کل Match نمایش داده می‌شوند و نباید به بازه زمانی خاص نسبت داده شوند.

### Farm Quality

این بخش retrospective است: Farm Source Mix برای Lane/Neutral/Ancient، Farm Uptime، Stack، Empty Travel، Death Cost، Recovery after setback و Farm-to-Impact را تحلیل می‌کند. ریتم Farm در بازه‌های 0–5، 5–10، 10–20، 20–30، 30–40 و ادامه Match همراه Deathهای هم‌زمان نمایش داده می‌شود. شبیه‌ساز آینده Farm Pattern که مسیر بهینه Camp و Wave را می‌سازد ماژول جداگانه است.

### Objective Analysis

Tower/Roshan/Barracks events و Tower DMG نمایش داده می‌شوند. Fight → Objective در پنجره ۱۲۰ ثانیه‌ای، Delay بعد از Fight، Presence قابل اثبات و پنجره‌های ازدست‌رفته جداگانه گزارش می‌شوند. هم‌زمانی به‌عنوان نشانه تحلیلی نمایش داده می‌شود و ادعای علت قطعی ندارد.

### Vision, Support و Counter-Invisibility

تحلیل برای تمام Positionها فعال است، نه فقط Pos4/5. Observer، Sentry، Dust، Smoke، Gem، عمر Ward، Deward زودهنگام، Objective Ward Coverage، Vision Value، Stack و سهم بازیکن از Detection تیم بررسی می‌شوند. Smoke وقتی طی ۱۲۰ ثانیه Kill یا طی ۱۸۰ ثانیه Objective بسازد موفق محسوب می‌شود.

تهدید Invis از Ability هیرو، خرید Shadow Blade/Silver Edge/Glimmer و Intent ساخت براساس Shadow Amulet و component همراه استخراج می‌شود. زمان رسیدن تقریبی به Level 6 از XP Timeline گرفته می‌شود. مسئولیت Detection در ۱۰ دقیقه اول براساس Lane متناظر و پس از آن براساس Position وزن می‌گیرد. Natural Reveal مانند Zeus و Slardar نیاز را کاهش می‌دهد، اما صفر نمی‌کند. Coverage Gap، آمادگی تیم و اقدام فردی جدا هستند؛ خرید به‌موقع Detection توسط Core می‌تواند Strength معنادار باشد.

### Movement Heatmap

Heatmap از مختصات موجود در Replay/OpenDota ساخته می‌شود. داده aggregate فقط پوشش کلی و داده timed بازه‌های واقعی را نمایش می‌دهد. نقاط زمان‌دار به‌صورت Trail محتاطانه متصل می‌شوند و بازیکن را می‌توان با حریف همان Position مقایسه کرد. سهم حضور در نیمه امن و نیمه حریف، Combat Point و Objective Point نیز برای بازه انتخابی گزارش می‌شوند؛ تقسیم نیمه مپ فقط یک Context مکانی است و به‌تنهایی حکم امن/خطرناک قطعی نمی‌دهد. نبود نقطه به معنی نبود حرکت نیست؛ یعنی Telemetry قابل اتکا دریافت نشده است.

## Item Timing

- Purchase log آیتم‌های Core، Utility و Detection را استخراج می‌کند.
- Purchase time ثبت می‌شود؛ تا زمانی که دیتاست معتبر Timing خارجی اضافه نشده باشد مرجع Median با وضعیت unavailable نمایش داده می‌شود و از مچ‌های کاربران سایت ساخته نمی‌شود.
- بازه ±۲ دقیقه `On time`، زودتر از آن `Early` و دیرتر از آن `Late` است.
- Timing بدون نمونه کافی نمایش داده می‌شود اما وارد قضاوت قطعی و Score نمی‌شود.

## Deployment impact

- migrationهای `0012` و `0013` باید پیش از بالا آمدن نسخه جدید اجرا شوند.
- هیچ متغیر محیطی جدیدی لازم نیست.
- پس از بالا آمدن سایت، `dota2notes-performance-reference.service` یک‌بار دستی اجرا و Timer هفتادودوساعته آن فعال می‌شود. این Worker از همان `SYNC_WORKER_SECRET` استفاده می‌کند.
- نسخه و Git tag در این پچ تغییر نمی‌کند و فقط پس از تأیید نهایی کاربر انجام می‌شود.
