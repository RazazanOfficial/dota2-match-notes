# نمودار آیکن‌ها، کنترل زمان و امتیاز عملکرد

مبنا: `main` در `113bdef`؛ branch: `fix/dashboard-visuals`.

## تغییرات

- قاب دایره‌ای، circle clip و زمینهٔ مشکی آیکن‌های حلقه/legend حذف شده‌اند. آیکن همهٔ سهم‌های مثبت رسم می‌شود، از جمله سهم ۱٪. آیکن‌های کوچک به‌جای بریده‌شدن در badge می‌توانند روی مسیرهای شعاعی نزدیک جابه‌جا شوند تا تراکم کمتر شود؛ زاویهٔ سهم‌ها و درصدها تغییر نمی‌کند. فیلتر با کلیک آیکن/سهم/پوزیشن و کیبورد و بازگشت حفظ شده است. برای تراکم بسیار زیاد اندازهٔ آیکن کوچک‌تر می‌شود؛ threshold برای حذف آیکن وجود ندارد.
- پالت سه‌رنگ هر هیرو از آیکن محلی خودش، با حذف پیکسل‌های شفاف/خنثی، از پیش تولید شده است. گرادیان و بازتاب ملایم جلوهٔ شیشه‌ای ایجاد می‌کنند. استخراج پالت در runtime و درخواست تصویر/رنگ از VPS اضافه نشده است. سایه/blur متحرک برای هر سهم وجود ندارد. ابزار توسعهٔ اختیاری `apps/desktop/scripts/generate-distribution-palettes.py` به Pillow نیاز دارد، اما اجرای برنامه و build معمولی به Python/Pillow وابسته نیستند و پکیج محصول عوض نشده است.
- دایرهٔ نرخ برد با meter بیست‌بخشی دارای پُرشدن کسری دقیق جایگزین شده. عنوان کارت میانگین با نام کامل امتیاز عملکرد و مقیاس «از ۱۰۰» نمایش داده می‌شود؛ محدودهٔ تمام مچ‌ها یا هیرو/پوزیشن فیلترشده و مبنای مچ‌های دارای نمره مشخص‌اند. فرمول IMP تغییر نکرده است.
- سوییچ دوره و مستطیل قدیمیِ دو تاریخ/دو فلش با کنترل timeline عوض شده‌اند: انتخاب هفتهٔ مستقیم، میانبر ماه‌های اخیر، نام ماهِ قابل بازکردن و پنل دوازده ماه با انتخاب سال. در حالت هفتگی اول ماه و سپس هفته انتخاب می‌شود. دورهٔ انتخابی حساب همچنان در localStorage باقی می‌ماند و نمودار/جدول از یک summary استفاده می‌کنند.
- تقویم دریافت مچ تغییر نکرده. دورهٔ ماه همچنان ماه شمسی است، حتی وقتی نام ماه در انگلیسی transliteration دارد؛ تاریخ‌های روزِ انگلیسی میلادی‌اند و فارسی شمسی. هفته از شنبه شروع می‌شود و هفتهٔ ثبت‌نام/امروز مرز دسترسی‌اند. مرز ماه‌ها با Intl محاسبه و cache محدود نگهداری می‌شود؛ سال/ماه نمونه در الگوریتم hardcode نشده است.
- فایل حذفی نداریم. این ZIP فقط فایل‌های تغییرکرده/جدید را با مسیر مخزن دارد؛ فایل build یا تصویر تکراری ندارد.

## ابتدا روی سیستم خودتان

اگر تغییر محلی دارید حفظش کنید؛ reset یا clean نزنید. از ریشهٔ مخزن:

```bash
git status -sb
git fetch origin
git switch main
git pull --ff-only origin main
git log -1 --oneline
git switch -c fix/dashboard-visuals
```

حالا فایل‌های ZIP را از ریشه copy/replace کنید. وابستگی‌ها تغییر ندارند؛ اگر npm ci همین main انجام شده نصب دوباره لازم نیست.

```bash
npx vitest run apps/desktop/tests --maxWorkers=1 --testTimeout=20000 --hookTimeout=20000
npm run typecheck -w @dota-notes/desktop
npm run desktop:build
git diff --check
npm run desktop:installer
```

در محیط ساخت: ۱۳۴ تست / ۱۵ فایل، TypeScript و build موفق؛ به دلیل کندی محیط تست، timeout از CLI بیست ثانیه تعیین شد و assertionها حذف نشدند. مرورگر ابری به localhost محیط ساخت وصل نشد و بازکردن فایل محلی هم توسط خط‌مشی مرورگر رد شد؛ بازبینی تصویری/نصاب Windows واقعی ادعا نمی‌شود. بعد از نصب، زبان‌ها، تم روشن/تاریک، انتخاب سال/ماه/هفته، بازوبسته‌شدن برنامه، فیلتر هیرو/پوزیشن و سهم کم را بررسی کنید.

## Commit، push و merge

```bash
git add .
git commit -m "fix(desktop): refine distribution icons, timeline and performance cards"
git push -u origin fix/dashboard-visuals
git switch main
git pull --ff-only origin main
git merge --no-ff fix/dashboard-visuals -m "Merge branch 'fix/dashboard-visuals'"
git push origin main
```

تگ لازم نیست. هیچ commit/push از محیط ساخت انجام نشده است.

## VPS بعد از merge

برای همین تسک فقط کد را هماهنگ کنید؛ این UI با نصاب جدید دسکتاپ اجرا می‌شود. نیازی به API/Next build، restart، migration یا دست‌زدن به parser و دادهٔ مرجع نیست.

```bash
cd /var/www/dota2notes
sudo -u dota2notes -H git status -sb
sudo -u dota2notes -H git fetch origin
sudo -u dota2notes -H git switch main
sudo -u dota2notes -H git pull --ff-only origin main
sudo -u dota2notes -H git log -1 --oneline
```

تغییرات دستی یا stash قبلی VPS را پاک/apply نکنید. نسخهٔ در حال اجرای VPS از این محیط بررسی نشده است.
