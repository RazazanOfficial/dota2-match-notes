# مشخصات مچ و آموزش‌های ریپلی

branch: `feat/replay-match-tutorials`، پایه `7549eaa` از main در ۹ اکتبر ۲۰۲۶.

## تغییرات

- جدول هر دو تب شامل هیرو، W/L، پوزیشن، IMP، مود فارسی/انگلیسی، مدت کامل بازی، ID قابل‌کپی و دستور پخش قابل‌کپی است. جدول در هر دو زبان ترتیب یکسان و فاصلهٔ یکسان دارد؛ در عرض کم اسکرول افقی مجاز است.
- جست‌وجوی ID اکنون metadata واقعی دریافت می‌کند. دانلود فقط با دکمهٔ جدا ثبت می‌شود. اگر کاربر در مچ حضور نداشته باشد، نتیجه/هیرو شخصی نامعلوم می‌ماند.
- API موجود status ریپلی اطلاعات کوچک مچ را هم برمی‌گرداند؛ raw replay، دادهٔ کامل provider و ژورنال کاربران دیگر به کلاینت ارسال نمی‌شوند. score/position از projection معتبر تحلیل کاربر می‌آیند؛ این endpoint تحلیل سنگین یا refresh provider انجام نمی‌دهد.
- فایل‌های محلی ده‌تایی نمایش داده می‌شوند؛ metadata فقط موارد قابل‌مشاهده، حداکثر دو درخواست هم‌زمان، با کش حساب و بدون enqueue خودکار خوانده می‌شود. فایل DEM بدون metadata هم قابل‌استفاده است.
- مهلت فقط تست چندمرحله‌ای recent pagination به ۱۵ ثانیه افزایش یافته؛ بررسی‌های تعداد ردیف و offset تغییر نکرده‌اند. اجرای جداگانهٔ همین تست با سقف قبلی حدود ۱٫۲ ثانیه بود؛ اجرای موازی سنگین قبلاً timeout می‌داد.
- شش تصویر واقعی آموزش مسیردهی فارسی و انگلیسی در نصاب قرار می‌گیرند. راهنمای اجرای ریپلی هفت مرحله دارد؛ کنترل شناور `-console` فقط متن و آیکن کپی دارد.
- دو آموزش در یک کنترل دو‌بخشی قرار دارند و از دکمهٔ primary بازکردن پوشه جدا هستند.
- modal وسط صفحه حدود نصف عرض با فضای کافی برای خوانایی است. تصویر کامل، فلش‌های قبلی/بعدی وسط کناره‌ها با RTL صحیح، بستن، Escape، بازیابی focus و backdrop تار/تیره دارد. متن زیر تصویر و footer دکمه‌های متنی حذف شده‌اند. فقط تصویر جاری بارگیری می‌شود.

## تصاویر باقی‌مانده

آموزش folder کامل است. کاربر تصاویر جدید playback، از جمله مرحلهٔ شش، را روی سیستم خود در مسیر پایین قرار داده است. فایل‌های جدید در workspace این تحویل موجود نیستند؛ ZIP اصلاح کنترل‌ها هیچ تصویری ندارد و فایل‌های کاربر را بازنویسی نمی‌کند. در نبود تصویر فقط آیکن خنثی دیده می‌شود، بدون متن به‌زودی یا عنوان مرحله.

```
apps/desktop/public/tutorials/replay-folder/fa/step-01.png ... step-06.png
apps/desktop/public/tutorials/replay-folder/en/step-01.png ... step-06.png
apps/desktop/public/tutorials/replay-playback/fa/step-02.png ... step-07.png
apps/desktop/public/tutorials/replay-playback/en/step-02.png ... step-07.png
```

Playback مرحلهٔ ۱ از folder step-01 مشترک استفاده می‌کند و کپی اضافه نمی‌خواهد.
تمام عکس‌ها **1672×941 PNG** باشند. مرحلهٔ ۶ تصویر تب جدید Downloaded Replays با دکمهٔ copy command است. تصاویر را قبل از build نصاب اضافه کنید؛ فایل‌های بیرون نصاب روی نصب فعلی اعمال نمی‌شوند. هیچ تصویری از VPS درخواست نمی‌شود.

## سیستم محلی: قبل از replace

از روت پروژه، فقط با working tree تمیز:

```powershell
git status -sb
git switch main
git fetch origin
git pull --ff-only origin main
git switch -c feat/replay-match-tutorials
```

ZIP را در روت copy/replace کنید. فایل حذف‌شدنی ندارد. package/lock تغییر نکرده‌اند؛ اگر npm ci قبلاً روی همین main موفق بوده دوباره لازم نیست.

```powershell
npm test
npm run test -w @dota-notes/api
npm run typecheck
npm run desktop:build
npm run api:build
npm run release:prepare -w @dota-notes/api
npm run desktop:installer
```

اگر مثل لاگ قبلی فقط تست UI به سقف ۵ ثانیه خورد، ابتدا آن فایل را جداگانه با `--maxWorkers=1 --testTimeout=15000` اجرا کنید؛ با شکست assertion مرج نکنید.

## Git

```powershell
git status -sb
git add .
git commit -m "feat(replay): add match metadata and localized screenshot tutorials"
git push -u origin feat/replay-match-tutorials
git switch main
git pull --ff-only origin main
git merge --no-ff feat/replay-match-tutorials -m "Merge branch 'feat/replay-match-tutorials'"
git push origin main
```

