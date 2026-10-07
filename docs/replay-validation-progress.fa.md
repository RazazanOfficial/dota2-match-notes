# اعتبارسنجی ریپلی و وضعیت زندهٔ تحلیل

مبنای این تسک `main` در کامیت `0fb8d45` است. برنچ پیشنهادی: `fix/replay-validation-progress`.
فایل‌های ZIP فقط فایل‌های جدید/تغییرکرده در مسیر مخزن هستند؛ حذف دستی لازم نیست.

## علت و تغییرات

- ریپلی مچ `9028060850` کامل دانلود شده بود، اما تنها پیام `CDemoFileInfo` آن `match_id=0` و ده بازیکن داشت. پارسر پیش از تحلیل به‌علت شرط شناسه متوقف می‌شد؛ هشدار SLF4J علت شکست نبود.
- شناسهٔ مثبت نامرتبط همچنان رد می‌شود. برای شناسهٔ صفر، هر ده هیرو و تیم و تمام شناسه‌های اکانت معلوم با خلاصهٔ ذخیره‌شدهٔ همان مچ تطبیق داده می‌شوند. حداقل دو اکانت معلوم لازم است؛ مود و برنده نیز در صورت موجودبودن تطبیق داده می‌شوند. اطلاعات ناکافی یا نامرتبط پذیرفته نمی‌شوند. دادهٔ خام و فرمول Score عوض نشده‌اند.
- خطای پارسر در لاگ خصوصی worker با جزئیات محدود و حذف URL/credential ثبت می‌شود. هنگام timeout یا توقف، فرایند importer و فرزندان Java آن با هم متوقف می‌شوند.
- تاریخچهٔ صفحه‌بندی‌شده، وضعیت و مرحلهٔ صف تحلیل را در همان پاسخ برمی‌گرداند. داشبورد و مچ‌ها پس از ورود دوباره، پردازش جاری را نشان می‌دهند؛ برای این ردیف‌ها درخواست جداگانهٔ تحلیل نیاز نیست.
- خطاهای مرحله‌ای در باکس قرمز، با متن قابل‌فهم فارسی/انگلیسی و مرحلهٔ مربوط نمایش داده می‌شوند. کد خطا و stack برای کاربر نمایش داده نمی‌شود. تحلیل شکست‌خورده «کامل شد» نشان نمی‌دهد.
- در صف خالی، SDK آرشیو S3 بارگذاری نمی‌شود. preflight بدون `--check-db`، Drizzle و بررسی schema را بارگذاری نمی‌کند؛ اعتبارسنجی تنظیمات حفظ شده است. فرکانس timer و ظرفیت پردازش تغییر نکرده‌اند.

این تسک پکیج، متغیر محیطی، migration یا unit جدید ندارد. `parser.jar` فعلی حفظ می‌شود؛ wrapper جاوا هنگام پردازش کامپایل می‌شود.

## بررسی انجام‌شده

تست‌های API/صف و رابط، TypeScript همهٔ workspaceها و build API/دسکتاپ اجرا شده‌اند. wrapperهای ReplayInspector و LaneEvents با Java 17 و revision ثبت‌شدهٔ parser کامپایل شدند؛ حفظ ID مثبت در کنار پیام صفر، Steam ID و roster ده‌نفره نیز با پیام protobuf ساخته‌شده بررسی شد. فایل واقعی ریپلی فقط روی VPS است و نتیجهٔ نهایی آن هنوز تأیید نشده.

در سه اندازه‌گیری محلی، CPU import صف از حدود ۸۷–۱۴۱ به ۳۱–۳۹ میلی‌ثانیه و preflight تنظیمات از حدود ۴۲۱–۴۶۹ به ۶٫۷–۶٫۸ میلی‌ثانیه رسید. این اندازه‌گیری شامل زمان query دیتابیس/کار واقعی نیست و پیش‌بینی عدد مصرف VPS محسوب نمی‌شود. preflight با `--check-db` همچنان بررسی اتصال/schema را انجام می‌دهد.

## Git، تست و ساخت ویندوز

ابتدا در ریشهٔ پروژه وضعیت را ببین. اگر تغییر محلی داری، آن را قبل از switch/pull نگه دار؛ reset/clean لازم نیست.

```powershell
git status -sb
git fetch origin
git switch main
git pull --ff-only origin main
git log -1 --oneline
git switch -c fix/replay-validation-progress
```

اکنون فایل‌های ZIP را از ریشه copy/replace کن، سپس:

```powershell
npm test
npm run test -w @dota-notes/api
npm run typecheck
npm run api:build
npm run release:prepare -w @dota-notes/api
npm run desktop:installer
```

خروجی نصبی: `apps/desktop/src-tauri/target/release/bundle/nsis/`.
فایل‌های `dist` تولیدشده در Git ثبت نمی‌شوند؛ VPS از سورس build می‌گیرد. ZIP خروجی آمادهٔ API را هم دارد.

```powershell
git add .
git commit -m "fix: validate zero-ID replays and restore live analysis progress"
git push -u origin fix/replay-validation-progress
git switch main
git pull --ff-only origin main
git merge --no-ff fix/replay-validation-progress -m "Merge branch 'fix/replay-validation-progress'"
git push origin main
```

