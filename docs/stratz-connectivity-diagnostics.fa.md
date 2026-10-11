# بررسی اتصال STRATZ — اجرای یکجای تست‌های VPS

تاریخ: ۱۱ اکتبر ۲۰۲۶. مبنا: `main` در `ba3a5e3`.

این بسته فقط تشخیص است؛ اصلاح production، پراکسی جدید یا تغییر فرمول IMP نیست.
گزارش از پاسخ کامل JSON خلاصه می‌سازد؛ HTTP 200 به‌تنهایی موفقیت محسوب نمی‌شود.

## شواهد دریافت‌شده

- درخواست کوچک Match با IP تنظیم‌شده و DNS، HTTP 200 و دادهٔ واقعی داده است.
- درخواست Meta با timeout پنج ثانیه قطع شد؛ بیست ثانیه نیز آن را حل نکرد.
- درخواست کوچک با بدنهٔ padding شده به ۲۰۴۸ بایت در تست Node قطع شد.
- Node HTTP/2 مذاکره شد، ولی درخواست Meta در بیست ثانیه کامل نشد.
- curl برای Meta، HTTP 200 در حدود ۰٫۶ ثانیه و ۶۳۱۳۲ بایت دریافت کرد؛ سپس با timeout متوقف شد. بدنه JSON کامل نبود.
- مرجع سپتامبر `building` و Cursorها صفر است؛ مرجع اوت `active` و آخرین موفقیت ثبت‌شدهٔ آن ۲۸ سپتامبر بوده است.
- کاربر تأیید کرد دریافت ماه جدید در نسخهٔ Next نیز مشکل داشته است؛ شروع مشکل را به مهاجرت Express نسبت ندهید.
- این شواهد نه مسدودشدن کامل STRATZ برای ایران را اثبات می‌کنند و نه محل دقیق قطع انتقال را.

## پوشش اسکریپت

### مرحلهٔ هدفمند پس از گزارش اول — نسخهٔ ۲

گزارش `stratz-diagnostics-1791712172088.json` نشان داد چهار ترکیب Meta با curl و gzip کامل و بدون خطای GraphQL برمی‌گردند؛ پاسخ عادی و Performance بزرگ ناقص‌اند. Node مستقل شکست دارد. شمارش ردیف‌های ماه سپتامبر با قرارداد فعلی Unix seconds صفر است؛ این **اثبات نبودن دادهٔ سپتامبر نیست**، چون گزارش نخست مقدار واقعی `month` را ذخیره نکرد.

گزینهٔ `--targeted` به جای تکرار تست‌های ارتباط قبلی، این ۱۶ تست را یکجا اجرا می‌کند:

1. چهار ترکیب Meta با gzip؛ ثبت مقدار و نوع واقعی `month` و تعداد ردیف‌ها، بدون نگهداری ردیف خام.
2. Meta با `take: 4` برای مشاهدهٔ ماه‌های بیشتری که منبع برمی‌گرداند.
3. هر چهار Hero اولین batch جداگانه، با هر پنج Position و تمام دقیقه‌های ۰–۷۵.
4. Hero اول برای هر پنج Position جداگانه، با تمام دقیقه‌های ۰–۷۵.
5. چهار Hero در Position 1؛ چهار Hero و پنج Position در بازهٔ ۰–۱۵، برای بررسی گزینه‌های تقسیم پاسخ.

هر تست Performance تمام ۱۴ مقدار موجود production را درخواست می‌کند و محدودهٔ Hero/Position/Week/Rank/Minute، تکرار ردیف، تعداد نمونه و اعتبار metricها را کنترل می‌کند. `matchesProductionContract` به‌تنهایی نشان‌دهندهٔ تکمیل دریافت ماه نیست؛ HTTP و انتقال کامل و نبود خطای GraphQL نیز لازم‌اند. پنجرهٔ ۰–۱۵ فقط کنترل تشخیصی است و جایگزین پوشش تمام دقیقه‌ها نمی‌شود. Candidateهای تاریخ فقط مقایسهٔ تشخیصی‌اند و تبدیل production را تغییر نمی‌دهند.

