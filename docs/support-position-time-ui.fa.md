# پوزیشن ساپورت‌های چرخشی، ساعت ۲۴ ساعته و گزارش نمایشی

این تسک از `origin/main` با commit `8801541` (merge اصلاح اعتبارسنجی ریپلی) روی branch `fix/support-position-time-ui` ساخته شده است. نتیجهٔ واقعی مچ `9032098145` هنوز باید پس از استقرار روی VPS بررسی شود.

## تغییر رفتار

- وقتی پنج بازیکن تیم موجودند، پوزیشن‌های ۱، ۲ و ۳ با اطمینان حداقل ۶۰ مشخص‌اند و دقیقاً دو پوزیشن نامشخص باقی مانده‌اند، Safe/Off Lane آن دو مقایسه می‌شود. سهم Mid در این مقایسه دخالت ندارد؛ چرخش به Mid نباید نقش اولیهٔ ساپورت را پنهان کند.
- دادهٔ موجود `lane_pos` جمع ده دقیقهٔ اول است، نه مسیر زمان‌دار دقیقه‌به‌دقیقه. شواهد LH@10 و Ward همان منطق قبلی را تغذیه می‌کنند. در fallback، هر ساپورت حداقل ۶۰ نمونهٔ حضور در لاین‌های کناری نیاز دارد؛ سهم Safe نفر اول حداقل ۵۵٪، نفر دوم حداکثر ۴۵٪ و اختلاف حداقل ۲۰ واحد درصد است. نفر اول ۵ و نفر دوم ۴ می‌شود. در شواهد، `support-team-context` و `support-side-lane` ثبت می‌شوند.
- شرط عمومی است؛ هیچ Match ID، Hero ID، Steam ID یا ترتیب بازیکن برای تعیین نتیجه استفاده نشده. جهت Safe/Off برای Dire معکوس Radiant است. override دستی اولویت دارد؛ دادهٔ ناکافی یا سهم مشابه نتیجهٔ قطعی تولید نمی‌کند.
- نسخهٔ خلاصهٔ تحلیل API به ۲ تغییر کرده تا جدول و نمودار از پوزیشن/امتیاز قبلی استفاده نکنند. مسیر موجود خلاصه‌های قدیمی را با دادهٔ ذخیره‌شده، حداکثر ۸ مچ در هر نوبت و دو مچ هم‌زمان بازسازی می‌کند. جزئیات مستقیم تحلیل را از همان داده محاسبه می‌کند. لازم نیست ریپلی دوباره دانلود/parse شود.
- علامت سؤال پوزیشن واضح‌تر است. برای مچ تحلیل‌نشده راهنمای تحلیل نمایش داده می‌شود؛ برای مچ تحلیل‌شدهٔ نامشخص، علامت قرمز و توضیح درست با دکمهٔ گزارش در جدول داشبورد/مچ‌ها نمایش داده می‌شود. دکمه فقط UI است: هیچ درخواست، متن کاربر یا رکورد backend ایجاد نمی‌کند و برچسب نمایشی دارد.
- پاپ‌آپ از جدول بریده نمی‌شود، هنگام حرکت موس به دکمه باز می‌ماند و با Tab/ArrowDown و Escape قابل استفاده است.
- ساعت تلاش مجدد و جزئیات مچ در fa/en بیست‌وچهارساعته است؛ فارسی اعداد فارسی دارد. متن فارسی نمونه: «تلاش مجدد زمان‌بندی شد — تعداد دفعات تلاش: ۳ — ساعت تلاش بعدی: ۲۱:۰۵». ساعت‌های وب قدیمی/ادمین هم صریحاً h23 هستند. منطقهٔ زمانی فعلی حفظ شده: جزئیات Asia/Tehran و ساعت retry محلی دستگاه.

## آزمون‌ها و حدود نتیجه

تست‌های الگوریتم هر دو تیم، ترتیب متفاوت بازیکن، ابهام، نمونهٔ ناکافی، Core نامطمئن و اولویت دستی را بررسی می‌کنند. تست دیتابیس بازسازی projection قدیمی با نسخهٔ ۱ را بررسی می‌کند. تست UI دو زبان، hover/click/keyboard گزارش بدون درخواست شبکه، فاصلهٔ پاپ‌آپ و ساعت‌های ۲۴ ساعته را پوشش می‌دهد.

`npm test`، تست کامل API، typecheck همهٔ workspaceها، API build، release:prepare و desktop build اجرا شده‌اند. ساخت installer ویندوز در این محیط اجرا نشده. Next build معمول در محیط محدود اینجا به `ENOENT uv_resident_set_memory` رسید؛ خطا در یک فراخوانی مستقل `process.memoryUsage()` هم تکرار شد. بیلد کامل Next پس از سازگارسازی موقت فقط آمار حافظهٔ محیط (با V8/rusage) موفق شد؛ آن فایل بیرون مخزن است و وارد ZIP/Git نمی‌شود. روی سیستم خودت و VPS دستور معمول `npm run build` را اجرا کن، زیرا این تسک سورس وب را هم تغییر می‌دهد.