## VPS موجود

مسیر واقعی `/var/www/dota2notes` است. API runtime در `apps/api/release` است؛ وب Next در این تسک build یا restart نمی‌شود. dependency/schema/ENV/parser تغییر نکرده است. اگر دستور شکست خورد ادامه ندهید.

```bash
cd /var/www/dota2notes
sudo -u dota2notes -H git status -sb
sudo -u dota2notes -H git fetch origin
sudo -u dota2notes -H git switch main
sudo -u dota2notes -H git pull --ff-only origin main
sudo -u dota2notes -H git log -1 --oneline
sudo -u dota2notes -H npm run api:build
```

بعد از build موفق، سرویس‌های استفاده‌کننده از release را موقتاً متوقف کنید؛ وب فعال می‌ماند:

```bash
sudo systemctl stop dota2notes-replay.timer dota2notes-sync-manual.timer dota2notes-opendota-parse.timer dota2notes-images.timer dota2notes-performance-reference.timer dota2notes-monitor.timer
sudo systemctl stop dota2notes-replay.service dota2notes-sync.service dota2notes-opendota-parse.service dota2notes-images.service dota2notes-performance-reference.service dota2notes-monitor.service
sudo systemctl stop dota2notes-api.service
sudo -u dota2notes -H npm run release:prepare -w @dota-notes/api
sudo -u dota2notes -H npm ci --prefix apps/api/release --workspaces=false
sudo -u dota2notes -H env DOTENV_CONFIG_PATH=/var/www/dota2notes/.env.production npm run preflight --prefix apps/api/release --workspaces=false -- --check-db
sudo -u dota2notes -H env DOTENV_CONFIG_PATH=/var/www/dota2notes/.env.production npm run preflight --prefix apps/api/release --workspaces=false -- --role=replay
```

فقط بعد از موفقیت و ok:true:

```bash
sudo systemctl start dota2notes-api.service
curl --retry 5 --retry-connrefused --retry-delay 1 -fS http://127.0.0.1:4100/health/ready
curl -fS https://api.dota2notes.ir/health/live
sudo systemctl start dota2notes-replay.timer dota2notes-sync-manual.timer dota2notes-opendota-parse.timer dota2notes-images.timer dota2notes-performance-reference.timer dota2notes-monitor.timer
sudo systemctl status dota2notes-api.service --no-pager -l
```

## تست دستی بعد از استقرار

1. نصاب تازه را نصب کنید؛ هر دو زبان و هر دو راهنما را ببینید. فلش‌های کناره‌های عکس، بستن و کپی -console را بررسی کنید.
2. ID یک مچ تحلیل‌شدهٔ خودتان را جست‌وجو کنید: هیرو، W/L، پوزیشن و IMP باید با تاریخچه یکی باشد. مچ غیرتحلیل‌شده score حدسی ندارد.
3. ریپلی دانلودشده را در تب local ببینید؛ دستور باید `playdemo replays/MATCH_ID` باشد، بدون # و بدون پسوند dem.
4. یک DEM قدیمی که سرور اطلاعاتش را ندارد هنوز ID و دستور کپی دارد. آمار ساختگی نمی‌گیرد.
5. با قطع اتصال، metadata موجود از کش همان حساب نمایش داده شود. دانلود تازه آنلاین لازم دارد.

تست خودکار HTTP/DB و UI جای دانلود واقعی، نصب روی ویندوز یا اجرای Dota 2 را نمی‌گیرد. نتیجهٔ شبکهٔ VPS را فقط با لاگ واقعی تأیید کنید.

## نتیجهٔ بررسی محلی این تحویل

- `npm test`: وب ۲۷۸ و ریشه ۴۳۱ تست پاس.
- `npm run test -w @dota-notes/api`: ۴۰۲ تست پاس.
- typecheck تمام workspaceها، desktop:build، api:build و release:prepare موفق.
- تطبیق بایتی هر ۱۲ PNG با زیپ کاربر، ابعاد 1672×941 و حضور همه در dist دسکتاپ تأیید شد.
- فایل تصاویر جدید playback فقط روی سیستم کاربر است. نصب واقعی ویندوز، Steam/Dota و درخواست‌های واقعی VPS در این محیط اجرا نشده‌اند؛ ساخت نصاب روی سیستم کاربر انجام می‌شود.

## اعمال ZIP اصلاح کنترل‌ها

این ZIP **مکمل پچ مشخصات مچ و آموزش‌ها** است؛ ابتدا باید آن پچ روی پروژه موجود باشد. روی همان branch `feat/replay-match-tutorials` مرج‌نشده اعمال کنید. `origin/main` هنگام بازبینی هنوز `7549eaa` بود؛ هیچ تغییر محلی را discard/reset نکنید.

این اصلاح فقط UI/تست/مستندات است و هیچ تغییر تازه‌ای در API ندارد. اگر API پچ قبلی مستقر شده، این اصلاح build/restart VPS نمی‌خواهد؛ بعد از merge فقط Git را تازه کنید. اگر هنوز پچ قبلی API مستقر نشده، دستورات استقرار کامل بالا همچنان لازم‌اند.

بررسی اصلاح کنترل‌ها: ۳۱ تست هدفمند، ۴۳۱ ریشه، ۲۷۸ وب و ۴۰۲ API پاس؛ typecheck همهٔ workspaceها و desktop:build موفق.
