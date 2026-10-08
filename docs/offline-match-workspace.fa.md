# فضای کار آفلاین و جدول مچ‌ها

ترتیب ستون‌ها، عرض جدول و آیکن باف با [پچ بعدی](fixed-window-loadout.fa.md) به‌روز شده‌اند؛ دستورهای جاری آن تسک را استفاده کنید.

مبنای این تسک `origin/main` در commit `3285c5f` است، روی branch مستقل `fix/offline-match-workspace`. استقرار این commit روی VPS از روی Git فرض نشده است.

## رفتار جدید

- فقط دایرهٔ پردازش می‌چرخد؛ border قدیمی SVG حذف شده است. مراحل با فلش واضح جمع/باز می‌شوند. عنوان اضافی پنل حذف شده؛ چراغ زنده سبز، retry نارنجی با شمارندهٔ کوتاه و شکست قرمز است. متن خطای کاربرپسند قبلی حفظ شده است.
- جدول در fa/en ترتیب ثابت دارد: هیرو، پوزیشن، نتیجه، K/D/A، IMP، نوع بازی، تحلیل، مدت، شناسه، فلش جزئیات، آیتم‌ها. جهت فلش فارسی بالا/راست و انگلیسی بالا/چپ است. فاصلهٔ ستون‌ها یکنواخت و شناسه وسط‌چین است. در پنجرهٔ باریک جدول اسکرول افقی دارد تا خوانایی و اندازهٔ آیتم حفظ شود.
- شش اسلات آیتم نهایی با فاصله نمایش داده می‌شوند؛ permanent_buffs واقعی، Scepter/Shard/Moon مصرف‌شده و پرداخت Track دارای منبع صریح کنار آن‌ها قرار می‌گیرند. tooltip مقدار باف و گیرندگان/طلای ثبت‌شده را نشان می‌دهد. enum باف‌ها از odota/dotaconstants `b4b5a8299de5f3e0704e62fdd04a6a54c4d4548e` تطبیق شده؛ شناسهٔ جدید ناشناخته حذف نمی‌شود. آیکن تواناییِ ناموجود fallback دارد.
- Track فقط از combat log دارای inflictor Track، منبع و گیرندهٔ قابل تشخیص استخراج می‌شود؛ برای Rubick نیز همان انتساب عمومی استفاده می‌شود. proximity، gold_reasons عمومی یا هیرو بودن Bounty Hunter، دلیل نسبت دادن مقدار نیست. اگر دادهٔ parser منبع صریح ندهد باف Track ساخته نمی‌شود. این قابلیت ادعای بازسازی طلای ثبت‌نشده ندارد. جمع‌آوری در همان گذر موجود lane-events انجام می‌شود؛ Java اضافه اجرا نمی‌شود. ریپلی‌های قدیمی برای دریافت این فیلد تازه به parse دوباره نیاز دارند؛ این تسک خودکار آن‌ها را دوباره صف نمی‌کند. permanent_buffs موجود OpenDota بدون parse تازه قابل نمایش‌اند.
- نوع بازی در فارسی ترجمه می‌شود. عدد IMP پنج سطح رنگ دارد: کمتر از ۳۰ قرمز، ۳۰ تا کمتر از ۵۰ نارنجی، ۵۰ تا کمتر از ۷۰ آبی، ۷۰ تا کمتر از ۹۰ سبز، ۹۰ به بالا آبی پررنگ. نوار IMP رنگ تم را حفظ می‌کند.
- داشبورد ۱۰ مچ نشان می‌دهد، دو بار «بارگذاری بیشتر» به ۲۰ و ۳۰ می‌رسد و بعد بین بلوک‌های ۳۰تایی جابه‌جا می‌شود. صفحهٔ مچ‌ها تمام هفته/ماه انتخاب‌شده را نمایش می‌دهد؛ دریافت شبکه در batchهای حداکثر ۱۰۰تایی است، نه پاسخ نامحدود. API pageSize/offset و hero را اعتبارسنجی می‌کند. شرایط مالکیت مچ و محدودهٔ تاریخ حفظ شده‌اند.
- نمودار در چیدمان دو ستونه sticky است؛ با کلیک هیرو/پوزیشن، جدول و هر دو حلقه با هم فیلتر می‌شوند. دو فیلتر به هر ترتیب قابل ترکیب‌اند. Undo2 وسط حلقه هر دو را پاک می‌کند. نمودار کنترل هفته/ماه مستقل خودش را دارد؛ کلیک یک segment جدول را به همان بازه می‌برد. در چیدمان کوچکِ تک‌ستونه نمودار معمولی است تا روی جدول نیفتد.
- اسکرول برنامه و جدول نرم است؛ چرخ موس فضای کار با requestAnimationFrame نرم می‌شود. dialog، ورودی، اسکرول داخلی، touch، zoom و کلیدهای پیمایش رفتار بومی دارند؛ reduced-motion انیمیشن را غیرفعال می‌کند.

