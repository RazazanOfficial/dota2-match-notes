# خلاصهٔ سریع مچ — ۱۲ اکتبر ۲۰۲۶

پایهٔ Git: main `39eed0f`؛ branch تسک `feat/match-quick-summary`.
ZIP فقط فایل‌های جدید/تغییرکردهٔ همین تسک دارد؛ هیچ فایل نیازمند حذف نیست.

## تغییر و قرارداد داده

- نام هر دو تیم در هدر باقی می‌ماند؛ Victory فقط روی برنده با هالهٔ ثابت سبز/قرمز است. نتیجهٔ نامعلوم برندهٔ ساختگی نمی‌گیرد. رنگ متن در تم روشن تیره‌تر است.
- نام/وضعیت Won/Lost زیر Matchup با آیکن تیم‌ها کنار مرز دو roster جایگزین شده؛ متن انتخاب هیرو حذف و selected با border/background/glow ثابت مشخص است.
- هشت کارت آماری با عدد اصلی، اختلاف signed داخل پرانتز، میانگین و آیکن هیرو روی محور مقایسه دارند. مثبت سبز، منفی قرمز و صفر خنثی است. LH/DN هرکدام اختلاف خودشان را دارند. بدون مرجع، (?) و — نمایش داده می‌شوند و آیکن وسط می‌ماند.
- Net Worth تکراری زیر آیتم‌ها حذف شده؛ Neutral تصویر مستطیل را با object-fit:cover در دایرهٔ موجود پر می‌کند. تنها یک inventory برای هیروی انتخاب‌شده decode/render می‌شود و هیچ تصویر جدید یا asset خارجی اضافه نشده است.
- API صفحهٔ جزئیات همان overlay معتبر Replay و همان analysis/resolver مورد استفادهٔ Full Analysis را می‌خواند. پوزیشنِ null تحلیل با حدس قدیمی از دادهٔ پایه جایگزین نمی‌شود. دادهٔ پایه همچنان OpenDota است؛ inference تحلیل از شواهد replay overlay موجود استفاده می‌کند، نه درخواست تازهٔ پوزیشن از STRATZ.
- دسکتاپ در خود تب Summary بررسی زنده انجام می‌دهد؛ درخواست page ابتدایی، analysis ناقص هر ۳ ثانیه هنگام پردازش یا ۳۰ ثانیه در حالت idle؛ پس از تکمیل polling متوقف است. focus، visible، reconnect و matches-updated بازخوانی پشت‌صحنه انجام می‌دهند. درخواست‌ها هم‌زمان نمی‌شوند؛ unmount لغو می‌کند؛ انتخاب هیرو حفظ می‌شود و کش صفحه با تحلیل تازه به‌روز می‌شود. آف‌لاین درخواست دوره‌ای ندارد.
- میانگین از نسخهٔ active ماه قبلِ تاریخ Match یا fallback یک ماه عقب‌تر، همان Hero/Position و Divine/Immortal خوانده می‌شود. مقایسه فقط Ranked All Pick با lobby=7 است؛ نمونهٔ Hero/Position باید همان شرط موجود (۱۰۰۰ یا ۵۰۰ با سهم حداقل ۲۰٪) را بگذراند.
- زمان مرجع `floor(durationSeconds/60)+1` است؛ STRATZ time13 دقیقه12 را نشان می‌دهد. برای Match دقیقه30، time31 مصرف می‌شود و دقیقهٔ منبع در UI نوشته می‌شود. زمان غایب یا بیرون از پوشش0..75 به آخرین ردیف یا پوزیشن دیگری تبدیل نمی‌شود.
- Net Worth، LH، DN، Hero/Tower Damage و Heal مستقیم از meanهای موجود؛ XPM از mean XP تقسیم بر دقیقه است. Net Worth به GPM و mean XP به mean Level تبدیل نمی‌شوند: **GPM و Level میانگین مستقیم در مرجع فعلی ندارند** و placeholder/توضیح دو زبانه می‌گیرند. افت نمونه‌ها در پایان Match ممکن است مرجع هیرو/پوزیشن را ناموجود کند. صفر معتبر با نبود داده متفاوت است.
- در هر comparison، Hero ID و Position هم ثبت می‌شود؛ بعد از اصلاح محلی Position، UI میانگین نقش قبلی را نمایش نمی‌دهد. این تسک ذخیرهٔ override یا UX تب Full Analysis را بازطراحی نمی‌کند.

endpoint Performance مانند قرارداد قبلی فیلتر Mode ندارد؛ Ranked بودن cohort آن فرض موجود پروژه است، نه ویژگی تازه‌ای که این تسک تأیید کرده باشد.

فرمول IMP و Lane، schema/migration، dependencies/lock، ENV، parser/JAR، systemd یا Cloudflare تغییر ندارند. آگوست و سپتامبر قبلاً روی VPS active شده‌اند؛ حذف یا دریافت دوباره لازم نیست. فقط خواندن میانگین‌ها از DB انجام می‌شود و دانلود آماری STRATZ تازه در صفحه نداریم.

