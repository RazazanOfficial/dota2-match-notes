# Meta هفتگی و بازسازی ایمن مرجع — ۱۱ اکتبر ۲۰۲۶

پایهٔ این تسک آخرین main `d27d748`؛ branch `fix/weekly-meta-reference`.
اسناد قبلی انتقال curl، پیشینه هستند؛ این سند قرارداد و انتشار جاری است.

## شواهد VPS و قرارداد

انتقال production با curl تأیید شد. `winMonth` حتی با take=12، DNS و حذف
فیلتر تا اوت داده دارد و Schema آن month ندارد. پاسخ روزانهٔ نمونه‌ها پوشش
کامل سپتامبر را ندارد. `winWeek` هفته‌های ۳/۱۰/۱۷/۲۴ سپتامبر را برای نمونهٔ
یک هیرو/پوزیشن برگرداند. این شواهد به معنی تأیید دریافت کامل همهٔ گروه‌ها نیست؛
بررسی production زیر همان provider جدید را برای همهٔ گروه‌ها اجرا می‌کند.

Meta از `winWeek` برای دقیقاً هفته‌های شروع‌شده در ماه UTC ساخته می‌شود؛ همین
بازه از قبل مبنای Performance بود. هفته از پنجشنبه UTC آغاز می‌شود و تمام هفته
به ماه شروعش تعلق دارد. پس این مرجع «تمام روزهای ماه تقویمی» نیست. بازهٔ شروع،
پایان غیرشامل و تعداد هفته‌ها در API و پنل دسکتاپ نمایش داده می‌شوند.

هیچ ماه/شناسهٔ هیرو/دادهٔ سپتامبر در منطق تولید hardcode نشده است. صفحهٔ Meta
حداکثر هشت هفته و یک پوزیشن دارد؛ همهٔ هیروها بدون فیلتر Hero درخواست می‌شوند.
صفحه‌ها از دادهٔ واقعی جدید به قدیم خوانده می‌شوند؛ محل ماه بر اساس timestamp
تشخیص داده می‌شود، نه فرض تازه‌بودن منبع یا عدد skip. تعداد صفحه‌ها با تاریخ
ماه محاسبه و backfill مانند قبل به یازده ماه کامل اخیر محدود می‌شود. هفتهٔ
غایب در هر پوزیشن، دادهٔ بد، تکرار و هم‌پوشانی صفحات پذیرفته نمی‌شوند. کمبود
هفته `waiting-source` با تلاش ساعتی است؛ خطای انتقال همچنان خطای واقعی است.

ابتدا matchCount/winCount هفته‌ها جمع می‌شوند؛ Win Rate، Position Share و Pick
Rate از مجموع ساخته می‌شوند. میانگین سادهٔ درصدها نداریم. Performance، وزن
نمونه‌ها، شرط حداقل نمونه و فرمول IMP/Lane تغییر نکرده‌اند. فرض Ranked بودن
endpoint Performance بدون فیلتر Mode همچنان محدودیت قبلی است؛ برای Turbo
امتیاز عملکرد مقایسه‌ای از آن ساخته نمی‌شود.

## نسخه‌ها و سازگاری دیتابیس

سیاست تازه `stratz-weekly-di-v3` است. هر بازخوانی دستی ماه، نسخهٔ مستقل با
version_id تازه و Cursor صفر می‌سازد؛ از ردیف‌ها و Cursor قبلی استفاده نمی‌کند.
هیچ ردیف مرجع فعال یا دادهٔ کاربر حذف نمی‌شود. builder قبلی هنگام بازخوانی
جدید failed/superseded می‌شود و در تاریخچه باقی می‌ماند؛ نتیجهٔ درخواست قبلی
که هنوز در شبکه است با قفل/تطبیق status و Cursor دور ریخته می‌شود.

مرجع جایگزین فقط بعد از تکمیل همهٔ batchها، ۲۰ گروه Meta و ۳۸۰ ردیف مثبت
Position/minute و کنترل شرط نمونه فعال می‌شود. فعال‌سازی و retired شدن مرجع
قبلی همان ماه یک transaction هستند. Cursor/ردیف‌ها هم اتمیک‌اند؛ شکست یا
restart موجب دوباره‌شماری نمی‌شود. نسخهٔ فعال قدیمی تا آن زمان در دسترس reader
و fallback باقی می‌ماند. totals نسخهٔ v2 همچنان ۴/۱۲۸ است، نه ۱۶/۵۱۲.

