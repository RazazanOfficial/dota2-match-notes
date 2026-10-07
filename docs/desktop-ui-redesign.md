# بازطراحی رابط دسکتاپ

این اصلاحیه روی ساختار foundation-v2 و اصلاحیه‌های lockfile و تست تصاویر اعمال می‌شود. پایهٔ Git اولیه همان `dcb721e03174376eca62629d28c6cd12de0c1f8c` است، اما برای این پچ لازم نیست تغییرات monorepo را commit کرده باشید. اسکریپت تنها فایل‌های این اصلاحیه را بررسی و جایگزین می‌کند.

## تغییرات

- سایدبار: داشبورد، مچ‌ها، ریپلی، گزارش هوشمند، تنظیمات؛ پایین آن اکانت، خروج و روشن/تاریک. باکس فضای کار نمونه حذف شده است.
- هدر: سوئیچ دکمه‌ای FA/EN با پرچم ایران/آمریکا؛ تم و System در تنظیمات قرار دارند.
- داشبورد: پروفایل، برد/باخت، نرخ برد، میانگین Score، فعالیت روزانه، نمودار دایره‌ای و میانبر بخش‌ها؛ بازهٔ هفته/ماه قابل تغییر است.
- تاریخچه: ردیف‌های عمودی، عکس هیرو، آیکن پوزیشن، W/L، K/D/A، IMP (همان Score خود پروژه)، مود، دکمهٔ آنالیز و مدت بازی؛ جداکنندهٔ روز و تاریخ؛ فیلتر هیرو/شناسه، مود و پوزیشن؛ ۸ مچ در هر صفحه.
- نمودار دوحلقه‌ای: پوزیشن‌ها داخل و هیروها بیرون؛ hover یا فوکوس کیبورد درصد و تعداد را نشان می‌دهد. آمار مربوط به کل بازهٔ فیلترشده است و با رفتن به صفحهٔ بعد عوض نمی‌شود.
- خلاصهٔ مچ: نتیجهٔ دو تیم، مدت، شناسه، تاریخ و کارت هر ۱۰ هیرو با K/D/A، Score، پوزیشن، دارایی و فریم آیتم‌های قبلی. بازیکن انتخاب‌شده آمار خام GPM، XPM، LH، Deny، Hero DMG، Tower DMG، Heal و Net Worth دارد.
- آنالیز: همان `apps/web/components/MatchAnalysisPanel.tsx` و موتور امتیازدهی موجود؛ ۱۲ معیار Benchmark، شش حوزهٔ عملکرد، Lane Efficiency و اجزایش، Lane Impact، strengths/watchlist/finding، Progression و مقایسهٔ تک‌هیرو/هم‌پوزیشن/۱۰ هیرو، رویدادها، نقشه و لایه‌ها، فارم، اهداف، دید، Detection، مالکیت Gem/Divine و جدول بازیکنان. دادهٔ ناکافی در همان کد قبلی مدیریت می‌شود.
- Item Timing که قبلاً تعریف شده ولی رندر نمی‌شد، به Progression متصل شده است.
- ژورنال، عکس و گزارش هوشمند فعلاً Coming soon هستند. یادداشت‌های محلی قبلی از localStorage پاک نمی‌شوند.
- ریپلی: جست‌وجوی شناسه یا انتخاب از تاریخچه و دکمهٔ دانلود؛ دادهٔ نمونه را به‌عنوان فایل دانلودشده جا نمی‌زند.
- تمام پک‌های موس و افکت‌های gold/fire/ice قبلی بازاستفاده شده‌اند؛ انتخابشان در تنظیمات است. دادهٔ cooldown نمایشی و تنظیمات روی دستگاه می‌مانند.
- آیکن‌های `pos.zip` برای همهٔ پوزیشن‌های دسکتاپ و ارجاعات متناظر وب استفاده می‌شوند. فایل‌های قدیمی برای سازگاری حذف نشده‌اند.
- سطوح شیشه‌ای ملایم، تم‌های قبلی و RTL؛ انیمیشن hover به prefers-reduced-motion احترام می‌گذارد.

