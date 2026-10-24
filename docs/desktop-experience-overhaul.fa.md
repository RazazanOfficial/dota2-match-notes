# ارتقای تجربهٔ دسکتاپ

مبنا: GitHub `main` در `8ec86828ca338f1186ea75533eee12c67151cd94`؛ شاخهٔ تسک `feat/desktop-experience-overhaul`. ZIP فقط فایل‌های جدید/تغییرکرده را با مسیر واقعی پروژه دارد. حذف دستی نداریم. هیچ commit، push، merge یا استقرار از محیط دستیار انجام نشده است.

## نتیجهٔ طراحی

- داشبورد و مچ‌ها: هدر مشترک جمع‌وجور؛ کنترل هفتگی/ماهانه و انتخاب مستقیم ماه/هفته در popover؛ دکمهٔ دریافت با بازتاب کوتاه هنگام hover. ابزارها تمام عرض را اشغال نمی‌کنند. فیلترهای Mode و Position با آیکن و انتخاب‌های مشخص در هر دو صفحه هستند. مرز ثبت‌نام، تقویم شمسی/میلادی و ذخیرهٔ دوره حفظ شده‌اند.
- Replay: کتابخانهٔ تازه با جدول مشخصات، جست‌وجوی شناسه، فیلتر، بارگذاری ده‌تایی و بلوک‌های۳۰تایی، تب فایل‌های محلی، آموزش‌های قبلی و تنظیم پوشهٔ جمع‌شونده. فایل‌های محلی هنگام ورود به صفحه خوانده نمی‌شوند؛ فقط هنگام بازکردن تب محلی و پس از فرصت نمایش shell. متادیتای فایل‌های قابل مشاهده با حداکثر دو درخواست هم‌زمان خوانده می‌شود. دانلود و پیشرفت در TaskManager مستقل از صفحه باقی می‌مانند. تغییر پوشه تا پایان انتقال قفل است؛ مچ‌های دیگر را می‌توان به صف دانلود افزود.
- Full Analysis: انتخاب بازیکن، نمره/KDA و ناوبری عملکرد، لین، مقایسهٔ آماری، روند زمانی، نقشه و بازیکنان. داده‌های فنی/مرجع/شواهد در بخش‌های بازشونده‌اند. مقادیر، مالکیت آیتم، منابع، timeline، vision، farm و جزئیات Lane حفظ شده‌اند. ساختار Quick Summary و فرمول IMP/Lane تغییر نکرده‌اند. Parse خارجی OpenDota دوباره به مسیر تحلیل وارد نشده است.
- فعالیت‌ها: یک جزئیات باز در هر زمان، Escape/کلیک بیرون/ضربدر برای بستن، اعلان هفت‌ثانیه‌ای با توقف هنگام hover/focus/پنهان‌شدن پنجره؛ صداهای بسیار کوتاه WebAudio اختیاری و پیش‌فرض خاموش. بستن پنل تسک، کار سرور را لغو نمی‌کند.
- تم‌ها: شش پالت Obsidian/Radiant/Nebula/Dire/Glacier/Abyss در روشن و تاریک، انتخاب‌های نمایشی و تنظیم مستقل حرکت/اسکرول/صدا. رنگ متن، متن کم‌رنگ و نوشتهٔ دکمه‌ها روی سطوح اصلی با نسبت کنتراست حداقل۴٫۵ بررسی شده‌اند.

## انتخاب ابزار و بهینه‌سازی

Tailwind موجود حفظ شد. افزودن کتابخانه به‌خودی‌خود FPS را بهتر نمی‌کند؛ محدودکردن کار در هر فریم مهم‌تر است.

