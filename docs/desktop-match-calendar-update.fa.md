# راهنمای این پچ

این پچ بر اساس آخرین `main` با کامیت `6bf978b` آماده شده است. فایل‌های ZIP در مسیر درست پروژه قرار دارند. حذف دستی هیچ فایلی لازم نیست.

## تغییرات

- هنگام بازیابی حساب، بارگیری تاریخچه و ریپلی و بازشدن تحلیل، لودینگ نمایش داده می‌شود؛ ورود یا آمار پیش‌فرض قبل از آماده‌شدن داده‌ها نشان داده نمی‌شود.
- تقویم و انتخاب مودها بازطراحی شده‌اند. اعداد میلادی انگلیسی و اعداد شمسی فارسی هستند و جهت فلش‌ها در فارسی اصلاح شده است.
- با ثبت درخواست دریافت مچ، تقویم بسته می‌شود و یک کارت کوچک وضعیت زنده، بازهٔ زمانی و تعداد مچ‌های بررسی‌شده و واردشده را نشان می‌دهد. پیام قدیمی «تاریخچه به‌روز است» حذف شده است.
- پوزیشن و IMP از نتیجهٔ واقعی تحلیل خوانده می‌شوند. علامت سؤال راهنمای آنالیز دارد. شروع آنالیز از جدول انجام می‌شود و مراحل پردازش زیر ردیف نمایش داده می‌شوند. حالت تکمیل‌شده سبز است.
- دکمهٔ چشم برای جزئیات، در فارسی سمت راست و انگلیسی سمت چپ جدول است. عنوان ستون‌ها واضح‌تر شده و مودها برچسب رنگی با آیکن و متن دارند.
- نمودار پوزیشن دستهٔ نامشخص دارد. کنترل خود نمودار فقط هفتگی/ماهیانه است.
- migration شمارهٔ `0029` برای ذخیرهٔ خلاصهٔ سبک تحلیل اضافه شده است. نتایج قدیمی در دسته‌های کوچک به‌روز می‌شوند و تغییر پوزیشن، دادهٔ ریپلی یا مرجع آماری باعث محاسبهٔ مجدد می‌شود.

## روی ویندوز

در ترمینال ریشهٔ پروژه، همان جایی که `package.json` اصلی قرار دارد، اجرا کن:

```powershell
npm test
npm run typecheck
npm run desktop:installer
```

فایل نصبی در `apps/desktop/src-tauri/target/release/bundle/nsis/` ساخته می‌شود.

خروجی Express هم داخل ZIP در `apps/api/release/dist/` ساخته شده است. اگر همین خروجی را مستقیم انتقال بدهی، build مجدد API لازم نیست. اما چون `dist` در Git ذخیره نمی‌شود، روش استقرار از Git که در ادامه آمده روی VPS build می‌گیرد.

متغیر جدیدی برای `.env.production` لازم نیست و پکیج‌های پروژه تغییر نکرده‌اند.

## استقرار VPS از Git

اول روی کامپیوتر، تغییرات را commit و به `main` پوش کن. مراحل زیر را **بعد از push** در ترمینال VPS داخل MobaXterm اجرا کن.

برای اینکه build سورس به فایل‌های سایت در حال اجرا دست نزند، سورس Git را در `/var/www/dota2notes-source` نگه می‌داریم. بک‌اند فعال همچنان در `/var/www/dota2notes/apps/api/release` اجرا می‌شود.

اگر هنوز فولدر `dota2notes-source` را با Git نساخته‌ای، این بخش را فقط یک بار اجرا کن:

```bash
cd /var/www
git clone --branch main --single-branch https://github.com/RazazanOfficial/dota2-match-notes.git dota2notes-source
sudo chown -R dota2notes:dota2notes /var/www/dota2notes-source
```

سپس برای این استقرار و دفعات بعد:

```bash
cd /var/www/dota2notes-source
sudo -u dota2notes -H git pull --ff-only origin main
sudo -u dota2notes -H npm ci
sudo -u dota2notes -H npm run api:build
sudo -u dota2notes -H npm run release:prepare -w @dota-notes/api
```

اگر دستوری خطا داد، قبل از اجرای بخش بعد همان خطا را بررسی کن. پس از build، دیتابیس را با خروجی جدید migrate و بررسی کن:

```bash
sudo -u dota2notes -H env DOTENV_CONFIG_PATH=/var/www/dota2notes/.env.production npm run db:migrate --prefix /var/www/dota2notes-source/apps/api/release --workspaces=false
sudo -u dota2notes -H env DOTENV_CONFIG_PATH=/var/www/dota2notes/.env.production npm run preflight --prefix /var/www/dota2notes-source/apps/api/release --workspaces=false -- --check-db
```

باید migration موفق باشد و preflight مقدار `ok: true` داشته باشد. migration حساب‌ها و مچ‌های قبلی را نگه می‌دارد.

حالا در **همان ترمینال VPS** خروجی را جایگزین کن. بخش اول فقط تایمر ریپلی را، در صورت فعال‌بودن، موقتاً متوقف می‌کند و آخر کار دوباره فعالش می‌کند:

```bash
DOTA_DEPLOY_REPLAY_TIMER_ACTIVE=0
if systemctl is-active --quiet dota2notes-replay.timer; then
  DOTA_DEPLOY_REPLAY_TIMER_ACTIVE=1
  sudo systemctl stop dota2notes-replay.timer
  sudo systemctl stop dota2notes-replay.service
fi

sudo cp -a /var/www/dota2notes-source/apps/api/release/. /var/www/dota2notes/apps/api/release/
sudo chown -R dota2notes:dota2notes /var/www/dota2notes/apps/api/release
sudo systemctl restart dota2notes-api.service

if [ "$DOTA_DEPLOY_REPLAY_TIMER_ACTIVE" = 1 ]; then
  sudo systemctl start dota2notes-replay.timer
fi
unset DOTA_DEPLOY_REPLAY_TIMER_ACTIVE

sudo systemctl status dota2notes-api.service --no-pager -l
curl -fS http://127.0.0.1:4100/health/ready
curl -fS https://api.dota2notes.ir/health/live
```

`/health/ready` را با آدرس محلی بالا بررسی کن. در تنظیم nginx فعلی، آدرس عمومی این مسیر عمداً `404` می‌دهد.

اگر API بالا نیامد، لاگ این دستور را بفرست:

```bash
sudo journalctl -u dota2notes-api.service --since "10 minutes ago" --no-pager -o cat | tail -80
```

## تست نسخهٔ نصب‌شده با دادهٔ واقعی

1. با حساب ذخیره‌شده برنامه را ببند و باز کن و `Ctrl+R` بزن؛ ابتدا لودینگ و سپس داشبورد باید نمایش داده شود.
2. یک بازهٔ مجاز دریافت کن؛ تقویم باید بسته شود، کارت وضعیت زنده بیاید و پس از دریافت، تاریخچه تغییر کند.
3. از جدول روی «شروع آنالیز» بزن؛ جدول باید باز بماند، مراحل دیده شوند و بعد از تکمیل، رنگ دکمه، پوزیشن و IMP تغییر کنند.
4. با دکمهٔ چشم جزئیات را باز کن و پوزیشن و IMP خودت را با جدول مقایسه کن.
5. فارسی/انگلیسی، عددهای تقویم، جهت فلش‌ها و بخش نامشخص نمودار را بررسی کن.

تست‌های خودکار، TypeScript و build بک‌اند و فرانت انجام شده‌اند. ساخت نصبی ویندوز و تست اتصال و دادهٔ واقعی VPS روی سیستم‌های خودت انجام می‌شود.
