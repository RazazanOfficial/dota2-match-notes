# تحویل پروژه به چت یا توسعه‌دهندهٔ بعدی

**آخرین بازبینی این سند: ۸ اکتبر ۲۰۲۶.** نقطهٔ شروع: [فهرست docs](README.md)، سپس `README.md` ریشه و فایل‌های کد مربوط به تسک. این سند جای بررسی `git status`، نسخهٔ مستقرشده و وضعیت VPS را نمی‌گیرد.

## متن شروع برای چت تازه

متن زیر را همراه لینک مخزن و در صورت وجود فایل ZIP/لاگ جدید بفرستید:

> پروژهٔ Dota2 Notes را ادامه بده. ابتدا `README.md`، `docs/README.md` و
> `docs/HANDOFF.md` را از آخرین `main` بخوان؛ سپس مستندات و کد مرتبط با تسک
> را بررسی کن. وضعیت branch و تغییرات محلی را پیش از ویرایش ببین. حضور پچ
> Position/Lane دقیقهٔ ۱۲ در Git و استقرار آن روی VPS را فرض نگیر. قواعد Git،
> تحویل ZIP، SQL و VPS در handoff را رعایت کن. کار فعلی من: [تسک/Match ID/لاگ].

اگر فایل‌ها در چت تازه در دسترس نبودند، لینک مخزن GitHub را بدهید. وضعیت
تولید را تنها با لاگ یا خروجی VPS همان زمان می‌توان تأیید کرد.

## وضعیت هنگام تحویل

- مخزن GitHub `RazazanOfficial/dota2-match-notes`، شاخهٔ انتشار `main`. آخرین نسخهٔ تأییدشدهٔ VPS در ۷ اکتبر `0fb8d45 Merge branch 'fix/desktop-match-calendar'` و Git تمیز بود. برای تسک تازه main را fetch کنید؛ این سند فرض نمی‌کند نسخهٔ تازه‌تر مستقر شده است.
- Express در `apps/api` شامل احراز هویت Steam/رمز، ثبت‌نام مرحله‌ای، بازیابی/ایمیل، APIهای مچ، تحلیل، صف‌ها و منطق دادهٔ مهاجرت‌شده است. دسکتاپ Tauri به API واقعی متصل است؛ موبایل هنوز scaffold است. گزارش هوشمند/ژورنال و هدیهٔ سه‌روزه فعلاً UI دارند، هدیه اشتراک واقعی فعال نمی‌کند.
- روش ایمیل production از SMTP تأییدشده استفاده می‌کند؛ تست ارسال واقعی موفق بوده است. secrets فقط در ENV سرور هستند.
- وب قدیمی Next هنوز روی همین VPS فعال است. حذف آن یا جایگزینی با سایت معرفی مستقل کار بعدی است؛ merge یا pull خودبه‌خود وب را حذف نمی‌کند.
- استقرار Git در خود `/var/www/dota2notes` انجام شده است؛ فولدر `dota2notes-source` نداریم و لازم نیست ساخته شود. API: `apps/api/release/dist/main.js`، وب: `apps/web/.next`، ENV: `.env.production` ریشه. آرشیو و parser خارج از checkout در `/var/lib/dota2notes` هستند.
- نسخهٔ پشتیبان cutover: `/var/backups/dota2notes-20261007-135840` شامل پروژه، unitها و dump دیتابیس؛ تغییرات دستی قدیمی در stash حفظ شده‌اند. آن‌ها را خودکار apply/delete نکنید. migration تا `0029` و preflight API/replay موفق گزارش شده‌اند.
- شش timer فعال: replay، sync-manual، opendota-parse، images، performance-reference و monitor. workerهای HTTP به Express متصل‌اند و replay به `apps/api/release/scripts/replay-parser/run-queue.mjs` اشاره دارد. `inactive (dead)` برای oneshot موفق طبیعی است.
- پچ قبلی `fix/replay-validation-progress` در main `8801541` ادغام شده است: در ریپلی مچ `9028060850` تنها CDemoFileInfo دارای ID صفر و ۱۰ بازیکن بود. wrapper قبلی پیش از parse آن را رد می‌کرد. پچ هویت صفر را فقط با تطبیق کامل roster و حداقل دو Steam account معلوم می‌پذیرد، تشخیص شناسهٔ مثبت نامرتبط حفظ شده است. پیشرفت جدول از DB بازیابی و خطاها با متن fa/en نمایش داده می‌شوند. نتیجهٔ parse روی خود فایل VPS هنوز بعد از استقرار باید تأیید شود؛ [راهنمای این تسک](replay-validation-progress.fa.md).
- تسک قبلی `fix/support-position-time-ui` در main `3285c5f` ادغام شده است: fallback عمومی پوزیشن ۴/۵ بعد از شناسایی مطمئن Coreها، بر اساس نسبت Safe/Off در lane_pos ده دقیقهٔ اول بدون اثر Mid؛ نسخهٔ summary API به ۲ برای بازسازی محدود projectionهای قدیمی تغییر کرده. علامت سؤال واضح‌تر، پوزیشن نامشخصِ تحلیل‌شده قرمز با گزارش صرفاً نمایشی و ساعت‌ها ۲۴ ساعته‌اند. resolver وب هم هماهنگ شده و در استقرار این تسک **build Next لازم است**. schema/ENV/JAR تغییر نکرده‌اند؛ [دستورات و حدود تست](support-position-time-ui.fa.md). نتیجهٔ واقعی مچ `9032098145` و نسخهٔ جدید مستقر VPS هنوز باید تأیید شوند.
- تسک جاری `fix/offline-match-workspace` از main `3285c5f`: کش حساب آفلاین بدون دورزدن onboarding/401، بارگذاری پس‌زمینه، جدول ۱۱ستونی هم‌ترتیب fa/en با شش آیتم و باف واقعی، فیلتر ترکیبی حلقه‌ها، recent ده‌تایی تا ۳۰، کل هفته/ماه و پیشرفت جمع‌شونده. Track فقط با منبع صریح parser محاسبه می‌شود، نه طلای حدسی؛ ریپلی قدیمی خودکار reparse نمی‌شود. schema/ENV/dependency/JAR تغییر ندارند؛ API build و release:prepare و Next build لازم‌اند. [راهنمای کامل و حدود تست](offline-match-workspace.fa.md). تست VPS/installer ویندوز هنوز باید توسط کاربر انجام شود.
- نمونهٔ CPU عمدتاً idle بود؛ tick خالی replay حدود ۱٫۸ ثانیه CPU مصرف می‌کرد. پچ، SDK آرشیو را lazy می‌کند و DB schema modules را در یک entry جدا فقط برای preflight `--check-db` بارگذاری می‌کند. در سه اندازه‌گیری محلی هزینهٔ import صف از حدود ۸۷–۱۴۱ به ۳۱–۳۹ ms CPU و preflight از حدود ۴۲۱–۴۶۹ به ۶٫۷–۶٫۸ ms CPU رسید؛ این اعداد صرفاً startup محلی‌اند و کاهش واقعی VPS باید اندازه‌گیری شود. STRATZ 502 مستقل است و هنوز رفع قطعی آن تأیید نشده.
- ورود کاربر آزمایشی `steam_988195076` قبلاً با درخواست صریح خودش reset شده بود؛ script حذف حساب را در تسک عادی دوباره اجرا نکنید. SUPER_ADMIN_STEAM_IDS حفظ شده است.