Migration، حذف جدول/partition، ENV جدید، dependency/lock، JAR، unit یا Worker
Cloudflare نداریم. `STRATZ_TRANSPORT=curl` موجود حفظ شود. API build و
release:prepare لازم‌اند؛ Next تغییر ندارد و build آن لازم نیست. برای مشاهدهٔ
برچسب تازهٔ بازه در دسکتاپ installer جدید بسازید؛ کلاینت قبلی نیز با API کار می‌کند.

## سیستم شخصی و Git

از ریشهٔ پروژه، پیش از replace؛ اگر تغییر محلی نامرتبط دارید ابتدا حفظ کنید:

```bash
git status -sb
git fetch origin
git switch main
git pull --ff-only origin main
git log -1 --oneline
git switch -c fix/weekly-meta-reference
```

فایل‌های ZIP از روت copy/replace؛ فایل نیازمند حذف نداریم. dependencies تغییر نکرده‌اند.

```bash
npm run test -w @dota-notes/api -- --maxWorkers=2
npx vitest run apps/desktop/tests/profile-admin.test.tsx --maxWorkers=2
npm run api:build
npm run release:prepare -w @dota-notes/api
npm run desktop:build
git diff --check
```

برای نصاب جدید Windows:

```bash
npm run desktop:installer
```

```bash
git add .
git commit -m "fix(api): build weekly Meta references and preserve active snapshots"
git push -u origin fix/weekly-meta-reference
git switch main
git pull --ff-only origin main
git merge --no-ff fix/weekly-meta-reference -m "Merge branch 'fix/weekly-meta-reference'"
git push origin main
```

## VPS موجود پس از push main

در MobaXterm؛ checkout همان `/var/www/dota2notes` است. اگر tracked تغییر محلی
دارد یا فرمانی شکست خورد، پیش از ادامه خروجی بررسی شود؛ reset/clean نکنید.
dependencies موجود کافی‌اند؛ npm ci و توقف وب لازم نیست.

```bash
cd /var/www/dota2notes
sudo -u dota2notes -H git status -sb
sudo -u dota2notes -H git fetch origin
sudo systemctl stop dota2notes-replay.timer dota2notes-sync-manual.timer dota2notes-opendota-parse.timer dota2notes-images.timer dota2notes-performance-reference.timer dota2notes-monitor.timer
sudo systemctl stop dota2notes-replay.service dota2notes-sync.service dota2notes-opendota-parse.service dota2notes-images.service dota2notes-performance-reference.service dota2notes-monitor.service
sudo systemctl stop dota2notes-api.service
sudo -u dota2notes -H git switch main
sudo -u dota2notes -H git pull --ff-only origin main
sudo -u dota2notes -H git log -1 --oneline
sudo -u dota2notes -H npm run api:build
sudo -u dota2notes -H npm run release:prepare -w @dota-notes/api
sudo -u dota2notes -H env DOTENV_CONFIG_PATH=/var/www/dota2notes/.env.production npm run preflight --prefix apps/api/release --workspaces=false -- --check-db
sudo -u dota2notes -H env DOTENV_CONFIG_PATH=/var/www/dota2notes/.env.production npm run preflight --prefix apps/api/release --workspaces=false -- --role=performance-reference
sudo systemctl start dota2notes-api.service
curl --retry 5 --retry-connrefused --retry-delay 1 -fS http://127.0.0.1:4100/health/ready
curl -fS https://api.dota2notes.ir/health/live
sudo systemctl start dota2notes-replay.timer dota2notes-sync-manual.timer dota2notes-opendota-parse.timer dota2notes-images.timer dota2notes-monitor.timer
```

بررسی واقعی و سپس صف بازسازی دو ماه، یکجا؛ خود برنامه ماه‌ها را از ورودی می‌گیرد.
فرمان check هیچ snapshot/row/cursor را تغییر نمی‌دهد، ولی quota مشترک DB را
رزرو می‌کند. `--require-meta` در کمبود یک گروه exit 2 می‌دهد و بازسازی صف نمی‌شود.
در هر ماه تمام چهار گروه × پنج پوزیشن × تمام هفته‌های هدف با provider production
بررسی می‌شوند؛ Performance فقط batch اول همان ماه را تست می‌کند. تکمیل تمام
batchهای Performance را بعداً status/cursor/SQL اثبات می‌کنند.