## کش آفلاین و احراز هویت

هدر به جای breadcrumb، Online/Offline Mode دارد. بعد از یک ورود موفق و دریافت داده با این نسخه، پروفایل و آخرین پاسخ‌های تاریخچه، جزئیات مچ، تحلیل و وضعیت دریافت ذخیره می‌شوند. بازگشت به صفحات، دادهٔ شناخته‌شده را فوراً نشان می‌دهد و آنلاین در پس‌زمینه تازه می‌کند؛ تقویم منتظر پاسخ شبکه نمی‌ماند. قطع شبکه یا پاسخ 5xx ورود را پاک نمی‌کند. پاسخ 401 واقعی یا خروج از حساب، پروفایل/کش آن حساب و توکن بومی را پاک می‌کند. ثبت‌نام ناقص همچنان به Wizard می‌رود و با کش مجوز تکمیل نمی‌گیرد.

کش فقط به Steam ID همان حساب دسترسی دارد و fingerprint توکن را تطبیق می‌دهد؛ توکن خام، رمز، کد بازیابی و درخواست‌های نوشتن در localStorage ذخیره نمی‌شوند. پاسخ دیرهنگام حساب قبلی وارد کش حساب جدید نمی‌شود. بودجهٔ کش حدود ۲ میلیون کاراکتر JSON و ۸۰ ورودی حافظه است؛ دادهٔ قدیمی‌تر هنگام پرشدن حذف می‌شود. localStorage رمزگذاری نیست و مثل دادهٔ معمول برنامه روی دستگاه کاربر باقی می‌ماند. logout آن را پاک می‌کند. داده‌ای که هنوز دیده/دریافت نشده آفلاین ساخته نمی‌شود؛ کش تضمین دانلود همهٔ تاریخچه نیست.

آنلاین بودن صرفاً وضعیت دسترسی است و مجوز ورود/عملیات را عوض نمی‌کند. وقتی اتصال در دسترس نیست، عملیات دریافت مچ، شروع تحلیل یا دانلود ریپلی پیام fa/en نیاز به اتصال می‌دهد؛ درخواست نوشتن ذخیره و بعداً خودکار ارسال نمی‌شود. اقدام‌های محلی مثل دیدن ریپلی‌های دانلودشده مستقل‌اند. فایل‌های تصاویر محلی با build موجود می‌آیند؛ آیکن توانایی CDN در نبود شبکه ممکن است fallback شود.

## آزمون و محدودیت محیط

تست‌ها: کش حساب جدا، fingerprint، پاسخ 401، logout و race؛ بازگشت آفلاین بدون login؛ باقی ماندن onboarding ناقص؛ load-more و بلوک بعد؛ تمام بازه؛ فیلتر هیرو/پوزیشن به هر ترتیب؛ جدول دو زبان، رنگ IMP، شش آیتم؛ retry و جمع‌شدن پنل؛ تقویم آفلاین و پیام فقط هنگام submit؛ API با pageSize/offset/hero معتبر/نامعتبر و عدم ارسال raw payload؛ باف‌های واقعی و انتساب صریح Track.

تست root (۲۷۸ تست وب و ۴۰۱ تست مشترک/دسکتاپ)، تست کامل API (۴۰۰ تست)، typecheck همهٔ workspaceها، migration:audit، API build و release:prepare موفق شدند. تست‌های دسکتاپ به‌تنهایی ۶۲ مورد بودند. Next و Vite در محیط محدود این اجرا مشکل خواندن آمار RSS سیستم داشتند؛ با یک preload موقت خارج مخزن برای جایگزینی صرفاً memoryUsage با V8/rusage، بیلد کامل موفق شد. این فایل در پچ نیست و روی سیستم شخصی/VPS دستورهای معمول استفاده می‌شوند. مرورگر headless محیط هم با SIGTRAP بسته شد، بنابراین بررسی بصری screenshot تأیید نشده است. installer ویندوز و اتصال/ریپلی واقعی VPS در این محیط تست نشده‌اند؛ پایین، تست عملی نوشته شده است.

## سیستم شخصی