## استقرار روی VPS موجود، پس از push به main

checkout واقعی همین `/var/www/dota2notes` است. فولدر source دیگری نساز.
ENV در `/var/www/dota2notes/.env.production`، API در `apps/api/release` و وب Next در `apps/web` هستند.
در این پچ سورس وب و dependencyها تغییر نکرده‌اند؛ build مجدد Next لازم نیست. اگر همراه آن تغییر دیگری در وب/پکیج‌های وب merge کرده‌ای، قبل از start سایت `sudo -u dota2notes -H npm run build` را هم اجرا کن.

ابتدا وضعیت Git باید main و تمیز باشد:

```bash
cd /var/www/dota2notes
sudo -u dota2notes -H git status -sb
sudo -u dota2notes -H git log -1 --oneline
```

در بازهٔ کوتاه استقرار، سرویس‌ها متوقف می‌شوند؛ اگر هر فرمان خطا داد، قبل از ادامه همان خطا را بررسی کن.

```bash
sudo systemctl stop dota2notes-replay.timer dota2notes-sync-manual.timer dota2notes-opendota-parse.timer dota2notes-images.timer dota2notes-performance-reference.timer dota2notes-monitor.timer
sudo systemctl stop dota2notes-replay.service dota2notes-sync.service dota2notes-opendota-parse.service dota2notes-images.service dota2notes-performance-reference.service dota2notes-monitor.service
sudo systemctl stop dota2notes-api.service dota2notes.service
sudo -u dota2notes -H git pull --ff-only origin main
sudo -u dota2notes -H npm ci
sudo -u dota2notes -H npm run api:build
sudo -u dota2notes -H npm run release:prepare -w @dota-notes/api
sudo -u dota2notes -H npm ci --prefix apps/api/release --workspaces=false
sudo -u dota2notes -H env DOTENV_CONFIG_PATH=/var/www/dota2notes/.env.production npm run preflight --prefix apps/api/release --workspaces=false -- --check-db
sudo -u dota2notes -H env DOTENV_CONFIG_PATH=/var/www/dota2notes/.env.production npm run preflight --prefix apps/api/release --workspaces=false -- --role=replay
```

هر دو preflight باید `ok: true` باشند. migration جدید نداریم. اگر preflight ناسازگاری schema اعلام کرد، ادامه نده؛ نسخهٔ Git و migrationهای قبلی را بررسی کن.

```bash
sudo systemctl start dota2notes-api.service dota2notes.service
curl -fS http://127.0.0.1:4100/health/ready
curl -fS https://api.dota2notes.ir/health/live
sudo systemctl start dota2notes-replay.timer dota2notes-sync-manual.timer dota2notes-opendota-parse.timer dota2notes-images.timer dota2notes-performance-reference.timer dota2notes-monitor.timer
sudo systemctl status dota2notes-api.service dota2notes.service --no-pager -l
sudo systemctl list-timers --all --no-pager 'dota2notes-*'
```

`/health/ready` عمومی در nginx فعلی عمداً 404 است؛ readiness را محلی بررسی کن.
unitها تغییر نکرده‌اند؛ install مجدد، daemon-reload یا دست‌کاری ENV لازم نیست.

## تست واقعی و لاگ نتیجه

در نسخهٔ جدید نرم‌افزار، تحلیل مچ `9028060850` را دوباره درخواست کن. فایل کامل checkpoint، اگر هنوز موجود باشد، دوباره استفاده می‌شود.
وقتی پردازش شروع شد بین داشبورد و مچ‌ها جابه‌جا شو و برنامه را باز و بسته کن: «در صف پردازش»، مرحلهٔ جاری و سپس نتیجه باید از سرور بازیابی شوند. شکست احتمالی باید باکس قرمز فارسی/انگلیسی داشته باشد.

```bash
sudo journalctl -u dota2notes-replay.service --since "15 minutes ago" --no-pager -o cat | tail -100
sudo -u postgres psql -d dota_notes -P pager=off -c \
"SELECT j.match_id,j.status,j.phase,j.error_code,j.archive_status,
        d.local_replay_data IS NOT NULL AS has_analysis
 FROM local_replay_jobs j JOIN dota_matches d USING(match_id)
 WHERE j.match_id=9028060850;"
sudo journalctl -u dota2notes-replay.service --since "10 minutes ago" --no-pager | tail -60
```

برای این فایل انتظار داریم لاگ `replay_identity_roster_verified` و پس از موفقیت `status=completed` و `has_analysis=true` دیده شود. این نتیجه هنوز روی فایل واقعی VPS تأیید نشده؛ تست‌های ساختگی جای آن را نمی‌گیرند.
مصرف CPU اجرای صف خالی را با مقدار قبلی حدود ۱٫۸ ثانیه CPU در هر tick مقایسه کن. هزینهٔ تحلیل Java هنگام وجود job طبیعی است. خطاهای STRATZ 502 مربوط به مرجع آماری جدا هستند و این پچ رفع شبکهٔ STRATZ را ادعا نمی‌کند.
