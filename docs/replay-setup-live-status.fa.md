# راهنمای ریپلی، اجرای دوتا و وضعیت زندهٔ تحلیل

این تسک روی `origin/main` با commit پایهٔ `2f11918` و branch
`fix/replay-setup-live-status` آماده شده است. ZIP فقط فایل‌های تغییرکرده یا جدید را
با مسیر نسبی مخزن دارد؛ فایل حذف‌شدنی نداریم. سورس API، schema، ENV، Worker و
پارسر جاوا در این تسک تغییر نمی‌کنند.

## تغییر و علت

- ردیف‌های دارای job پس از خطای موقت polling دیگر رها نمی‌شوند. پذیرفته‌شدن
  درخواست شروع/تلاش مجدد فوراً بازخوانی History را فعال می‌کند. هنگام اجرای job
  بازخوانی هر ۵ ثانیه، summary ناقص هر ۲ ثانیه و History بیکار هر ۳۰ ثانیه است؛
  بازگشت focus/visibility و اتصال مجدد بازخوانی فوری دارند. درخواست‌های همزمان
  یک hook سری می‌شوند، نتیجهٔ درخواست لغوشده اعمال نمی‌شود و polling بعد از
  خروج متوقف می‌شود. دادهٔ کش‌شده هنگام بازخوانی باقی می‌ماند. Full analysis با
  برگشت اتصال دوباره وضعیت را می‌خواند.
- راهنمای تصویری شش‌مرحله‌ای فارسی/انگلیسی با تصویرهای SVG بازطراحی‌شدهٔ Steam،
  Explorer، دکمهٔ Open folder و انتخاب‌گر پوشه اضافه شده؛ جای کلیک هایلایت و
  شماره‌گذاری دارد. تصویرها بخشی از کد هستند؛ اسکرین‌شات حساب شخصی منتشر نمی‌شود.
- پیشوند `\\?\` مسیر canonical ویندوز معتبر بود؛ فقط در خروجی نمایشی پاک می‌شود.
  مسیر داخلی برای عملیات فایل canonical می‌ماند؛ UNC هم درست نمایش داده می‌شود.
  پوشهٔ نصب، `game`، `game/dota` یا `game/dota/replays` قابل انتخاب است.
- علت قابل‌اثبات خطای دانلود دسکتاپ: decoder فقط BZip2 می‌خواند، ولی spoolهای
  واقعی بررسی‌شده Zstandard بودند. نام تاریخی آرشیو `.dem.bz2`، فرمت محتوا را
  تضمین نمی‌کند. کلاینت اکنون بر اساس magic bytes، BZip2، Zstandard یا DEM خام
  را stream می‌کند و فقط فایل کامل با header معتبر را به `{matchId}.dem` تبدیل
  می‌کند. محدودیت ۲GB برای ورودی و خروجی، سقف window زدد ۱۲۸MB، timeout، مجوز
  مبدأ API و منع redirect حفظ شده‌اند. فایل temporary در خطا حذف و فایل موجود
  بازنویسی نمی‌شود. دانلود ناموفق با پیام قابل‌فهم فارسی/انگلیسی نشان داده می‌شود.
- هنگام انتقال job آماده‌شده از صف به دانلود محلی، دکمه‌های دانلود و تغییر پوشه
  تا پایان ذخیره قفل می‌مانند. پیشرفت فقط برای شناسهٔ دانلود جاری اعمال می‌شود.
  قطع موقت وضعیت سرور، درخواست منتظر را حذف نمی‌کند.
- دکمهٔ Launch Dota 2 بالای Account با آیکن محلی دوتا قرار دارد؛ فرمان native
  فقط URI ثابت `steam://rungameid/570` را به opener سیستم می‌دهد. ACL اختصاصی
  برای window اصلی ثبت شده و URL یا launch args از فرانت دریافت نمی‌شود.
  Steam مسیر نصب و راه‌اندازی کلاینت را مدیریت می‌کند؛ خود نرم‌افزار process
  بازی یا فایل بازی را تغییر نمی‌دهد. نصب Steam/بازی و ورود حساب در Steam لازم
  است. پیام UI فقط ارسال درخواست اجرا را تأیید می‌کند، نه اجرای موفق بازی.
  مرجع: https://developer.valvesoftware.com/wiki/Steam_browser_protocol
- تصاویر هیرو، آیتم، پوزیشن، باف، فونت و تصویرهای راهنما با دسکتاپ bundle می‌شوند؛
  این فایل‌ها از VPS fetch نمی‌شوند. آواتار Steam استثناست و می‌تواند remote باشد.

## وضعیت واقعی VPS که مبنای این تسک بود

در لاگ ارسالی ۸ اکتبر، VPS از `773076b` به `2f11918` به‌روز شد، build و preflight
موفق بودند و parser با Clarity 4.0.3/protobuf 6.3 نصب شد. importer هر دو مچ
`9033813921` و `9034129766` را با ۱۰ بازیکن و ۱۰ lane snapshot پردازش کرد؛ jobها
`completed`، آرشیو `active` و `local_replay_data` موجود بودند. پس برای این پچ
پارسر را دوباره نسازید، jobها را requeue نکنید و فایل‌های spool/آرشیو را حذف نکنید.
این evidence جای بررسی یک خطای تازهٔ شبکه یا یک مچ جدید را نمی‌گیرد.

