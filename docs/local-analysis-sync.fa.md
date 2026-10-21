# اعتبار آنالیز محلی، دریافت دستی و آرشیو ریپلی — ۲۱ اکتبر ۲۰۲۶

پایه: main `24b4ce2`؛ branch: `fix/local-analysis-sync`.
ZIP فقط فایل‌های جدید/تغییرکردهٔ همین تسک در مسیر اصلی‌شان دارد. فایل نیازمند حذف نداریم. نسخهٔ ساخته‌شدهٔ `dist` داخل ZIP نیست؛ build و release:prepare الزامی‌اند.

## یافته‌ها از لاگ واقعی VPS

- `9054009159`: در `raw_data` نسخهٔ پارس OpenDota برابر 22، ولی `local_replay_data` و زمان پارس محلی خالی بودند. تشخیص parsed در history/repository به نسخه یا timeline OpenDota اعتماد می‌کرد و از benchmark آمادهٔ آن نمره می‌ساخت.
- `9053079932`، `9053920009` و `9054100423`: خروجی محلی ثبت شده بود، ولی worker بعد از parse در آپلود S3 شکست می‌خورد. API هم‌زمان analyzed=true و processing می‌داد. لاگ `9047541980` هم شکست آپلود و استفادهٔ دوباره از checkpoint را نشان می‌دهد؛ برای این شناسه همان query پایگاه داده در گزارش اولیه وجود نداشت.
- قطع آپلودهای چند مچ تقریباً روی مهلت 360 ثانیه بود؛ پیام عمومی قبلی علت transport را پنهان می‌کرد. از این داده به‌تنهایی نمی‌توان اختلال شبکه، کندی مسیر یا تنظیمات سرویس آرشیو را قطعی تفکیک کرد.
- حساب `76561198408204108` یک sync job منتظر از 29 آگوست داشت. query دریافت دستی همهٔ jobهای pending/processing، حتی scheduled منتظر هنگام خاموش بودن همگام‌سازی زمان‌بندی‌شده، را مانع می‌دانست. schema برای هر کاربر تنها یک job فعال می‌پذیرد؛ صرفاً حذف شرط از query کافی نبود.

## رفتار اصلاح‌شده

1. تنها خروجی محلی با هویت صحیح و timeline/ده slot معتبر می‌تواند تحلیل بسازد. OpenDota همچنان اطلاعات پایهٔ مچ، نتیجه، KDA، inventory نهایی و مشخصات دریافت ریپلی را تأمین می‌کند؛ marker نسخهٔ آن نشانهٔ اجرای Java نیست.
2. بعد از overlay محلی، benchmark، lane/position و فیلدهای پارس OpenDota با خروجی محلی مخلوط نمی‌شوند. purchase log و objective نیز از پارسر محلی می‌آیند. فرمول/وزن‌های IMP، Lane Efficiency و انتخاب مرجع ماهانه تغییر نکرده‌اند. اگر معیار معتبر برای ساخت نمره موجود نباشد نمره null می‌ماند، نه عدد ساخته‌شده از benchmark خارجی.
3. نسخهٔ projection تاریخچه به 3 رسیده است. نمره‌های قبلی که فقط منبع OpenDota داشتند در پاسخ تازه پنهان می‌شوند. تحلیل‌های محلی موجود در batch کوچک بازفرافکنی می‌شوند؛ مچ‌ها، مرجع آماری و replay محلی حذف نمی‌شوند.
4. ذخیرهٔ موفق نتیجهٔ محلی برای آماده شدن تحلیل کافی است. تلاش مجدد backup دیگر آن را به صف تحلیل یا مرحلهٔ دانلود برنمی‌گرداند؛ درخواست تحلیل آماده پیش از هر HEAD آرشیو پاسخ می‌گیرد. دانلود فایل همچنان به آرشیو تأییدشده وابسته است.
5. آرشیو فایل‌های بیش از 16MiB با multipart و بخش‌های 8MiB انجام می‌شود؛ هر بخش تا سه بار فقط برای خطای موقت تلاش می‌شود، شمارندهٔ پیشرفت دوبار حساب نمی‌شود، upload ناقص abort می‌شود و HEAD اندازه/SHA را تأیید می‌کند. درخواست‌ها timeout اتصال/پاسخ محدود دارند و سقف کل قبلی شش دقیقه حفظ است. در شروع تلاش، upload_bytes از صفر شمرده می‌شود. خطای امن operator شامل phase، نام/کد transport و HTTP status است؛ URL، secret و response body چاپ نمی‌شود. multipart روی شبیه‌ساز محلی S3 تست شده؛ موفقیت روی سرویس واقعی VPS هنوز باید بررسی شود.
6. دریافت دستی در transaction با قفل حساب انجام می‌شود. فقط scheduled منتظر به نفع درخواست صریح کاربر supersede می‌شود؛ manual فعال یا lease پردازش زنده کنار زده نمی‌شود. cooldown و تغییر صف با هم commit/rollback می‌شوند؛ استقلال روز/هفته/ماه باقی است. بازیابی leaseهای processing بدون locked_at نیز اضافه شده و recovery scheduled حتی با scheduled-sync خاموش اجرا می‌شود.
7. worker و importer قبل از پذیرفتن تکمیل، timeline معتبر محلی را کنترل می‌کنند؛ ده player placeholder کافی نیست. retry UI مرحلهٔ مرتبط با خطا را نگه می‌دارد. دسکتاپ تحلیل آماده را بر preparation قدیمی آرشیو مقدم می‌داند.
8. پیش‌فرض `OPENDOTA_PARSE_ENABLED=false` شده؛ در VPS timer قدیمی remote parse متوقف/غیرفعال می‌شود و مقدار قبلی ENV خاموش می‌شود. worker Java و دریافت اطلاعات پایهٔ OpenDota فعال می‌مانند.

