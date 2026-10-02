# تحویل پروژه به چت یا توسعه‌دهندهٔ بعدی

**آخرین بازبینی این سند: ۲ اکتبر ۲۰۲۶.** نقطهٔ شروع: [فهرست docs](README.md)، سپس `README.md` ریشه و فایل‌های کد مربوط به تسک. این سند جای بررسی `git status`، نسخهٔ مستقرشده و وضعیت VPS را نمی‌گیرد.

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

- مخزن: `https://github.com/RazazanOfficial/dota2-match-notes`؛ شاخهٔ انتشار `main`. مبنای بررسی این handoff کامیت `f333d2f` از `origin/main` است. برای هر کار تازه آخرین `main` را دریافت و وضعیت تغییرات را بررسی کنید.
- پچ پوزیشن/Role و Lane Efficiency دقیقهٔ ۱۲ جداگانه به‌صورت ZIP تحویل داده شده است؛ **merge، push و استقرار آن از این محیط تأیید نشده‌اند**. پیش از فرض‌گرفتن حضورش روی `main` یا VPS، کامیت و فایل‌ها را بررسی کنید. توضیح طراحی آن در [Lane Efficiency](lane-efficiency-next-step.md) آمده است.
- پیش‌تر پچ‌های همگام‌سازی چند Mode و رفع محدودیت ثبت دستی ۲۰ مچ، بازیابی metadata Replay و fallback مرجع ماهانه روی `main` ثبت شدند. موفقیت end-to-end روی VPS برای یک مچ تازه و همهٔ Modeها هنوز باید با دادهٔ واقعی سنجیده شود.
- نقش کاربر: سایت باید بدون ورود دستی salt، cluster یا URL Replay کار کند. کاربر فایل `.dem` را دستی برای بازیابی عادی وارد نمی‌کند. یک Match آزمایشیِ تازه را پس از بازی برای آزمایش کامل در نظر دارد.
- کار بعدی پس از بررسی/استقرار پچ قبلی: آزمایش مچ تازه از دریافت ساده تا Replay، آرشیو و تحلیل؛ سپس اعتبارسنجی دریافت روز/هفته برای Turbo، Ranked و بیش از ۲۰ Match؛ بعد کالیبراسیون Position و Score روی مچ‌های واقعی. نتیجهٔ این آزمایش‌ها باید به همین سند اضافه شود.

## ترجیح‌های همکاری و Git