## سیستم خودت — قبل از جایگزینی ZIP

از ریشهٔ پروژه، در PowerShell یا Git Bash:

```bash
git status -sb
git switch main
git fetch origin
git pull --ff-only origin main
git log -1 --oneline
git switch -c fix/replay-setup-live-status
```

قبل از switch باید working tree تمیز باشد؛ تغییرات قبلی خودت را روی branch خودشان
نگه دار. حالا فایل‌های ZIP را از ریشهٔ پروژه copy/replace کن. ZIP به حذف فایل نیاز
ندارد و شامل dist، node_modules، JAR یا ENV نیست.

```bash
npm ci
npm test
npm run test -w @dota-notes/api
npm run typecheck
npm run desktop:build
npm run desktop:installer
```

خروجی نصب ویندوز در `apps/desktop/src-tauri/target/release/bundle/nsis/` است.
Rust dependency و lockfile تغییر کرده‌اند؛ بیلد نخست dependency مربوط به Zstandard
را می‌گیرد. پیش‌نیاز MSVC/C++ همان پیش‌نیاز نصب فعلی Tauri است.

آزمون native اختیاری روی همان سیستم ویندوز:

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked
```

## تست واقعی بعد از نصب

1. Replay → Visual guide را در هر دو زبان باز کن؛ شش مرحله و دکمهٔ آخر Open folder
   را بررسی کن. از Steam آدرس نصب را کپی کن؛ در picker با Ctrl+L/Ctrl+V/Enter وارد
   آن شو و Select Folder را بزن. نمایش مسیر باید بدون پیشوند `\\?\` باشد.
2. ریپلی `9033813921` یا `9034129766` را دانلود کن. فایل `.dem` در
   `game/dota/replays` باید دیده شود، در تب دانلودشده‌ها باشد و فرمان کپی‌شدنی
   `playdemo replays/9033813921` در کنسول دوتا قابل استفاده باشد. فایل فشرده با
   پسوند `.dem` نباید ذخیره شود.
3. یک job تازهٔ تحلیل را شروع کن یا job خطادار را آگاهانه retry کن. بدون بستن
   برنامه باید از مراحل جاری به Analyzed برسد و IMP/Position بازخوانی شوند.
   پنجره را minimize/restore کن؛ هنگام offline دادهٔ قبلی باقی بماند و پس از
   اتصال، وضعیت تازه بیاید.
4. Steam را ببند و Launch Dota 2 را بزن. بازشدن Steam و درخواست اجرای دوتا را
   بررسی کن. این دکمه به تنظیم پوشهٔ ریپلی یا API وابسته نیست.

## Git پس از تست

```bash
git status -sb
git add .
git commit -m "fix(desktop): restore live analysis updates and improve replay setup"
git push -u origin fix/replay-setup-live-status
git switch main
git pull --ff-only origin main
git merge --no-ff fix/replay-setup-live-status -m "Merge branch 'fix/replay-setup-live-status'"
git push origin main
```

برای این پچ tag لازم نیست. پیش از `git add .` مطمئن شو فایل محرمانه یا تغییر
نامرتبط در status نیست.

## VPS — فقط پس از push شدن main

این تغییرات دسکتاپ‌اند و در runtime سرور اثری ندارند؛ checkout را برای یکسان‌بودن
کدها به‌روز کن. سرویس‌ها/تایمرها را متوقف نکن؛ npm ci، API build، release:prepare،
Next build، migration یا ساخت JAR لازم نیست.

```bash
cd /var/www/dota2notes
sudo -u dota2notes -H git status -sb
sudo -u dota2notes -H git fetch origin
sudo -u dota2notes -H git switch main
sudo -u dota2notes -H git pull --ff-only origin main
sudo -u dota2notes -H git log -1 --oneline
curl -fS http://127.0.0.1:4100/health/ready
curl -fS https://api.dota2notes.ir/health/live
```

اگر status تغییر محلی نشان داد، قبل از pull آن را بررسی کن؛ reset/clean نزن.
آزمون native را با نصب نسخهٔ جدید روی سیستم خودت و اتصال به همین API انجام بده.
readiness عمومی همچنان عمداً 404 است.

## بررسی انجام‌شده و حدودش

- `npm test`: ۲۷۸ تست وب و ۴۲۱ تست ریشه پاس.
- تست جداگانهٔ API: ۴۰۱ پاس؛ تست‌های دسکتاپ در ریشه: ۸۱ پاس.
- typecheck همهٔ workspaceها و Vite build موفق.
- ۴ تست Rust واقعی ماژول‌های codec/path با همان source در harness مستقل پاس:
  round-trip با zstd/bzip/raw، رد compressed HTML و stream ناقص، محدودیت ورودی
  و نمایش مسیرهای disk/UNC. build کامل Tauri در Linux به GTK/WebKit نیاز دارد؛
  این harness جای اجرای installer، دیالوگ native یا Steam روی ویندوز نیست.
- شش تصویر SVG راهنما render و بازبینی شدند. دانلود فایل واقعی از VPS به
  ویندوز و اجرای بازی در این محیط انجام نشده؛ مراحل آزمون بالا باید روی سیستم
  کاربر انجام شود.