در ریشهٔ پروژه، ابتدا وضعیت باید تمیز باشد. اگر تغییر ثبت‌نشده داری آن را نگه دار و switch/pull ناسازگار را ادامه نده.

```powershell
git status -sb
git fetch origin
git switch main
git pull --ff-only origin main
git log -1 --oneline
git switch -c fix/offline-match-workspace
```

فایل‌های ZIP را از ریشه copy/replace کن. فایل حذف‌شدنی نداریم. package/lock، ENV، migration و JAR تغییر نکرده‌اند. اگر dependencies آماده نیستند `npm ci` بزن، سپس:

```powershell
npm test
npm run test -w @dota-notes/api
npm run typecheck
npm run api:build
npm run release:prepare -w @dota-notes/api
npm run build
npm run desktop:installer
```

installer: `apps/desktop/src-tauri/target/release/bundle/nsis/`. ZIP شامل خروجی تغییرکردهٔ API runtime هم هست؛ dist در Git ignore می‌ماند و در VPS با release:prepare دوباره ساخته می‌شود.

```powershell
git add .
git commit -m "fix: cache offline workspace and refine match history"
git push -u origin fix/offline-match-workspace
git switch main
git pull --ff-only origin main
git merge --no-ff fix/offline-match-workspace -m "Merge branch 'fix/offline-match-workspace'"
git push origin main
```

## استقرار VPS پس از push به main

checkout همان `/var/www/dota2notes`، API runtime همان `apps/api/release` و ENV همان `.env.production` است. فولدر source جدید، migration، تغییر ENV، تعویض JAR یا unit نداریم. وب هنوز فعال است و چون فایل مشترک جزئیات/باف تغییر کرده، Next build هم لازم است.

```bash
cd /var/www/dota2notes
sudo -u dota2notes -H git status -sb
sudo -u dota2notes -H git log -1 --oneline
```

اگر Git تغییر ثبت‌نشده نشان داد، قبل از pull بررسی کن. اگر هر دستور زیر شکست خورد، ادامه نده و خروجی را بفرست. این روش خدمات را در بازهٔ build متوقف می‌کند؛ آرشیو و parser بیرون checkout هستند.

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

هر دو preflight باید `ok: true` باشند. سپس:

```bash
sudo systemctl start dota2notes-api.service dota2notes.service
curl --retry 5 --retry-connrefused --retry-delay 1 -fS http://127.0.0.1:4100/health/ready
curl -fS https://api.dota2notes.ir/health/live
sudo systemctl start dota2notes-replay.timer dota2notes-sync-manual.timer dota2notes-opendota-parse.timer dota2notes-images.timer dota2notes-performance-reference.timer dota2notes-monitor.timer
sudo systemctl status dota2notes-api.service dota2notes.service --no-pager -l
sudo systemctl list-timers --all --no-pager 'dota2notes-*'
```

ready عمومی در nginx فعلی عمداً 404 است؛ محلی بررسی می‌شود.

## تست عملی بعد از استقرار

1. installer جدید را اجرا کن، آنلاین وارد شو، داشبورد/مچ‌ها و یک جزئیات را باز کن تا کش ساخته شود. تعداد و آیتم‌ها، FA/EN، فلش و IMP را بررسی کن.
2. اینترنت سیستم را قطع کن؛ Ctrl+R و بستن/بازکردن اپ باید همان حساب تکمیل‌شده و دادهٔ ذخیره‌شده را نشان دهد. تقویم باید بدون لودر باز شود. با زدن دریافت/تحلیل/دانلود پیام آفلاین بگیر. خاموش شدن سرویس هم همان مسیر کش را دارد.
3. اینترنت را وصل کن؛ بعد از probe هدر آنلاین و داده تازه می‌شود. از آفلاین logout کن؛ دوباره اپ را باز کن و مطمئن شو حساب قبلی نمایش داده نمی‌شود.
4. روی هیرو و سپس پوزیشن و برعکس کلیک کن؛ هر دو حلقه و جدول باید فیلتر شوند و فلش مرکز reset کند. نمودار مستقل هفته/ماه و لیست کامل بازه را بررسی کن.
5. برای replay جدید با باف/Track، tooltip را با اطلاعات واقعاً موجود مقایسه کن. اگر Track در دادهٔ صریح نیست، نبودنش با مبلغ صفر فرق دارد؛ چیزی تخمین زده نمی‌شود. اگر پردازش شکست خورد لاگ اپراتور زیر را بفرست، نه secrets:

```bash
sudo journalctl -u dota2notes-api.service -u dota2notes-replay.service --since "10 minutes ago" --no-pager -o cat | tail -100
```