- GSAP فقط برای جابه‌جایی/opacity کوتاه؛ dynamic import پس از نمایش محتوا، `gsap.context().revert()` برای cleanup. اگر بارگذاری بیش از۱۸۰ms طول بکشد، انیمیشن ورودی حذف می‌شود تا محتوای دیده‌شده ناگهان محو نشود.
- AnimatedContent اقتباس محدود از React Bits است؛ هیچ بستهٔ افکت، Canvas، ScrollTrigger، ذره یا blur متحرک دائمی اضافه نشده. notice و متن کامل مجوز در `docs/third-party/react-bits-LICENSE.md` نگه‌داری شده است.
- Lenis فقط با انتخاب کاربر بارگذاری می‌شود. اسکرول سیستم پیش‌فرض است؛ RAF هنگام بیکارشدن متوقف می‌شود، پنجرهٔ مخفی متوقف می‌شود و دیالوگ/اسکرول داخلی مستقل باقی می‌ماند.
- حالت reduced و ترجیح سیستم رعایت می‌شوند؛ انیمیشن CSS در پنجرهٔ مخفی متوقف است. جلوهٔ عمق پنل‌ها بیشتر با رنگ و گرادیان ثابت ساخته می‌شود.
- progress دانلود حداکثر حدود۸بار/ثانیه منتشر می‌شود؛ تغییر heartbeat تنها باعث رندر تازه نمی‌شود. bytes/speed در localStorage نوشته نمی‌شوند؛ فقط شناسه/وضعیت موردنیاز بازیابی ذخیره می‌شوند.
- پاسخ تکراری تاریخچه دوباره ذخیره نمی‌شود و polling جدول در پنجرهٔ مخفی به تعویق می‌افتد. فایل‌های محلی و کش متادیتا deferred هستند.
- افکت موس در حالت none هیچ pointer style update ندارد؛ حالت فعال حرکت‌ها را در یک RAF ادغام می‌کند. این کامپوننت مشترک وب/دسکتاپ است و **برای VPS build وب هم لازم است**.