Schema، migration، dependency، parser JAR و unit جدید نداریم. Next UI در این تسک بازنویسی نشده؛ API فعال Express و دسکتاپ اصلاح شده‌اند. تحلیل معتبر محلی در سطح Match مشترک است: اگر همین Match قبلاً محلی پردازش شده باشد، دریافت آن برای کاربر دیگر به اجرای دوبارهٔ Java نیاز ندارد.

## سیستم شخصی

ابتدا روی working tree تمیز؛ اگر status تغییر محلی نشان داد پیش از switch/pull آن را بررسی کنید:

```bash
git status -sb
git switch main
git fetch origin
git pull --ff-only origin main
git switch -c fix/local-analysis-sync
```

اکنون فایل‌های ZIP را از روت پروژه replace کنید؛ سپس:

```bash
npm ci
npm run test -w @dota-notes/api
npx vitest run apps/desktop/tests --maxWorkers=2
npm run api:build
npm run release:prepare -w @dota-notes/api
npm run desktop:build
npm run desktop:installer
```

نصاب ویندوز باید در سیستم کاربر ساخته/نصب شود؛ اینجا build frontend و TypeScript تأیید شده‌اند، نه ساخت NSIS ویندوز.

```bash
git diff --check
git status -sb
git add .
git commit -m "fix: require local replay analysis and recover blocked match sync"
git push -u origin fix/local-analysis-sync
git switch main
git pull --ff-only origin main
git merge --no-ff fix/local-analysis-sync -m "Merge branch 'fix/local-analysis-sync'"
git push origin main
```

## VPS موجود، بعد از push main

ابتدا status را ببینید. با تغییر محلی حل‌نشده ادامه ندهید؛ reset/clean نکنید. قبل از توقف timerها وضعیت را ثبت کنید؛ فقط timerهای قبلاً فعال را در پایان راه بیندازید. فهرست زیر timerهای فعال ثبت‌شدهٔ همین VPS است. توقف service می‌تواند کار جاری را قطع کند؛ checkpoint حفظ می‌شود و lease رهاشده طبق recovery worker برمی‌گردد.

```bash
cd /var/www/dota2notes
sudo -u dota2notes -H git status -sb
sudo -u dota2notes -H git fetch origin
sudo systemctl list-timers --all --no-pager 'dota2notes-*'
sudo systemctl stop dota2notes-replay.timer dota2notes-sync-manual.timer dota2notes-images.timer dota2notes-performance-reference.timer dota2notes-monitor.timer
sudo systemctl disable --now dota2notes-opendota-parse.timer
sudo systemctl stop dota2notes-replay.service dota2notes-sync.service dota2notes-opendota-parse.service dota2notes-images.service dota2notes-performance-reference.service dota2notes-monitor.service
sudo systemctl stop dota2notes-api.service dota2notes.service
sudo -u dota2notes -H git switch main
sudo -u dota2notes -H git pull --ff-only origin main
sudo -u dota2notes -H git log -1 --oneline
sudo sed -i 's/^OPENDOTA_PARSE_ENABLED=.*/OPENDOTA_PARSE_ENABLED=false/' /var/www/dota2notes/.env.production
sudo -u dota2notes -H npm ci
sudo -u dota2notes -H npm run api:build
sudo -u dota2notes -H npm run release:prepare -w @dota-notes/api
sudo -u dota2notes -H npm ci --prefix apps/api/release --workspaces=false
sudo -u dota2notes -H env DOTENV_CONFIG_PATH=/var/www/dota2notes/.env.production npm run preflight --prefix apps/api/release --workspaces=false -- --check-db
sudo -u dota2notes -H env DOTENV_CONFIG_PATH=/var/www/dota2notes/.env.production npm run preflight --prefix apps/api/release --workspaces=false -- --role=replay
sudo systemctl start dota2notes-api.service dota2notes.service
curl --retry 5 --retry-connrefused --retry-delay 1 -fS http://127.0.0.1:4100/health/ready
curl -fS https://api.dota2notes.ir/health/live
sudo systemctl start dota2notes-replay.timer dota2notes-sync-manual.timer dota2notes-images.timer dota2notes-performance-reference.timer dota2notes-monitor.timer
sudo systemctl start --no-block dota2notes-sync.service
```