## ترجیح‌های همکاری و Git

- تغییر کد را روی آخرین `origin/main` و یک branch جدا بسازید. تغییرات محلی دیگری را بازنویسی یا حذف نکنید.
- tag فقط برای انتشار قطعی و در صورت درخواست کاربر است؛ روی merge commit در main ساخته می‌شود. برای پچ معمولی خودکار tag نسازید؛ [قرارداد انتشار](releasing.md).
- تحویل تغییرات برای کاربر **ZIP شامل فایل‌های تغییرکرده با مسیر نسبی مخزن** است؛ patch یا `git am` نفرستید. کاربر فایل‌ها را روی Windows جایگزین می‌کند، تست می‌گیرد و Git را خودش انجام می‌دهد.
- پس از `git add`، `git commit` و `git push -u origin BRANCH`، روی `main` از `git merge --no-ff BRANCH -m "Merge branch 'BRANCH'"` و سپس `git push origin main` استفاده کنید. `git pull --ff-only origin main` برای تازه‌کردن branch مجاز است؛ `merge --ff-only` با خواستهٔ کاربر سازگار نیست.
- دستورهای VPS را ساده و مستقل بنویسید؛ wrapperهایی مانند `( set -euo pipefail ... )` نفرستید. نمونهٔ SQL را در قالب `sudo -u postgres psql -d dota_notes -P pager=off -c \` و رشتهٔ SQL خط بعد بدهید. فرمان تخریبی فقط برای مورد مشخص و با شناخت رابطهٔ آرشیو/DB نوشته شود.
- بدون دادهٔ واقعی ادعای رفع قطعی باگ شبکه، تشخیص Position یا دسترسی به VPS نکنید. secrets را در گفتگو، log، Git یا ZIP قرار ندهید.

### قرارداد تغییر کد

- منطق API و DB دسکتاپ در `apps/api/src/lib/` و routeهای `apps/api/src/routes/` است؛ نسخهٔ وب قدیمی در `apps/web` حفظ شده؛ Workerهای طولانی در فرایندهای جدا از درخواست مرورگر اجرا می‌شوند. اعتبارسنجی ورودی، احراز هویت و مجوز مالک Match را در مسیرهای کاربر حفظ کنید؛ route داخلی به secret سرور وابسته است.
- Jobهای پس‌زمینه باید پس از قطع و اجرای دوباره قابل ادامه باشند؛ `status`، `run_after`، deadline و eventهای خطا را به‌صورت سازگار با schema و UI تغییر دهید. ثبت یک Match یا آرشیو موفق نباید با retry تبدیل به دادهٔ تکراری شود.
- تغییر schema با migration نسخه‌دار همراه است. دادهٔ مرجع خارجی، raw summary، replay محلی و override کاربر را بدون بررسی قرارداد منشأ داده روی هم ننویسید.
- تست سناریوهای معنادار را در app مربوط اضافه کنید؛ سپس `npm test`، `npm run test -w @dota-notes/api` و `npm run typecheck` و build همان app را اجرا کنید. تست ساختگی موفق به معنای موفقیت مسیر شبکه یا دو مچ واقعی روی VPS نیست.

## معماری و مسیرهای کد (Express فعال و وب قدیمی)

| بخش | منبع و مسئولیت |
| --- | --- |
| وب | Next.js در `apps/web/app/`، کامپوننت‌ها در `apps/web/components/`، API در `apps/web/app/api/`. `apps/web/app/api/health/route.ts` برای بررسی سلامت. |
| حساب و مجوز | ورود Steam OpenID و مسیرهای رمز عبور در `apps/api/src/lib/auth/` و `apps/api/src/routes/auth/`؛ دسترسی Super Admin در `apps/api/src/lib/admin/`. |
| دیتابیس | PostgreSQL با Drizzle؛ schema در `apps/api/src/lib/db/schema.ts`، migrationها در `apps/api/drizzle/`. |
| ژورنال | `apps/api/src/lib/journal/repository.ts` و `apps/api/src/lib/journal/match-summary.ts`؛ وضعیت نمایشی ژورنال از خلاصهٔ Match و Position استخراج می‌شود. |
| همگام‌سازی دستی | `apps/api/src/routes/sync/me/route.ts`، `apps/api/src/lib/sync/manual-service.ts`، `apps/api/src/lib/opendota/service.ts`؛ اسکن صفحه‌ای History و دریافت کامل Match در Worker مستقل. |
| تحلیل و Position | `apps/api/src/lib/dota/match-analysis.ts`، `match-details.ts`، `position-resolver.ts`، `match-analysis-repository.ts`؛ override دستی در `journal_matches.position_overrides` اولویت دارد. |
| Replay | `apps/api/src/lib/replay/` و `apps/api/release/scripts/replay-parser/`؛ صف Node در systemd، دانلود از Worker خصوصی Cloudflare، parser جاوا، آرشیو S3 سازگار ParsPack. |
| تصاویر | `apps/api/src/lib/match-image-job/`، `apps/api/src/lib/match-image/`، timer تصاویر؛ ذخیرهٔ تصاویر در ParsPack. |
| مرجع آماری | `apps/api/src/lib/monthly-reference/`؛ Meta و میانگین STRATZ، نسخه‌های ماهانه در PostgreSQL؛ Match کاربر مرجع آماری جمعیت نمی‌سازد. |
| تنظیمات انتشار | `deploy/env.production.example`، `deploy/systemd/`، `deploy/cloudflare/replay-proxy/` و [راهنمای VPS](deployment-ubuntu.md). |

### دادهٔ Match و Replay

1. دریافت ساده یا جست‌وجو: اطلاعات پایه از OpenDota در `dota_matches.raw_data` ذخیره و در `journal_matches` به کاربر وصل می‌شود. صف دستی روز/هفته صفحه‌های History را تا پوشش بازه می‌خواند؛ Turbo و Modeهای دیگر با تطبیق Match کامل بررسی می‌شوند. کار زمان‌بر در Worker ادامه می‌یابد، نه در همان پاسخ مرورگر. دریافت ساده خودکار Replay را دانلود نمی‌کند.
2. درخواست دانلود یا تحلیل: یک `local_replay_jobs` برای Match با `intent` مناسب ثبت می‌شود. `dota2notes-replay.timer` هر ۱۵ ثانیه یک نوبت را بررسی می‌کند؛ اجرای service از نوع `oneshot` است و ممکن است پس از موفقیت `inactive (dead)` دیده شود.
3. ابتدا آرشیو فعال بررسی می‌شود. برای metadata ناقص، worker فیلدهای Replay ناقص را پاک می‌کند، GET تازهٔ Match را مستقیم از VPS به OpenDota می‌زند و در صورت نیاز مسیر metadata در Cloudflare Worker را می‌سنجد. تنها با cluster، salt و URL معتبر مرتبط با همان Match اطلاعات Replay یکجا ذخیره می‌شود. `429` یا هنوز آماده‌نبودن Replay به معنای انتظار و retry است؛ فاصلهٔ metadata دست‌کم ۱۰ دقیقه و مهلت job تازه ۲۰ روز است. [جزئیات](replay-metadata-recovery.md).
4. فایل از Valve از طریق relay خصوصی به VPS stream می‌شود. درخواست «دریافت Replay» فقط دانلود و آرشیو است؛ «تحلیل» Replay را هم با parser محلی پردازش می‌کند. آرشیو در ParsPack با کلید `replays/YYYY/MM/DD/MATCH_ID.dem.bz2` نگه داشته می‌شود. دادهٔ parser در `dota_matches.local_replay_data` قرار می‌گیرد؛ `apps/api/src/lib/replay/overlay.ts` فیلدهای قابل‌اعتماد آن را با خلاصهٔ OpenDota ترکیب می‌کند. [جزئیات](replay-on-demand-archive.md).
5. تغییر Position در UI با override ذخیره می‌شود و روی محاسبهٔ Score اثر می‌گذارد. Position استنباطی برای موارد مبهم تضمین قطعی ندارد. Lane Impact و Denies @10 همچنان ده دقیقه‌ای‌اند؛ Lane Efficiency پچ اخیر از Snapshot Replay دقیقهٔ ۱۲ و مرجع ماهانهٔ `time: 13` استفاده می‌کند. Replayهای قبلی با رویداد دقیقهٔ ۱۰ برای امتیاز جدید نیاز به بازپردازش از آرشیو دارند. [قرارداد](lane-efficiency-next-step.md).

### زمان، Mode و سهمیه

- زمان دیتابیس و systemd غالباً UTC است؛ روز ژورنال با `JOURNAL_TIME_ZONE=Asia/Tehran` تعیین می‌شود. هنگام مقایسهٔ timestampها صریحاً منطقهٔ زمانی را بنویسید.
- Cooldown دریافت روزانه ۹۰ ثانیه ، هفتگی ۳ دقیقه و ماهیانه ۱۲۰ دقیقه است. سهمیهٔ سراسری OpenDota جداگانه اعمال می‌شود. حد `OPENDOTA_MAX_NEW_MATCHES_PER_SYNC=20` برای sync زمان‌بندی‌شده است؛ صف دستی بازهٔ انتخابی را در batchهای بعدی ادامه می‌دهد. اسکن History سقف ایمنی ۳۰ صفحهٔ ۱۰۰تایی دارد و اگر پوشش بازه کامل نشود خطا می‌دهد؛ روز ناقص نباید کامل علامت بخورد.
- مرجع مقایسهٔ Lane فقط برای Ranked All Pick با دادهٔ Divine/Immortal است. نسخهٔ `active` ماه قبلِ تاریخ Match انتخاب می‌شود؛ اگر آماده نباشد فقط نسخهٔ فعال یک ماه عقب‌تر fallback است. آخرین هفتهٔ STRATZ باید تمام شده و ۴۸ ساعت گذشته باشد. [زمان‌بندی و محدودیت](monthly-reference-services.md).
- `SCHEDULED_SYNC_ENABLED=off` مسیر Sync زمان‌بندی‌شدهٔ عمومی را غیرفعال می‌کند؛ timer مستقل همگام‌سازی دستی و timerهای Replay/مرجع را با آن یکی نگیرید.

## محیط و استقرار

- VPS ایران: IP `87.107.165.50`، کاربر `dota2notes`، PostgreSQL دیتابیس `dota_notes`. سایت `dota2notes.ir` روی Next محلی 3000، API `api.dota2notes.ir` روی Express محلی 4100، هر دو پشت nginx/HTTPS.
- ENV محرمانه `/var/www/dota2notes/.env.production`. مقدار secret چاپ یا وارد Git/ZIP نشود. مسیر parser `/var/lib/dota2notes/parser/parser.jar`؛ incoming `/var/lib/dota2notes/replays/incoming`.
- checkout موجود `/var/www/dota2notes` را از Git main به‌روز کنید. `npm ci` ریشه، `npm run api:build` و `npm run release:prepare -w @dota-notes/api` سپس `npm ci --prefix apps/api/release --workspaces=false` خروجی مستقل API می‌سازند. build مستقیم API بدون release:prepare، runtime فعال را به‌روز نمی‌کند.
- پیش از بازنویسی فایل‌های runtime، timerها و workerهای فعال و API متوقف شوند؛ برای npm ci ریشه، وب هم موقتاً متوقف شود. اگر سورس یا dependencies وب تغییر نکرده، build Next لازم نیست. unitها را تنها هنگام تغییر خودشان دوباره نصب کنید.
- روال به‌روز در [deployment-ubuntu.md بخش ۱۲](deployment-ubuntu.md#۱۲-روال-هر-انتشار-بعدی) و فرمان‌های دقیق تسک جاری در [replay-validation-progress.fa.md](replay-validation-progress.fa.md) است. برای docs-only توقف یا build لازم نیست. Cloudflare Worker فقط در صورت تغییر کد خودش جدا deploy می‌شود.
- سلامت API: `http://127.0.0.1:4100/health/ready` و `https://api.dota2notes.ir/health/live`. readiness عمومی عمداً 404 می‌دهد.