```bash
if sudo -u dota2notes -H node --env-file=/var/www/dota2notes/.env.production apps/api/release/dist/stratz-reference-check.js --month 2026-08 --require-meta &&
   sudo -u dota2notes -H node --env-file=/var/www/dota2notes/.env.production apps/api/release/dist/stratz-reference-check.js --month 2026-09 --require-meta; then
  if sudo -u dota2notes -H node --env-file=/var/www/dota2notes/.env.production apps/api/release/dist/monthly-reference-rebuild.js --months 2026-08,2026-09 --queue; then
    sudo systemctl start dota2notes-performance-reference.timer
    sudo systemctl start dota2notes-performance-reference.service
  else
    echo "Queue request failed; send the output before continuing."
  fi
else
  echo "Reference checks incomplete; no rebuild was queued. Send the output before continuing."
fi

sudo journalctl -u dota2notes-performance-reference.service -u dota2notes-api.service --since "10 minutes ago" --no-pager -o cat | tail -100
sudo -u postgres psql -d dota_notes -P pager=off -c "SELECT id,reference_month,status,source_policy,meta_cursor,performance_cursor,meta_rows,hero_rows,position_rows,meta_last_error,performance_last_error,error_message FROM monthly_reference_versions ORDER BY reference_month DESC,started_at DESC LIMIT 8;"
```

اگر queue شکست خورد timer را شروع نکنید. اگر check ناقص بود API و پنج timer دیگر
فعال‌اند؛ فقط timer مرجع تا بررسی خروجی خاموش باقی می‌ماند.

بعد از queue، دو version_id تازه باید با سیاست v3 و پیشرفت صفر ساخته شده باشند؛
اولین tick ممکن است Cursor اوت را جلو برده باشد. اوت قبلی active می‌ماند؛
سپتامبر builder قبلی v2 failed/superseded می‌شود. اول اوت سپس سپتامبر پردازش
می‌شود. برای ماه چهارهفته‌ای ۱۲۸ batch Performance با timer یک‌دقیقه‌ای داریم؛
هر ماه حدود دو ساعت و چند دقیقه در حالت عادی زمان می‌برد، نه فوری. تأخیر شبکه
یا quota می‌تواند بیشترش کند. فرمان queue را برای دیدن پیشرفت دوباره اجرا نکنید؛
اجرای دوباره، بازخوانی تازه از صفر است. SQL بالا و پنل ادمین برای پایش کافی‌اند.
آگوست را دستی DELETE نکنید؛ اثبات دریافت از صفر، version_id و Cursor مستقل است.

پایان موفق: هر دو نسخهٔ تازه active، Meta=4، Performance=128 برای این دو ماه،
Position rows=380 و Hero rows مثبتِ واجد شرط؛ نسخهٔ اوت قبلی retired می‌شود و
نسخهٔ سپتامبر جایگزین، مرجع انتخابی مچ‌های اکتبر خواهد بود. تعداد ردیف‌های Meta
و Hero با دادهٔ واقعی تغییر می‌کند؛ برابر بودن با تعداد قدیمی شرط نیست.

## بررسی انجام‌شده و محدودیت

۴۲۳ تست API در ۶۵ فایل، ۱۳ تست پنل ادمین دسکتاپ، API build/TypeScript، desktop
build/TypeScript و release:prepare موفق‌اند. آزمون PostgreSQL سازگار PGlite
بازسازی تاریخی، حفظ sentinel نسخهٔ فعال، شروع مجدد بدون reset، کنارگذاشتن پاسخ
درحال‌انتقال نسخهٔ superseded و rollback فعال‌سازی با پوشش ناقص را کنترل کرد.
تست عمومی ۴۸ ماه در چهار سال، تغییر سال، ماه پنج‌هفته‌ای و سال کبیسه را پوشش داد.
دادهٔ واقعی همهٔ گروه‌ها و تکمیل دو مرجع روی VPS و نصب واقعی Windows هنوز بعد
از انتشار باید تأیید شوند. build محلی sparse فایل‌های public بدون تغییر این تسک
را کامل نداشت؛ assetهای موجود کاربر در ZIP بازنویسی/حذف نمی‌شوند.
هیچ commit/push یا استقرار VPS از محیط ساخت این ZIP انجام نشده است.