## محدودهٔ فعلی و موارد باقی‌مانده

این مرحله **رابط دسکتاپ آفلاین** است. ورود Steam، خروج واقعی، دریافت مچ، دانلود ریپلی و پردازش واقعی هنوز متصل نشده‌اند. هیچ endpoint جدیدی برای این عملیات، migration دیتابیس یا secret اضافه نشده است. انتخاب پوزیشن در دادهٔ نمونه نیز هیچ fetch به سرور نمی‌فرستد.

دریافت مچ روز/هفته/ماه، تقویم بومی date picker و فیلتر مود دارد. cooldownهای مستقل نمایشی به‌ترتیب ۹۰ ثانیه، ۳ دقیقه و ۱۲۰ دقیقه‌اند؛ کلید ذخیرهٔ آن‌ها از دادهٔ واقعی جداست. فقط دکمهٔ «ثبت درخواست نمایشی» فعال است. بک‌اند موجود روز/هفته را پشتیبانی می‌کند؛ اجرای واقعی ماه و enforce کردن cooldown ماه در سرور در مرحلهٔ اتصال حساب باید اضافه شود.

در پیش‌نمایش، هفته شنبه تا جمعه و ماه تقویمی میلادی است؛ بازهٔ دقیق نشان داده می‌شود. برای دادهٔ نمونه، تاریخ مبنا ۲۰۲۶/۱۰/۰۲ است. عنوان روز در فارسی با تقویم فارسی نمایش داده می‌شود. انتخاب تقویم ماهانهٔ شمسی برای همگام‌سازی واقعی هنوز اضافه نشده است.

دیتاسورس `loadHistoryPage` قرارداد page/total/summary و AbortSignal دارد. برای نمونهٔ آفلاین، متادیتای سبک ۷۲ مچ محلی است؛ فقط صفحهٔ انتخاب‌شده رندر می‌شود. اتصال API واقعی باید صفحه‌بندی را در سرور نیز enforce کند. جزئیات سنگین و کد آنالیز به‌صورت lazy لود می‌شوند. دریافت کل دادهٔ حساب از شبکه در این نسخه اصلاً انجام نمی‌شود.

توضیحات تخصصی داخل کامپوننت مشترک آنالیز همان فارسی/اصطلاحات انگلیسی نسخهٔ وب‌اند؛ همهٔ منوها و صفحات جدید FA/EN دارند. ترجمهٔ کامل انگلیسی محتوای آنالیز قدیمی هنوز انجام نشده است.

## بررسی‌ها

- ۲۷۳ تست موجود وب و ۱۵ تست ریشه (شامل ۸ تست دسکتاپ) موفق؛ جمعاً ۲۸۸ تست.
- TypeScript دسکتاپ و وب، و build تولیدی Vite موفق.
- تست صفحه‌بندی، هم‌خوانی آمار نمودار، فیلترها، cooldown مستقل، تم/System/RTL، موس، ۱۰ فریم آیتم، ۱۲ Benchmark و نماهای اصلی آنالیز موفق.
- تصاویر و dependencyهای Next برای کد مشترک بررسی شده‌اند؛ کامپوننت‌های لوگو و انتخاب موس از `<img>` استفاده می‌کنند تا در Vite هم کار کنند.
- Chromium این محیط با SIGTRAP متوقف شد؛ screenshot و تأیید بصری مرورگر/پنجرهٔ native انجام نشده‌اند.
- Rust/MSVC و installer ویندوز در این محیط بررسی نشده‌اند. build جدید Next نیز برای این اصلاحیه اجرا نشده است؛ typecheck و تست‌های وب موفق‌اند.

## اعمال در ویندوز

۱. ZIP را در پوشه‌ای جدا استخراج کنید؛ کل پروژه را پاک نکنید و اسکریپت اولیهٔ جابه‌جایی monorepo را دوباره اجرا نکنید.