## سیستم شخصی: main، branch، جایگزینی و تست

در ریشهٔ پروژه، اگر تغییر ثبت‌نشده داری ابتدا آن را نگه دار؛ switch/pull را با تغییر ناسازگار ادامه نده.

```powershell
git status -sb
git fetch origin
git switch main
git pull --ff-only origin main
git log -1 --oneline
git switch -c fix/support-position-time-ui
```

فایل‌های ZIP را از ریشهٔ پروژه copy/replace کن. فایل حذف‌شدنی نداریم. package/lock، ENV، schema، migration و parser.jar تغییر نکرده‌اند. اگر node_modules این سیستم آماده نیست، `npm ci` بزن؛ سپس:

```powershell
npm test
npm run test -w @dota-notes/api
npm run typecheck
npm run api:build
npm run release:prepare -w @dota-notes/api
npm run build
npm run desktop:installer
```

installer در `apps/desktop/src-tauri/target/release/bundle/nsis/` است. زیپ خروجی آمادهٔ تغییرکردهٔ API را هم دارد؛ در استقرار با Git، dist از سورس دوباره ساخته می‌شود و در Git ثبت نمی‌شود.

```powershell
git add .
git commit -m "fix: infer roaming support positions and clarify analysis status"
git push -u origin fix/support-position-time-ui
git switch main
git pull --ff-only origin main
git merge --no-ff fix/support-position-time-ui -m "Merge branch 'fix/support-position-time-ui'"
git push origin main
```

## استقرار VPS پس از push به main

checkout همین `/var/www/dota2notes` است. API runtime در `apps/api/release`، Next در `apps/web` و ENV در `.env.production` ریشه هستند. فولدر source جدید لازم نیست. ابتدا main و وضعیت تمیز را بررسی کن:

```bash
cd /var/www/dota2notes
sudo -u dota2notes -H git status -sb
sudo -u dota2notes -H git log -1 --oneline
```

سرویس‌ها برای بازهٔ کوتاه build متوقف می‌شوند. اگر هر دستور خطا داد، ادامه نده و همان خروجی را بررسی کن. نسخهٔ پشتیبان cutover قبلی محفوظ است؛ این تسک داده یا schema را حذف نمی‌کند.

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

**هر دو preflight باید ok: true باشند.** migration جدید، تغییر ENV، جایگزینی JAR یا نصب مجدد unit نداریم. Next build این بار لازم است.

```bash
sudo systemctl start dota2notes-api.service dota2notes.service
curl --retry 5 --retry-connrefused --retry-delay 1 -fS http://127.0.0.1:4100/health/ready
curl -fS https://api.dota2notes.ir/health/live
sudo systemctl start dota2notes-replay.timer dota2notes-sync-manual.timer dota2notes-opendota-parse.timer dota2notes-images.timer dota2notes-performance-reference.timer dota2notes-monitor.timer
sudo systemctl status dota2notes-api.service dota2notes.service --no-pager -l
sudo systemctl list-timers --all --no-pager 'dota2notes-*'
```

readiness عمومی در nginx فعلی عمداً 404 است؛ readiness را محلی تست کن.

## بررسی مچ واقعی پس از استقرار

نسخهٔ نصبی تازه را اجرا کن و جزئیات مچ `9032098145` را باز کن؛ نقش Disruptor/Mirana و شواهد پوزیشن را بررسی کن. جدول/نمودار نیز بعد از تازه‌شدن خلاصه‌ها باید همین نتیجه را نشان دهند. اگر سایر Coreها معتبر باشند و دادهٔ side lane اختلاف کافی داشته باشد، ساپورت‌ها تشخیص داده می‌شوند. بدون دادهٔ واقعی این مچ، نتیجهٔ نهایی تضمین نمی‌شود.

روی یک مچ تحلیل‌شده با پوزیشن هنوز نامعلوم hover کن: توضیح تحلیل‌کردن دوباره نباید ظاهر شود؛ دکمهٔ گزارش نمایشی بدون فرم متن کار می‌کند. روی مچ تحلیل‌نشده هنوز راهنمای تحلیل صحیح است. retry و تاریخ جزئیات را در هر دو زبان بررسی کن.

```bash
sudo journalctl -u dota2notes-api.service --since "10 minutes ago" --no-pager -o cat | tail -80
sudo -u postgres psql -d dota_notes -P pager=off -c \
"SELECT dm.match_id, jm.analysis_summary->>'version' AS summary_version,
        jm.analysis_summary->>'position' AS position,
        dm.local_replay_data IS NOT NULL AS has_local_replay
 FROM journal_matches jm JOIN dota_matches dm ON dm.match_id=jm.dota_match_id
 WHERE dm.match_id=9032098145;"
```

فقط نسخه/پوزیشن و وجود تحلیل چاپ می‌شود، نه توکن یا اطلاعات حساس. STRATZ 502 و پذیرش واقعی ریپلی ID صفر مربوط به تسک قبلی‌اند و موفقیت جدیدشان بدون لاگ VPS فرض نمی‌شود.