## بررسی سریع روی VPS

دستورها فقط وضعیت را می‌خوانند؛ بعد از دریافت لاگ، Match ID و زمان محلی را با UTC تطبیق دهید.

```bash
cd /var/www/dota2notes
sudo -u dota2notes -H git log -1 --oneline
sudo systemctl status dota2notes-api.service dota2notes.service dota2notes-replay.timer dota2notes-sync-manual.timer dota2notes-performance-reference.timer --no-pager
sudo systemctl list-timers --all --no-pager 'dota2notes-*'
sudo journalctl -u dota2notes-replay.service -n 40 --no-pager
sudo -u dota2notes -H bash deploy/scripts/health-check.sh
```

برای یک Match مشخص، بدون نمایش secret یا payload بزرگ:

```bash
sudo -u postgres psql -d dota_notes -P pager=off -c \
"SELECT j.match_id, j.status, j.intent, j.phase, j.attempts, j.error_code,
        j.run_after AT TIME ZONE 'Asia/Tehran' AS next_try_tehran,
        j.archive_status, d.raw_data->>'replay_salt' AS replay_salt
 FROM local_replay_jobs j JOIN dota_matches d USING (match_id)
 WHERE j.match_id = 9023606320;"
```

همان Match ID را برای مچ مورد بررسی عوض کنید. `replay_job_events` علت تلاش اخیر را نشان می‌دهد؛ `status=completed` را با `archive_status=active` و در صورت تحلیل با حضور `local_replay_data` تطبیق دهید. پاسخ `200` پروکسی برای metadata به‌تنهایی اثبات‌کنندهٔ آماده‌بودن salt نیست.

