# عرض فضای کار، اندازهٔ ثابت پنجره و باف‌ها

**سند تاریخی:** این مرحله در `773076b` ادغام شد. رفتار ثابت پنجره و wrap جدول با تسک `fix/resizable-match-workspace` جایگزین شده است؛ برای رفتار جاری و استقرار [راهنمای جدید](resizable-match-workspace.fa.md) را بخوانید. اصلاح باف‌ها همچنان برقرار است.

مبنای تسک `origin/main` در commit `db47f0e` (merge پچ offline-match-workspace)، branch مستقل `fix/fixed-window-loadout` است. نسخهٔ مستقر VPS تنها با خروجی همان VPS تأیید می‌شود.

## تغییرات

- max-width قدیمی ۱۳۲۰ از فضای کار برداشته شده؛ محتوا تمام عرضِ بعد از سایدبار را با حاشیهٔ ۱۴ تا ۲۸ پیکسل استفاده می‌کند و به دیواره نمی‌چسبد. عرض جدول و ردیف‌ها ۱۰۰٪ است؛ آیتم‌ها و باف‌ها اندازهٔ جدول را نامحدود نمی‌کنند. هیچ ستون با مخفی کردن overflow حذف نشده است.
- ترتیب fa/en ثابت است: Hero، Pos، W/L، KDA، IMP، Mode، Analysis، Duration، Match ID، Items، Details. آخرین فلش همچنان فارسی بالا/راست و انگلیسی بالا/چپ است.
- آیتم‌ها در چیدمان بزرگ ۵۲×۳۶ و باف‌ها ۳۶×۳۶ هستند، در مقایسه با Hero ۶۴×۳۶. چیدمان کوچک آیتم ۴۴×۳۰ و باف ۳۲×۳۲ دارد. شش اسلات همواره نمایش داده می‌شوند؛ در جدول میانی سه‌تایی در دو ردیف‌اند و در جدول کوچک گروه آیتم‌ها به خط مستقل می‌رود. باف‌ها در فضای موجود wrap می‌شوند؛ ظرفیت بیشترِ باف باعث اسکرول افقی نمی‌شود. مودهای بلند انگلیسی/فارسی wrap می‌شوند.
- تنظیمات «اندازهٔ پنجره» با کارت نمایشگر، نسبت ابعاد، اندازه و انتخاب فعال اضافه شده است. گزینه‌ها ۸۰۰×۴۵۰، ۹۶۰×۵۴۰، ۱۱۵۲×۶۴۸، ۱۲۸۰×۷۲۰، ۱۴۴۰×۸۱۰، ۱۶۰۰×۹۰۰، ۱۷۲۸×۹۷۲، ۱۶۸۰×۷۲۰ (۲۱:۹)، ۲۲۴۰×۱۲۶۰ هستند؛ سایر گزینه‌ها ۱۶:۹ هستند. اعداد logical pixel هستند؛ اندازهٔ فیزیکی به Scale ویندوز وابسته است.
- resize دستی و maximize غیرفعال‌اند. انتخاب اندازه بعد از موفقیت ذخیره می‌شود و راه‌اندازی بعدی آن را برمی‌گرداند. بدون ترجیح ذخیره‌شده، بزرگ‌ترین ۱۶:۹ قابل جا شدن انتخاب می‌شود. فضای واقعی کارِ نمایشگر، نوار وظیفه، DPI و اندازهٔ واقعی قاب/عنوان لحاظ می‌شوند؛ ۱۲ logical pixel هم در هر طرف محفوظ است. گزینهٔ نامناسب غیرفعال است و اگر نمایشگر کوچک‌تر شد نزدیک‌ترین preset مناسب استفاده می‌شود. با برگشت به نمایشگر قبلی، ترجیح اصلی کاربر حفظ می‌شود. در فضای کوچک‌تر از حداقل ۸۰۰×۴۵۰ به‌علاوهٔ قاب، preset مناسب نداریم و خطای خوانا نمایش داده می‌شود.
- کنترل اندازه در برنامهٔ نصبی فعال است؛ preview مرورگر پنجرهٔ سیستم را تغییر نمی‌دهد. در شروع، تا انتخاب اندازه لودینگ نمایش داده می‌شود؛ تغییر اندازه در تنظیمات صفحه را به ورود/لودینگ کامل نمی‌برد. اندازهٔ موقت اولیهٔ native ۹۶۰×۵۴۰ است.
- فقط مجوزهای current/primary monitor، inner/outer size، set-size و center به capability پنجرهٔ main افزوده شده‌اند. Rust، dependency و lock تغییر نکرده‌اند. مجوزهای موجود listen/unlisten برای تشخیص move/scale کافی‌اند.
- باف ۱۶ گزارش‌شده در دادهٔ واقعی Lifestealer به Feast / Permanent health متصل شده؛ نام و معنای Feast از متن بازی Valve در `abilities_english.txt` تطبیق شده است. عدد شناسهٔ ۱۶ از گزارش کاربر آمده، نه enum قدیمی ناقص odota. این یک نگاشت عمومی نوع باف است و Match/Hero ID خاص برای تغییر مقدار استفاده نمی‌شود. مقدار موجود stack_count حفظ می‌شود و تبدیل/امتیازسازی تازه نداریم. باف Tome هم آیتم درست ۲۵۷ را دارد.
- دوازده آیکن توانایی از CDN رسمی Steam داخل `apps/desktop/public/buffs/` قرار دارند؛ اینترنت برای نمایش باف شناخته‌شده لازم نیست. پاسخ‌های قدیمیِ کش با key=permanent_buff_16 نیز در UI اصلاح می‌شوند. باف آیندهٔ ناشناخته با عنوان fa/en «باف ناشناخته / Unrecognized buff» و آیکن هیرو دیده می‌شود؛ به آن نام یا نوع حدسی نسبت داده نمی‌شود. key اصلی backend محفوظ است. tooltip باف‌های شناخته‌شده فارسی/انگلیسی است.