روی همان branch `fix/stratz-connectivity` بمانید. فقط فایل `apps/api/scripts/diagnose-stratz.mjs` را replace و با MobaXterm به همان مسیر VPS منتقل کنید. build، npm install، migration و restart لازم نیست.

```bash
cd /var/www/dota2notes
sudo chown dota2notes:dota2notes apps/api/scripts/diagnose-stratz.mjs
sudo chmod 0644 apps/api/scripts/diagnose-stratz.mjs
sudo install -d -m 0700 -o dota2notes -g dota2notes /var/lib/dota2notes/diagnostics
sudo -u dota2notes -H node \
  --env-file=/var/www/dota2notes/.env.production \
  apps/api/scripts/diagnose-stratz.mjs \
  --targeted --month 2026-09 \
  --output-dir /var/lib/dota2notes/diagnostics
```

در پایان همان فایل JSON اعلام‌شده با `REPORT:` را ارسال کنید؛ خلاصهٔ کنسول به‌تنهایی برای بررسی دقیق کافی نیست. این اجرا به‌صورت سری، بدون retry و با توقف روی 429 است؛ با interval معمول، سقف زمانی حدود هشت دقیقه و معمولاً کمتر است.

`apps/api/scripts/diagnose-stratz.mjs` موارد زیر را سری و با فاصله اجرا می‌کند:

1. درخواست کوچک Match؛ همان درخواست با بدنهٔ ۲۰۴۸ بایتی برای کنترل اندازهٔ ارسال.
2. Meta یک Position و Meta کامل بدون فشرده‌سازی برای کنترل اندازهٔ پاسخ.
3. هر چهار ترکیب Meta: Divine/Immortal × Ranked/Turbo، با درخواست gzip.
4. Performance اولین هفته و اولین batch چهار Hero همان ماه، عادی و gzip.
5. Meta با DNS و gzip؛ در صورت پشتیبانی curl، HTTP/2 و gzip نیز آزمایش می‌شود.
6. انتقال Node مشابه production با timeout پنج ثانیه و پاسخ عادی.
7. Node با gzip برای Meta و Performance؛ پاسخ gzip با سقف حجم decoded باز می‌شود.

تعداد تست‌ها ۱۴ یا ۱۵ است. هیچ retry خودکار انجام نمی‌شود. با دریافت HTTP 429، باقی تست‌ها متوقف می‌شوند.
فاصلهٔ درخواست‌ها حداقل دو ثانیه و در صورت بزرگ‌تر بودن تنظیم موجود STRATZ، همان مقدار است.
هر درخواست سقف بیست ثانیه دارد؛ اجرای معمول حداکثر حدود شش دقیقه است. با interval سفارشی بزرگ‌تر، زمان تخمینی ابتدای اجرا اعلام می‌شود.

اسکریپت فقط API خارجی را می‌خواند و فایل گزارش خودش را می‌سازد. دیتابیس، job، snapshot، ENV، route، timer و سرویس را تغییر نمی‌دهد.
پاسخ خام، درخواست احراز هویت و توکن در گزارش نمی‌آیند. گزارش شامل HTTP، زمان، حجم دریافت‌شده، encoding، تعداد ردیف‌ها، خطاهای پاک‌سازی‌شده و کامل/ناقص‌بودن انتقال است.
دادهٔ ناقص، حتی با HTTP 200، به‌عنوان نتیجهٔ قابل استفاده معرفی نمی‌شود.

## قرار دادن فایل و اجرا

فایل اسکریپت روی سیستم کاربر در همین مسیر نسبی مخزن قرار بگیرد:

`apps/api/scripts/diagnose-stratz.mjs`

برای نگهداری تغییرات در branch همین تسک، از ریشه و با وضعیت مناسب Git:

```bash
git status -sb
git switch main
git pull --ff-only origin main
git switch -c fix/stratz-connectivity
```