اگر هر فرمان خطا داد همان‌جا بررسی شود؛ به بخش بعد نروید. برای این task migration و Next build لازم نیست؛ source/dependency وب تغییر نکرده است. readiness عمومی nginx عمداً 404 است؛ readiness را محلی بررسی کنید. timer OpenDota Parse را دوباره start نکنید.

## بررسی واقعی پس از استقرار

در نصاب جدید و در حالت آنلاین: `9054009159` تا وقتی پارس محلی ندارد باید بدون IMP و بدون تحلیل آماده باشد. مچ‌های محلی آماده نباید با خطای backup دوباره صف تحلیل نشان دهند؛ نبود معیار امتیاز معتبر می‌تواند نمره را خالی کند. یک دریافت روزانه با حساب دوستتان بزنید؛ job scheduled قدیمی منتظر باید جای خود را به درخواست manual بدهد. job manual واقعاً فعال همچنان 409 می‌دهد؛ این مانع پردازش موازی صحیح است.

برای جلو انداختن فقط retry آرشیو چهار مچ گزارش‌شده، بدون حذف فایل/نتیجه یا صفر کردن attempts، فرمان اختیاری زیر قابل اجراست. processing زنده را تغییر نمی‌دهد:

```bash
sudo -u postgres psql -d dota_notes -P pager=off -c \
"UPDATE local_replay_jobs SET run_after=now()
 WHERE status='pending' AND error_code='replay_archive_upload_failed'
 AND match_id IN (9053079932,9053920009,9054100423,9047541980)
 RETURNING match_id,status,phase,attempts;"
sudo systemctl start --no-block dota2notes-replay.service
```

خروجی وضعیت و لاگ‌ها را بعد از تست UI در یک نوبت بگیرید؛ هیچ secret یا response خام چاپ نمی‌شود:

```bash
sudo -u postgres psql -d dota_notes -P pager=off -c \
"SELECT d.match_id,d.local_replay_parsed_at,
 jsonb_array_length(CASE WHEN jsonb_typeof(d.local_replay_data->'players')='array' THEN d.local_replay_data->'players' ELSE '[]'::jsonb END) AS local_players,
 j.status,j.phase,j.attempts,j.upload_bytes,j.archive_status,j.error_code,j.run_after
 FROM dota_matches d LEFT JOIN local_replay_jobs j USING(match_id)
 WHERE d.match_id IN(9054009159,9053079932,9053920009,9054100423,9047541980)
 ORDER BY d.match_id;
 SELECT s.kind,s.status,s.attempts,s.locked_at,s.run_after,s.error_message
 FROM sync_jobs s JOIN users u ON u.id=s.user_id
 WHERE u.steam_id='76561198408204108' ORDER BY s.created_at DESC LIMIT 6;"
sudo journalctl -u dota2notes-replay.service --since '15 minutes ago' --no-pager -o cat | tail -100
sudo journalctl -u dota2notes-sync.service -u dota2notes-api.service --since '15 minutes ago' --no-pager -o cat | tail -70
```

archive_status=active و job_complete موفقیت آپلود واقعی را نشان می‌دهند. اگر `replay_transport_failure` باقی ماند، name/transportCode/httpStatus ثبت‌شده برای تشخیص مسیر واقعی لازم است؛ عبور تست محلی به معنای تأیید شبکهٔ VPS نیست. داده‌های مرجع آگوست/سپتامبر یا خروجی پارسر را برای این بررسی پاک نکنید.

## اعتبارسنجی این تحویل

- ۴۲۸ تست API در ۶۵ فایل؛ PostgreSQL/PGlite + Express، سناریوی OpenDota-only، local-ready + archive retry، projection قدیمی، اولویت manual، rollback cooldown، lease بدون locked_at و worker lifecycle.
- ۱۳۵ تست دسکتاپ در ۱۵ فایل؛ آماده بودن نتیجه هنگام backup retry، حذف preparation قدیمی، تکمیل در Quick Summary و کش/refresh موجود.
- انتقال واقعی بایت‌ها به شبیه‌ساز محلی S3: single PUT و GET، multipart سه‌بخشی، خرابی موقت بخش دوم، شمارش درست پیشرفت، abort خطای دائمی و تأیید SHA/اندازه.
- TypeScript/build API و desktop و release:prepare موفق. runtime و source چهار اسکریپت parser هم‌نسخه‌اند.
- Windows installer، JVM با DEM واقعی و storage واقعی VPS در محیط ساخت اجرا نشده‌اند. هیچ commit/push یا استقرار از این محیط انجام نشده است.