منابع فنی: [Window API](https://v2.tauri.app/reference/javascript/api/namespacewindow/)، [متن Valve در GameTracking-Dota2](https://github.com/SteamDatabase/GameTracking-Dota2/blob/master/game/dota/pak01_dir/resource/localization/abilities_english.txt)، [آیکن Feast در Steam](https://steamcdn-a.akamaihd.net/apps/dota2/images/dota_react/abilities/life_stealer_feast.png).

## تست و حدود تأیید

تست‌ها انتخاب و عدم پذیرش اندازهٔ نامناسب، DPI/frame/work-area، حفظ ترجیح، StrictMode، نمایش کارت و تغییر نمایشگر را بررسی می‌کنند. باف ۱۶ در backend و کش قدیمی UI، نام fa/en، آیکن محلی و fallback شناسهٔ آینده بررسی شده‌اند. تست‌های قبلی جدول با ترتیب جدید به‌روز شدند. ACLها با schema خود نسخهٔ نصب‌شدهٔ Tauri اعتبارسنجی شدند؛ PNGها با signature فایل بررسی شدند. محاسبهٔ حداقل عرض ستون‌ها برای تمام presetها کنترل شده است، اما این جای بررسی تصویری روی WebView ویندوز را نمی‌گیرد.

`npm test` با ۲۷۸ تست وب و ۴۰۹ تست ریشه، و تست مستقل API با ۴۰۱ تست پاس شدند. typecheck همهٔ workspaceها، API build، release:prepare و Vite build موفق‌اند. Next build معمول این محیط محدود در memoryUsage با ENOENT uv_resident_set_memory شکست خورد؛ بیلد کامل با preload موقت V8/rusage بیرون مخزن موفق شد. آن فایل وارد ZIP/Git نشده؛ روی سیستم شخصی و VPS دستور معمول build استفاده می‌شود. installer ویندوز، DPI واقعی WebView، scrollbar واقعی و اتصال production اینجا اجرا نشده‌اند و باید پس از نصب بررسی شوند.

## سیستم شخصی: Git، جایگزینی و اجرا

ابتدا در ریشهٔ پروژه با Git تمیز:

```powershell
git status -sb
git fetch origin
git switch main
git pull --ff-only origin main
git log -1 --oneline
git switch -c fix/fixed-window-loadout
```

فایل‌های ZIP را از ریشه copy/replace کن؛ فایل حذف‌شدنی نداریم. dependencies آماده نیستند `npm ci` بزن. سپس:

```powershell
npm test
npm run test -w @dota-notes/api
npm run typecheck
npm run api:build
npm run release:prepare -w @dota-notes/api
npm run build
npm run desktop:installer
```

installer: `apps/desktop/src-tauri/target/release/bundle/nsis/`. ZIP فقط فایل‌های تغییرکرده/جدید با مسیر نسبی مخزن و خروجی API runtime تغییرکرده دارد. dist در Git ignore است؛ VPS خروجی را از سورس می‌سازد.

```powershell
git add .
git commit -m "fix: widen workspace and add fixed window sizes with local buff icons"
git push -u origin fix/fixed-window-loadout
git switch main
git pull --ff-only origin main
git merge --no-ff fix/fixed-window-loadout -m "Merge branch 'fix/fixed-window-loadout'"
git push origin main
```

## VPS پس از push main

checkout همان `/var/www/dota2notes` است؛ API runtime `apps/api/release`، Next در `apps/web` و ENV `.env.production` ریشه است. تغییر schema، migration، ENV، JAR یا systemd نداریم. اصلاح نام باف در API و وب مشترک است؛ API build/release:prepare و Next build هر دو لازم‌اند.

```bash
cd /var/www/dota2notes
sudo -u dota2notes -H git status -sb
sudo -u dota2notes -H git log -1 --oneline
```

اگر Git تغییر ثبت‌نشده داشت قبل از pull بررسی کن؛ هر فرمان خطا داد ادامه نده و لاگش را بفرست. سرویس‌ها برای build موقتاً متوقف می‌شوند:

```bash
sudo systemctl stop dota2notes-replay.timer dota2notes-sync-manual.timer dota2notes-opendota-parse.timer dota2notes-images.timer dota2notes-performance-reference.timer dota2notes-monitor.timer
sudo systemctl stop dota2notes-replay.service dota2notes-sync.service dota2notes-opendota-parse.service dota2notes-images.service dota2notes-performance-reference.service dota2notes-monitor.service
sudo systemctl stop dota2notes-api.service dota2notes.service
sudo -u dota2notes -H git pull --ff-only origin main
sudo -u dota2notes -H npm ci
sudo -u dota2notes -H npm run api:build
sudo -u dota2notes -H npm run release:prepare -w @dota-notes/api
sudo -u dota2notes -H npm ci --prefix apps/api/release --workspaces=false
sudo -u dota2notes -H npm run build
sudo -u dota2notes -H env DOTENV_CONFIG_PATH=/var/www/dota2notes/.env.production npm run preflight --prefix apps/api/release --workspaces=false -- --check-db
sudo -u dota2notes -H env DOTENV_CONFIG_PATH=/var/www/dota2notes/.env.production npm run preflight --prefix apps/api/release --workspaces=false -- --role=replay
```

هر دو preflight باید ok:true باشند. بعد:

```bash
sudo systemctl start dota2notes-api.service dota2notes.service
curl --retry 5 --retry-connrefused --retry-delay 1 -fS http://127.0.0.1:4100/health/ready
curl -fS https://api.dota2notes.ir/health/live
sudo systemctl start dota2notes-replay.timer dota2notes-sync-manual.timer dota2notes-opendota-parse.timer dota2notes-images.timer dota2notes-performance-reference.timer dota2notes-monitor.timer
sudo systemctl status dota2notes-api.service dota2notes.service --no-pager -l
sudo systemctl list-timers --all --no-pager 'dota2notes-*'
```

readiness عمومی همچنان عمداً 404 است؛ محلی تست می‌شود.

## تست عملی

نسخهٔ نصبی تازه را نصب کن. در تنظیمات اندازه‌های مجاز را انتخاب کن و بعد از بستن/بازکردن، حفظ اندازه را بررسی کن. resize دستی و maximize نباید فعال باشند. در هر دو زبان شش آیتم، باف‌های بیشتر، مود طولانی، فلش آخر و نبود اسکرول افقی را ببین. در اندازهٔ کوچک، همهٔ شش آیتم در خط/ردیف دیگر دیده می‌شوند، نه مخفی. روی هر نمایشگر خودت و Scale معمول ویندوز تست کن؛ در صورت استفاده از دو مانیتور، انتقال به نمایشگر کوچک‌تر و برگشت را هم امتحان کن.

مچ Lifestealer را آنلاین تازه کن و tooltip سلامتی دائمی و مقدار واقعی را بررسی کن. سپس اینترنت را قطع و دوباره همان مچ را باز کن؛ آیکن باف محلی باید دیده شود. ریپلی/محاسبهٔ مجدد برای اصلاح نام باف لازم نیست. باف آیندهٔ هنوز ناشناخته ممکن است عنوان عمومی بگیرد؛ برای شناسایی‌اش دادهٔ واقعی/نوع باف لازم است، نه حدس.