```powershell
Set-Location "D:\Projects\dota2-match-notes"
git branch --show-current
git status --short
Expand-Archive -LiteralPath "$env:USERPROFILE\Downloads\dota-notes-desktop-redesign.zip" -DestinationPath "$env:USERPROFILE\Downloads\dota-notes-desktop-redesign" -Force
node "$env:USERPROFILE\Downloads\dota-notes-desktop-redesign\apply-desktop-redesign.mjs" --repository "D:\Projects\dota2-match-notes" --dry-run
```

۲. فقط بعد از پیام Dry run passed:

```powershell
node "$env:USERPROFILE\Downloads\dota-notes-desktop-redesign\apply-desktop-redesign.mjs" --repository "D:\Projects\dota2-match-notes"
npm test
npm run typecheck
npm run desktop:build
npm run build
npm run desktop:dev
```

فرمان‌ها یکی‌یکی اجرا شوند. اصلاحیه dependency یا lockfile را عوض نمی‌کند؛ اگر نصب قبلی کامل است، npm ci مجدد لازم نیست. اگر خطای conflict دیدید، آن را ارسال کنید؛ فایل‌های شخصی یا تغییرکرده را خودکار overwrite نمی‌کند. پیش از تغییر، فایل‌های هدف در `backup-...` کنار اسکریپت کپی می‌شوند؛ مسیر backup در خروجی چاپ می‌شود. اسکریپت env، .git و node_modules را دست نمی‌زند و commit/push/deploy نمی‌کند.

آدرس پیش‌نمایش `http://127.0.0.1:1420` است. اجرای native بعد از آماده‌بودن Rust/MSVC/WebView2:

```powershell
npm run desktop:tauri
```

## ادغام، tag و VPS — بعد از نهایی‌شدن نسخه

اگر مرحلهٔ foundation هنوز commit نشده است، این تغییرات روی همان branch `chore/monorepo-desktop-foundation` می‌مانند و بعد از بررسی ویندوز همراه هم commit می‌شوند. اگر foundation قبلاً merge شده، از شاخهٔ جدید `feat/desktop-ui-redesign` استفاده کنید. merge طبق ترجیح کاربر باید `--no-ff` باشد؛ این اصلاحیه هیچ merge یا tag ایجاد نکرده است. نام tag بعد از بررسی نسخه قطعی می‌شود؛ tag روی merge commit در main و به‌صورت annotated ایجاد می‌شود. tag موجود را بازنویسی نکنید. جزئیات در [releasing.md](releasing.md) است.

دسکتاپ با VPS قابل مشاهده نیست؛ آن را در ویندوز بررسی کنید. تغییرات مشترک وب (آیکن‌ها، inventory preload و Item Timing) بعد از merge روی VPS قابل استقرارند. اگر monorepo برای اولین بار روی VPS می‌رود، **ابتدا راهنمای [monorepo-desktop-foundation.md](monorepo-desktop-foundation.md)** برای unitهای جدید اجرا شود. برای VPS که قبلاً به monorepo منتقل شده است:

```bash
cd /var/www/dota2notes
sudo -u dota2notes -H git status --short
sudo -u dota2notes -H git pull --ff-only origin main
sudo -u dota2notes -H npm ci
sudo -u dota2notes -H npm test
sudo -u dota2notes -H npm run typecheck
sudo -u dota2notes -H npm run build
sudo systemctl restart dota2notes.service
sudo systemctl status dota2notes.service --no-pager
sudo -u dota2notes -H git rev-parse HEAD
```

اگر status تمیز نیست یا build شکست خورد، ادامه ندهید. این پچ به migration یا نصب دوبارهٔ unitها نیاز ندارد. بعد از استقرار، یک مچ آمادهٔ واقعی را در وب باز کنید و آیکن پوزیشن، فریم آیتم و Progression → Item Timing را بررسی کنید. هیچ استقرار واقعی در این محیط انجام نشده است.
