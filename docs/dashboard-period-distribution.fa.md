# داشبورد، بازه و توزیع هیرو/پوزیشن

مبنای کار `main` در `a994101`؛ branch تسک `feat/dashboard-period-distribution`.

## تغییرات

- هدر جمع‌وجور با سوییچ واضح هفتگی/ماهانه، بازهٔ محلی‌سازی‌شده و تقویم قبلی برنامه، میانبر هفته/ماه جاری و CTA دریافت مچ با افکت سبک hover.
- بازهٔ انتخابی در localStorage هر حساب حفظ می‌شود و روی داشبورد و مچ‌ها مشترک است. تاریخ تاریخی و فیلتر ذخیره نمی‌شود. در دسترس نبودن storage باعث خرابی صفحه نمی‌شود.
- توزیع همان summary صفحه را می‌خواند؛ دیگر درخواست و کنترل دورهٔ مستقل ندارد. آیکن همهٔ سهم‌های مثبت درون clip مخصوص سهم و دایره رسم می‌شود؛ سهم خیلی کوچک هدف خوانای تکمیلی زیر نمودار دارد. مساحت درصدها تغییر نمی‌کند.
- پوزیشن‌های legend قابل کلیک/کیبورد هستند؛ فیلتر هیرو و پوزیشن ترکیب می‌شود و فلش بازگشت هر دو را پاک می‌کند. رنگ‌ها با شناسه ثابت می‌مانند، زیر آیکن‌ها تیره است و hover فقط رنگ و scale محدود آیکن را تغییر می‌دهد؛ reduced motion رعایت می‌شود.
- چهار کارت آمار بازطراحی شده‌اند. عنوان میانگین IMP مشخص می‌کند مربوط به بازه است یا مچ‌های فیلترشده؛ نام هیرو/پوزیشن هم در صورت انتخاب دیده می‌شود. فرمول نمره و summary سرور عوض نشده‌اند.
- این بسته فقط ۱۷ فایل تغییرکرده/جدید دارد. فایل حذفی ندارد. API/DB/schema/ENV/پکیج/JAR/سرویس/Next تغییر ندارند.

## قرار دادن و تست در سیستم

از ریشهٔ پروژه، پیش از جایگزینی فایل‌ها (اگر همین branch از قبل ساخته شده، دوباره آن را نسازید):

```bash
git status -sb
git fetch origin
git switch main
git pull --ff-only origin main
git log -1 --oneline
git switch -c feat/dashboard-period-distribution
```

در صورت وجود تغییرات محلی دیگر، آن‌ها را حفظ کنید؛ reset یا clean لازم نیست. فایل‌های ZIP را با مسیرهای داخل آن از ریشه copy/replace کنید. وابستگی محصول عوض نشده؛ اگر npm ci همین main را قبلاً انجام داده‌اید نصب دوباره لازم نیست.

```bash
npx vitest run apps/desktop/tests --maxWorkers=2
npm run typecheck -w @dota-notes/desktop
npm run desktop:build
git diff --check
npm run desktop:installer
```

اعتبارسنجی محیط ساخت: ۱۲۳ تست در ۱۴ فایل، TypeScript و build دسکتاپ موفق. نصاب Windows و ظاهر در WebView واقعی در این محیط آزمایش نشده. بازه، تقویم، فیلتر ترکیبی، سهم‌های کوچک، زبان فارسی/انگلیسی و بازکردن مجدد برنامه را روی نصاب بررسی کنید. نصب برنامه قبلی برای ذخیرهٔ تنظیم period باید این نسخه را یک بار اجرا کند.

## Git

```bash
git add .
git commit -m "feat(desktop): redesign dashboard controls, stats and shared distribution"
git push -u origin feat/dashboard-period-distribution
git switch main
git pull --ff-only origin main
git merge --no-ff feat/dashboard-period-distribution -m "Merge branch 'feat/dashboard-period-distribution'"
git push origin main
```

تگ در این تسک لازم نیست. از این محیط commit/push انجام نشده است.

## VPS بعد از merge

```bash
cd /var/www/dota2notes
sudo -u dota2notes -H git status -sb
sudo -u dota2notes -H git fetch origin
sudo -u dota2notes -H git switch main
sudo -u dota2notes -H git pull --ff-only origin main
sudo -u dota2notes -H git log -1 --oneline
```

برای همین تسک build/restart API یا Next، migration یا پاک‌کردن دادهٔ مرجع لازم نیست؛ تغییرات در نصاب دسکتاپ اجرا می‌شوند. تغییرات محلی VPS یا stash قبلی را پاک نکنید. نسخهٔ درحال اجرای VPS از این محیط تأیید نشده است.