بعد از replace فایل‌ها، بررسی محلی تنها به این نیاز دارد:

```bash
node --check apps/api/scripts/diagnose-stratz.mjs
git diff --check
```

با MobaXterm فقط همین اسکریپت را در مسیر زیر VPS قرار دهید:

`/var/www/dota2notes/apps/api/scripts/diagnose-stratz.mjs`

نیازی به build، ارسال dist، نصب npm، migration یا restart نیست. Node 24 و curl موجود VPS کافی‌اند.

```bash
cd /var/www/dota2notes
sudo chown dota2notes:dota2notes apps/api/scripts/diagnose-stratz.mjs
sudo chmod 0644 apps/api/scripts/diagnose-stratz.mjs
sudo install -d -m 0700 -o dota2notes -g dota2notes /var/lib/dota2notes/diagnostics
sudo -u dota2notes -H node \
  --env-file=/var/www/dota2notes/.env.production \
  apps/api/scripts/diagnose-stratz.mjs \
  --month 2026-09 \
  --output-dir /var/lib/dota2notes/diagnostics
```

آخر کار، مسیر فایل `stratz-diagnostics-TIMESTAMP.json` با پیشوند `REPORT:` چاپ می‌شود.
کاربر همان فایل JSON را از MobaXterm دریافت و در گفتگو ارسال کند.

## برداشت از گزارش و کار بعدی

- gzip تنها وقتی مسیر قابل استفاده‌ای است که `transferComplete=true`، JSON معتبر، بدون خطای GraphQL و ردیف‌های ماه/Performance مربوط موجود باشند.
- اگر curl gzip کار کند ولی Node gzip کامل نشود، صرف افزودن هدر gzip اصلاح کافی نیست؛ انتقال Node باید مستقل حل شود.
- موفقیت Meta تنها، موفقیت Performance یا تکمیل snapshot را ثابت نمی‌کند.
- اگر فقط یک Position جواب بدهد، کاهش batch می‌تواند بررسی شود؛ cursor، جمع‌آوری کامل و quota باید هم‌زمان حفظ شوند.
- اگر مسیرهای مستقیم کاربردی نشوند، تست STRATZ از یک واسطهٔ کنترل‌شدهٔ Cloudflare یا خروجی ثابت مستقل مرحلهٔ بعد است. Worker ریپلی فعلی مسیر عمومی GraphQL ندارد؛ دسترسی آن به `/healthz` اثبات‌کنندهٔ دسترسی Worker به STRATZ نیست.
- قبل از اصلاح production، نتیجهٔ واقعی گزارش دریافت و ثبت شود؛ پس از اصلاح، پیشرفت Cursor و فعال‌شدن snapshot در VPS جدا بررسی شوند.
- اطلاعات مرجع فعال اوت پاک یا با نتیجهٔ ناقص جایگزین نشود.

## بررسی انجام‌شده برای ابزار

صحت syntax، تولید query دقیق Meta/Performance، انتخاب ماه و پاک‌سازی توکن بررسی می‌شود.
آزمون محلی TLS با گواهی مورد اعتماد آزمایشی، پاسخ gzip واقعی و پاسخ HTTP 200 عمداً ناقص انجام می‌شود.
این آزمون کنترل سلامت ابزار است و موفقیت شبکهٔ STRATZ روی VPS محسوب نمی‌شود.

نسخهٔ ۲: syntax و queryهای اصلی بدون تغییر تأیید شدند؛ ۱۶ case هدفمند، مقادیر مختلف تاریخ، cohort اشتباه، metric ناقص، نمونهٔ صفر و ردیف تکراری بررسی شدند. اجرای کامل CLI روی سرور TLS محلی با گواهی مورد اعتماد آزمایشی انجام شد: پاسخ gzip باز شد، مقادیر ماه و قرارداد Performance ثبت شدند و HTTP 200 عمداً ناقص موفق تلقی نشد. خروجی و گزارش فاقد توکن بودند. نتیجهٔ واقعی همین نسخه روی VPS هنوز دریافت نشده است.