## سیستم شخصی و Git

پیش از replace، از روت؛ تغییر محلی نامرتبط را بدون بررسی بازنویسی نکنید:

```bash
git status -sb
git fetch origin
git switch main
git pull --ff-only origin main
git log -1 --oneline
git switch -c feat/match-quick-summary
```

فایل‌های ZIP را از روت copy/replace کنید. dependencies تغییر نکرده‌اند؛ npm ci تازه لازم نیست.

```bash
npm run test -w @dota-notes/api -- --maxWorkers=2
npx vitest run apps/desktop/tests --maxWorkers=2
npm run api:build
npm run release:prepare -w @dota-notes/api
npm run desktop:build
git diff --check
npm run desktop:installer
```

```bash
git add .
git commit -m "feat: refresh match quick summary with replay analysis and cohort comparisons"
git push -u origin feat/match-quick-summary
git switch main
git pull --ff-only origin main
git merge --no-ff feat/match-quick-summary -m "Merge branch 'feat/match-quick-summary'"
git push origin main
```

## VPS بعد از push main

همان checkout `/var/www/dota2notes`؛ ENV `.env.production` ریشه؛ runtime فعال `apps/api/release`. اگر status تغییر tracked نامرتبط یا فرمانی خطا داشت، قبل از ادامه بررسی کنید؛ reset/clean نکنید. فقط Typeهای اختیاری مشترک در وب اضافه شده‌اند؛ UI/runtime وب، پکیج و assets آن تغییر ندارند و build Next لازم نیست.

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

sudo systemctl start dota2notes-api.service
curl --retry 5 --retry-connrefused --retry-delay 1 -fS http://127.0.0.1:4100/health/ready
curl -fS https://api.dota2notes.ir/health/live

sudo systemctl start dota2notes-replay.timer dota2notes-sync-manual.timer dota2notes-opendota-parse.timer dota2notes-images.timer dota2notes-performance-reference.timer dota2notes-monitor.timer
```

تست دادهٔ مچ تصویر کاربر؛ اگر این Match در دفتر کاربر نیست، فقط Match ID همین URL را با مچ تحلیل‌شدهٔ خود کاربر عوض کنید. فرمان هیچ credential یا payload خام چاپ نمی‌کند:

```bash
curl -fS 'http://127.0.0.1:4100/api/journal/matches/9040387522/page?player=steam_988195076' |
node -e 'let text="";process.stdin.on("data",chunk=>text+=chunk);process.stdin.on("end",()=>{const match=JSON.parse(text).page.match;console.log(JSON.stringify({matchId:match.dotaMatchId,analysisReady:!!match.analysis,source:match.analysis?.replaySource,players:match.analysis?.players.map(p=>({slot:p.playerSlot,hero:p.heroName,position:p.position,imp:p.performanceScore??null,comparison:p.isProfilePlayer?p.summaryComparison:null}))},null,2))})'

sudo journalctl -u dota2notes-api.service --since '10 minutes ago' --no-pager -o cat | tail -60
```

بعد نصب دسکتاپ: مچ تحلیل‌شده را مستقیم در Quick Summary باز کنید؛ پوزیشن/IMP و آمار منتخب باید با Full Analysis یکسان باشد. یک مچ تازه را تحلیل کنید و در Summary بمانید تا بدون بازوبسته‌کردن/تعویض تب نتیجه برسد. یک هیروی دیگر انتخاب کنید و هنگام refresh باید همان انتخاب باقی بماند. تم روشن/تاریک، فارسی/انگلیسی، برد هر دو تیم و Neutral Item را بررسی کنید. آفلاین روی صفحهٔ دارای کش، دادهٔ قبلی باید باقی بماند.

## بررسی انجام‌شده

۴۲۴ تست API در۶۵ فایل و۱۱۱ تست دسکتاپ در۱۳ فایل موفق‌اند. PGlite/Express یک مچ بدون replay را به replay معتبر تبدیل کرد و API page تحلیل و پوزیشن/Score آماده داد؛ میانگین همان hero/position/time، نبود GPM/Level، minute غایب و Turbo هم بررسی شدند. تست‌های Summary تکمیل بدون تغییر tab، نگه‌داشتن selection، کش آفلاین، reconnect/focus، serialize و unmount را کنترل کردند. API/desktop TypeScript/build، release:prepare و diff-check موفق‌اند.

نصاب/link Windows و بررسی تصویری در WebView واقعی در محیط ساخت انجام نشده‌اند؛ مرورگر تصویری تست در این محیط نصب نشد. آزمون‌های DOM و Build جای تست ظاهر واقعی کاربر را نمی‌گیرند. فایل dist، assets تغییرنکرده، node_modules یا secret داخل ZIP نیست؛ هیچ commit/push/استقرار توسط سازندهٔ ZIP انجام نشده است.