منابع تصمیم‌گیری: [GSAP React/cleanup](https://gsap.com/resources/React/)، [Lenis و autoRaf](https://github.com/darkroomengineering/lenis)، [React Bits](https://reactbits.dev/get-started/installation)، [React Profiler](https://react.dev/reference/react/Profiler)، [Chrome Performance](https://developer.chrome.com/docs/devtools/performance).

## محدودیت تلاش خودکار

مشکل۱۱۱تلاش از deadline بیست‌روزه و نبود سقف نوبت ناشی می‌شد؛ پاسخ rate limit نیز با آماده‌نبودن metadata مخلوط می‌شد.

| مسیر | حد جدید | رفتار |
| --- | --- | --- |
| Metadata | ۱۲ نوبت، حداکثر۲۴ساعت از درخواست | فاصلهٔ۱۰،۱۵،۳۰،۶۰،۱۲۰ و سپس۲۴۰دقیقه؛ رعایت Retry-After |
| شبکه | ۶ نوبت، حداکثر۲۴ساعت | اولین قطعی کوتاه retry سریع‌تر؛ سپس backoff |
| آرشیو مستقل | ۸ نوبت | توقف آرشیو بدون حذف تحلیل یا فایل spool |
| Cooldown مشترک provider |۱۰تا۲۴۰دقیقه | بررسی job دیگر سهمیه را مصرف نمی‌کند و نوبت شبکه به آن تحمیل نمی‌شود |

سقف نوبت، تعداد چرخه‌های worker است؛ هر چرخه ممکن است مسیر مستقیم و relay را بررسی کند. درخواست دستی جدید پس از شکست می‌تواند چرخهٔ تازه بسازد. jobهای قدیمی بیش‌ازحد در recovery متوقف می‌شوند؛ خروجی parsed و spool پاک نمی‌شود. بازهٔ retry شبکه، checkpoint آمادهٔ تحلیل را از ورود به Java محروم نمی‌کند. schema، migration، ENV، JAR و unit جدید نداریم.

## تست و سنجش

- نصب پاک با `npm ci --ignore-scripts --include=dev` و هماهنگی lock بررسی شد.
- ۱۶۱ تست دسکتاپ/تم و۴۵۲ تست API موفق؛ شامل SQL واقعی در PGlite برای cooldown، توقف۱۱۱تلاش و حفظ تحلیل هنگام توقف retry آرشیو؛ جدول/تقویم/صف/آموزش/بستن پنل/موس/اسکرول هم بررسی شده‌اند.
- TypeScript همهٔ workspaceهای موجود، production build دسکتاپ، API build و release:prepare موفق.
- `npm test` ریشه در این snapshot به دلیل نبود تست‌های `apps/web/tests` در main متوقف می‌شود؛ به‌جای ادعای موفقیت آن، `npm run test:desktop` و تست API جدا ارائه شده‌اند.
- Next build در این محیط محدود با خطای محیطی `ENOENT: uv_resident_set_memory` متوقف شد؛ TypeScript وب پاس است اما production build وب باید روی سیستم/VPS اجرا شود.
- Chromium headless این محیط راه‌اندازی نشد؛ تست تصویری مرورگر، FPS/GPU/CPU ویندوز و رفتار واقعی IPC/Rust تأییدشده نیستند. `src-tauri` نیز در snapshot دریافت‌شدهٔ main موجود نبود؛ این تحویل آن را حذف/بازنویسی نمی‌کند. نصاب با فولدر native موجود در سیستم کاربر ساخته می‌شود.

مقایسهٔ production build با checkout تمیز همان main، شامل **تمام importهای ایستا**، نه فقط فایل index:

| مورد | main | این نسخه |
| --- | ---: | ---: |
| JS اولیه |449,979 B|450,143 B|
| همان JS با gzip یکسان |139,820 B|141,858 B|
| CSS |164.10 kB|191.28 kB|

GSAP حدود69.6kB، Replay حدود20.6kB و Lenis حدود19.5kB chunk جدا هستند. کاهش اندازهٔ یک index به‌تنهایی معیار بهبود نیست. اندازهٔ bundle، معیار FPS نیست. هیچ تصویر/ویدئوی حجیم جدید اضافه نشده است.

در تنظیمات «تست۵ثانیه‌ای» اضافه شده: FPS تقریبی مبتنی بر RAF، P95 فاصلهٔ فریم، Long Task و JS heap پشتیبانی‌شده را هنگام تعامل اندازه می‌گیرد؛ مصرف CPU/GPU را اندازه نمی‌گیرد. برای مقایسهٔ واقعی، همان داده و اندازهٔ پنجره را در دو نسخه با WebView2 و Task Manager بررسی کنید؛ سپس حالت متعادل/reduced و Lenis روشن/خاموش را مقایسه کنید.

## سیستم شخصی: Git، جایگزینی و تست

ابتدا اگر تغییرات ثبت‌نشده دارید حفظ/commit کنید؛ reset/clean نزنید.

```bash
git status -sb
git fetch origin
git switch main
git pull --ff-only origin main
git log -1 --oneline
git switch -c feat/desktop-experience-overhaul
```

حالا فایل‌های ZIP را از ریشه copy/replace کنید. سپس:

```bash
npm ci
npm run test:desktop
npm test -w @dota-notes/api -- --maxWorkers=2
npm run typecheck
npm run api:build
npm run release:prepare -w @dota-notes/api
npm run build -w @dota-notes/web
npm run desktop:build
npm run desktop:installer
```

خروجی نصاب در `apps/desktop/src-tauri/target/release/bundle/nsis/` است. وابستگی GSAP/Lenis فقط در package/lock ریشه و دسکتاپ تغییر کرده؛ package/lock مستقل runtime API تغییری ندارد.

```bash
git status --short
git add .
git commit -m "feat: rebuild desktop workspaces and bound replay retries"
git -c http.version=HTTP/1.1 push -u origin feat/desktop-experience-overhaul
git switch main
git pull --ff-only origin main
git merge --no-ff feat/desktop-experience-overhaul -m "Merge branch 'feat/desktop-experience-overhaul'"
git -c http.version=HTTP/1.1 push origin main
git status -sb
```

Tag لازم نیست.

## VPS موجود، پس از push main

مسیر همان `/var/www/dota2notes` است. همهٔ مراحل زیر در VPS هستند؛ اگر فرمانی خطا داد همان‌جا توقف کنید. فقط سرویس‌های پروژه را متوقف می‌کنیم. ابتدا timerهای فعال را ببینید؛ در پایان فقط مواردی که قبلاً فعال بودند بازگردند. replay timer و OpenDota parse timer باید خاموش بمانند. مسیر MSS نصب‌شده را restart/حذف نمی‌کنیم. TeamSpeak دست‌نخورده است.

```bash
cd /var/www/dota2notes
sudo -u dota2notes -H git status -sb
sudo -u dota2notes -H git fetch origin
sudo systemctl list-timers --all --no-pager 'dota2notes-*'
sudo systemctl disable --now dota2notes-replay.timer dota2notes-opendota-parse.timer
sudo systemctl stop dota2notes-sync-manual.timer dota2notes-images.timer dota2notes-performance-reference.timer dota2notes-monitor.timer
sudo systemctl stop dota2notes-replay.service dota2notes-sync.service dota2notes-opendota-parse.service dota2notes-images.service dota2notes-performance-reference.service dota2notes-monitor.service
sudo systemctl stop dota2notes-api.service dota2notes.service
sudo -u dota2notes -H git switch main
sudo -u dota2notes -H git pull --ff-only origin main
sudo -u dota2notes -H git log -1 --oneline
sudo -u dota2notes -H npm ci
sudo -u dota2notes -H npm run api:build
sudo -u dota2notes -H npm run release:prepare -w @dota-notes/api
sudo -u dota2notes -H npm ci --prefix apps/api/release --workspaces=false
sudo -u dota2notes -H npm run build -w @dota-notes/web
sudo -u dota2notes -H env DOTENV_CONFIG_PATH=/var/www/dota2notes/.env.production npm run preflight --prefix apps/api/release --workspaces=false -- --check-db
sudo -u dota2notes -H env DOTENV_CONFIG_PATH=/var/www/dota2notes/.env.production npm run preflight --prefix apps/api/release --workspaces=false -- --role=replay
sudo systemctl start dota2notes-api.service dota2notes.service
curl --retry 5 --retry-connrefused --retry-delay 1 -fS http://127.0.0.1:4100/health/ready
curl -fS https://api.dota2notes.ir/health/live
sudo systemctl start dota2notes-replay.service
```

از چهار timer زیر فقط موارد قبلاً فعال را start کنید؛ طبق استقرار قبلی هر چهار فعال بودند:

```bash
sudo systemctl start dota2notes-sync-manual.timer dota2notes-images.timer dota2notes-performance-reference.timer dota2notes-monitor.timer
sudo systemctl status dota2notes-api.service dota2notes-replay.service --no-pager -l
sudo journalctl -u dota2notes-replay.service --since "5 minutes ago" --no-pager -o cat | tail -80
sudo -u postgres psql -d dota_notes -P pager=off -c "SELECT match_id,status,phase,attempts,error_code,run_after AT TIME ZONE 'Asia/Tehran' AS next_check FROM local_replay_jobs WHERE match_id=9057037093;"
```

Migration و نصب unit/JAR لازم نیست. برنامهٔ جدید را روی سیستم شخصی نصب کنید، نه VPS. فعال‌شدن API روی localhost به‌تنهایی تأیید دانلود واقعی نیست؛ یک مچ تازه و یک فایل آرشیوشده را بررسی کنید. کار قدیمی۱۱۱تلاش باید failed با پیام قابل‌فهم باشد؛ تلاش جدید فقط با اقدام کاربر.

## وضعیت تأییدشدهٔ VPS از کاربر،۲۳اکتبر

- TLS آرشیو با MSS1200 موفق؛۱۴آرشیو multipart+HEAD فعال و completed شدند. مسیر ماندگار `dota2notes-storage-route.service` فقط برای `212.95.61.155/32` با gateway87.107.165.1،eth0،mtu1240 وadvmss1200 نصب/فعال شد. تغییر IP مقصد نیازمند بازبینی این تنظیم است؛ endpoint فعلی `c677095.parspack.net`.
- کش۱۴ریپلی پس از کنترل فایل/HEAD/SHA و پاک‌شدن اشارهٔ spool حذف شد؛ دو فایل legacy هم به درخواست کاربر حذف شدند؛ incoming خالی، worker فعال.
- npm cache،APT download cache و journal قدیمی پاک شدند؛ journal cap300MiB در `/etc/systemd/journald.conf.d/90-dota2notes-retention.conf`؛ مصرف دیسک45%،11GiB آزاد،API ready و چهار سرویس فعال گزارش شدند.
- TeamSpeak،DB،بکاپ‌ها،node_modules،JAR و وب حذف نشدند. auto-cleanup آرشیو همچنان فعال نیست. این تسک هیچ پاک‌سازی فایل یا حذف داده ندارد.