- تغییر کد را روی آخرین `origin/main` و یک branch جدا بسازید. تغییرات محلی دیگری را بازنویسی یا حذف نکنید.
- تحویل تغییرات برای کاربر **ZIP شامل فایل‌های تغییرکرده با مسیر نسبی مخزن** است؛ patch یا `git am` نفرستید. کاربر فایل‌ها را روی Windows جایگزین می‌کند، تست می‌گیرد و Git را خودش انجام می‌دهد.
- پس از `git add`، `git commit` و `git push -u origin BRANCH`، روی `main` از `git merge --no-ff BRANCH -m "Merge branch 'BRANCH'"` و سپس `git push origin main` استفاده کنید. `git pull --ff-only origin main` برای تازه‌کردن branch مجاز است؛ `merge --ff-only` با خواستهٔ کاربر سازگار نیست.
- دستورهای VPS را ساده و مستقل بنویسید؛ wrapperهایی مانند `( set -euo pipefail ... )` نفرستید. نمونهٔ SQL را در قالب `sudo -u postgres psql -d dota_notes -P pager=off -c \` و رشتهٔ SQL خط بعد بدهید. فرمان تخریبی فقط برای مورد مشخص و با شناخت رابطهٔ آرشیو/DB نوشته شود.
- بدون دادهٔ واقعی ادعای رفع قطعی باگ شبکه، تشخیص Position یا دسترسی به VPS نکنید. secrets را در گفتگو، log، Git یا ZIP قرار ندهید.

### قرارداد تغییر کد

- منطق API و DB در `lib/` و routeهای `app/api/` است؛ Workerهای طولانی در فرایندهای جدا از درخواست مرورگر اجرا می‌شوند. اعتبارسنجی ورودی، احراز هویت و مجوز مالک Match را در مسیرهای کاربر حفظ کنید؛ route داخلی به secret سرور وابسته است.
- Jobهای پس‌زمینه باید پس از قطع و اجرای دوباره قابل ادامه باشند؛ `status`، `run_after`، deadline و eventهای خطا را به‌صورت سازگار با schema و UI تغییر دهید. ثبت یک Match یا آرشیو موفق نباید با retry تبدیل به دادهٔ تکراری شود.
- تغییر schema با migration نسخه‌دار همراه است. دادهٔ مرجع خارجی، raw summary، replay محلی و override کاربر را بدون بررسی قرارداد منشأ داده روی هم ننویسید.
- تست سناریوهای معنادار را کنار فایل‌های `tests/` اضافه کنید؛ سپس `npm test` و `npm run typecheck` و برای تغییرات عملیاتی `npm run build` را اجرا کنید. تست ساختگی موفق به معنای موفقیت مسیر شبکه یا دو مچ واقعی روی VPS نیست.

## معماری و مسیرهای کد

| بخش | منبع و مسئولیت |
| --- | --- |
| وب | Next.js در `app/`، کامپوننت‌ها در `components/`، API در `app/api/`. `app/api/health/route.ts` برای بررسی سلامت. |
| حساب و مجوز | ورود Steam OpenID و مسیرهای رمز عبور در `lib/auth/` و `app/api/auth/`؛ دسترسی Super Admin در `lib/admin/`. |
| دیتابیس | PostgreSQL با Drizzle؛ schema در `lib/db/schema.ts`، migrationها در `drizzle/`. |
| ژورنال | `lib/journal/repository.ts` و `lib/journal/match-summary.ts`؛ وضعیت نمایشی ژورنال از خلاصهٔ Match و Position استخراج می‌شود. |
| همگام‌سازی دستی | `app/api/sync/me/route.ts`، `lib/sync/manual-service.ts`، `lib/opendota/service.ts`؛ اسکن صفحه‌ای History و دریافت کامل Match در Worker مستقل. |
| تحلیل و Position | `lib/dota/match-analysis.ts`، `match-details.ts`، `position-resolver.ts`، `match-analysis-repository.ts`؛ override دستی در `journal_matches.position_overrides` اولویت دارد. |
| Replay | `lib/replay/` و `scripts/replay-parser/`؛ صف Node در systemd، دانلود از Worker خصوصی Cloudflare، parser جاوا، آرشیو S3 سازگار ParsPack. |
| تصاویر | `lib/match-image-job/`، `lib/match-image/`، timer تصاویر؛ ذخیرهٔ تصاویر در ParsPack. |
| مرجع آماری | `lib/monthly-reference/`؛ Meta و میانگین STRATZ، نسخه‌های ماهانه در PostgreSQL؛ Match کاربر مرجع آماری جمعیت نمی‌سازد. |
| تنظیمات انتشار | `deploy/env.production.example`، `deploy/systemd/`، `deploy/cloudflare/replay-proxy/` و [راهنمای VPS](deployment-ubuntu.md). |

### دادهٔ Match و Replay

1. دریافت ساده یا جست‌وجو: اطلاعات پایه از OpenDota در `dota_matches.raw_data` ذخیره و در `journal_matches` به کاربر وصل می‌شود. صف دستی روز/هفته صفحه‌های History را تا پوشش بازه می‌خواند؛ Turbo و Modeهای دیگر با تطبیق Match کامل بررسی می‌شوند. کار زمان‌بر در Worker ادامه می‌یابد، نه در همان پاسخ مرورگر. دریافت ساده خودکار Replay را دانلود نمی‌کند.
2. درخواست دانلود یا تحلیل: یک `local_replay_jobs` برای Match با `intent` مناسب ثبت می‌شود. `dota2notes-replay.timer` هر ۱۵ ثانیه یک نوبت را بررسی می‌کند؛ اجرای service از نوع `oneshot` است و ممکن است پس از موفقیت `inactive (dead)` دیده شود.
3. ابتدا آرشیو فعال بررسی می‌شود. برای metadata ناقص، worker فیلدهای Replay ناقص را پاک می‌کند، GET تازهٔ Match را مستقیم از VPS به OpenDota می‌زند و در صورت نیاز مسیر metadata در Cloudflare Worker را می‌سنجد. تنها با cluster، salt و URL معتبر مرتبط با همان Match اطلاعات Replay یکجا ذخیره می‌شود. `429` یا هنوز آماده‌نبودن Replay به معنای انتظار و retry است؛ فاصلهٔ metadata دست‌کم ۱۰ دقیقه و مهلت job تازه ۲۰ روز است. [جزئیات](replay-metadata-recovery.md).
4. فایل از Valve از طریق relay خصوصی به VPS stream می‌شود. درخواست «دریافت Replay» فقط دانلود و آرشیو است؛ «تحلیل» Replay را هم با parser محلی پردازش می‌کند. آرشیو در ParsPack با کلید `replays/YYYY/MM/DD/MATCH_ID.dem.bz2` نگه داشته می‌شود. دادهٔ parser در `dota_matches.local_replay_data` قرار می‌گیرد؛ `lib/replay/overlay.ts` فیلدهای قابل‌اعتماد آن را با خلاصهٔ OpenDota ترکیب می‌کند. [جزئیات](replay-on-demand-archive.md).
5. تغییر Position در UI با override ذخیره می‌شود و روی محاسبهٔ Score اثر می‌گذارد. Position استنباطی برای موارد مبهم تضمین قطعی ندارد. Lane Impact و Denies @10 همچنان ده دقیقه‌ای‌اند؛ Lane Efficiency پچ اخیر از Snapshot Replay دقیقهٔ ۱۲ و مرجع ماهانهٔ `time: 13` استفاده می‌کند. Replayهای قبلی با رویداد دقیقهٔ ۱۰ برای امتیاز جدید نیاز به بازپردازش از آرشیو دارند. [قرارداد](lane-efficiency-next-step.md).

### زمان، Mode و سهمیه

- زمان دیتابیس و systemd غالباً UTC است؛ روز ژورنال با `JOURNAL_TIME_ZONE=Asia/Tehran` تعیین می‌شود. هنگام مقایسهٔ timestampها صریحاً منطقهٔ زمانی را بنویسید.
- Cooldown دریافت روزانه ۹۰ ثانیه و هفتگی ۵ دقیقه است. سهمیهٔ سراسری OpenDota جداگانه اعمال می‌شود. حد `OPENDOTA_MAX_NEW_MATCHES_PER_SYNC=20` برای sync زمان‌بندی‌شده است؛ صف دستی بازهٔ انتخابی را در batchهای بعدی ادامه می‌دهد. اسکن History سقف ایمنی ۳۰ صفحهٔ ۱۰۰تایی دارد و اگر پوشش بازه کامل نشود خطا می‌دهد؛ روز ناقص نباید کامل علامت بخورد.
- مرجع مقایسهٔ Lane فقط برای Ranked All Pick با دادهٔ Divine/Immortal است. نسخهٔ `active` ماه قبلِ تاریخ Match انتخاب می‌شود؛ اگر آماده نباشد فقط نسخهٔ فعال یک ماه عقب‌تر fallback است. آخرین هفتهٔ STRATZ باید تمام شده و ۴۸ ساعت گذشته باشد. [زمان‌بندی و محدودیت](monthly-reference-services.md).
- `SCHEDULED_SYNC_ENABLED=off` مسیر Sync زمان‌بندی‌شدهٔ عمومی را غیرفعال می‌کند؛ timer مستقل همگام‌سازی دستی و timerهای Replay/مرجع را با آن یکی نگیرید.

## محیط و استقرار

- production: VPS ایران، checkout در `/var/www/dota2notes` با کاربر `dota2notes`، PostgreSQL دیتابیس `dota_notes`، Next.js روی `127.0.0.1:3000` پشت Nginx و دامنه `dota2notes.ir`.
- تنظیمات محرمانه در `/var/www/dota2notes/.env.production`؛ مقدارهای نمونه در `deploy/env.production.example`. Token Worker در secret کلادفلر با نام `REPLAY_PROXY_TOKEN` و همان مقدار در `LOCAL_REPLAY_PROXY_TOKEN` روی VPS است. کلیدها را فقط در همان محیط‌ها بررسی کنید؛ مقدارشان را چاپ نکنید.
- فایل‌های unit در `deploy/systemd/`. سرویس اصلی `dota2notes.service`؛ timerهای فعال بسته به نصب: `dota2notes-replay.timer`، `dota2notes-sync-manual.timer`، `dota2notes-images.timer`، `dota2notes-opendota-parse.timer`، `dota2notes-performance-reference.timer` و در صورت نصب `dota2notes-monitor.timer`. timer قدیمی `dota2notes-stratz.timer` و Sync زمان‌بندی‌شده با مسیر جاری اشتباه نشوند. وضعیت واقعی را روی VPS ببینید.
- روال انتشار بعدی و توقف/build/start در [deployment-ubuntu.md، بخش ۱۲](deployment-ubuntu.md#۱۲-روال-هر-انتشار-بعدی) است: توقف timerهای مربوط و سایت، `sudo -u dota2notes -H git pull --ff-only origin main`، `npm ci`، migrationهای جدید، `npm test`، `npm run typecheck`، `npm run build`، راه‌اندازی و health check. فایل Worker Cloudflare فقط اگر خودش تغییر کرده باشد جداگانه deploy می‌شود. برای تغییر صرفاً docs سرویس‌ها نیاز به restart ندارند.
- تست محلی با `npm ci`، `npm test`، `npm run typecheck` و در تغییرات عملیاتی `npm run build`. تست‌های شبکهٔ Valve/OpenDota/ParsPack و وضعیت فعال‌شدن timer روی VPS باید مستقل بررسی شوند.

## بررسی سریع روی VPS

دستورها فقط وضعیت را می‌خوانند؛ بعد از دریافت لاگ، Match ID و زمان محلی را با UTC تطبیق دهید.

```bash
cd /var/www/dota2notes
sudo -u dota2notes -H git log -1 --oneline
sudo systemctl status dota2notes.service dota2notes-replay.timer dota2notes-sync-manual.timer dota2notes-performance-reference.timer --no-pager
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
- برای امتیاز دقیقهٔ ۱۲ روی Replayهای قدیمیِ دارای آرشیو فعال، `scripts/replay-parser/backfill-lane.mjs --match MATCH_ID` Replay آرشیوشده را دوباره parse می‌کند. اگر آرشیو فعال نیست، آن اسکریپت را روی آن مچ اجرا نکنید. دانلود تازه از Valve و آپلود دوبارهٔ آرشیو هدف این فرمان نیست.
- دادهٔ مرجع STRATZ باید از نظر نمونه، ماه و Mode در UI بررسی شود. `null` را به امتیاز صفر یا میانگین ساختگی تبدیل نکنید.
- پس از آزمون مچ تازه، نتایج Sync Turbo/Ranked و پوشش بیش از ۲۰ Match، و خطاهای Position را با Match ID و evidence ثبت کنید؛ سپس تسک بعدی را انتخاب کنید.