## خطاها، محدودیت‌ها و کارهای باز

- آماده‌شدن URL در Valve به‌تنهایی به معنای انتشار metadata در OpenDota نیست. مسیر مستقیم VPS، Worker و سهمیهٔ API ممکن است مستقل خطا بدهند. وعدهٔ دانلود قطعی برای هر مچ ندهید؛ نمونهٔ تازه را از ابتدا تا انتها آزمایش کنید.
- Position با شواهد lane، OpenDota و اطلاعات تیم حدس زده می‌شود. نمونه‌ها: `9025195882` (Doom در Off Lane با Enigma جنگل‌رو) و `9025138259` (Sky به‌عنوان Position باقی‌مانده). نتیجهٔ واقعی بعد از استقرار پچ باید در UI بررسی شود؛ تست ساختگی جای دادهٔ خام همان مچ نیست.
- برای امتیاز دقیقهٔ ۱۲ روی Replayهای قدیمیِ دارای آرشیو فعال، `apps/api/release/scripts/replay-parser/backfill-lane.mjs --match MATCH_ID` Replay آرشیوشده را دوباره parse می‌کند. اگر آرشیو فعال نیست، آن اسکریپت را روی آن مچ اجرا نکنید. دانلود تازه از Valve و آپلود دوبارهٔ آرشیو هدف این فرمان نیست.
- دادهٔ مرجع STRATZ باید از نظر نمونه، ماه و Mode در UI بررسی شود. `null` را به امتیاز صفر یا میانگین ساختگی تبدیل نکنید.
- پس از آزمون مچ تازه، نتایج Sync Turbo/Ranked و پوشش بیش از ۲۰ Match، و خطاهای Position را با Match ID و evidence ثبت کنید؛ سپس تسک بعدی را انتخاب کنید.
