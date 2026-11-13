# عیب یابی هدفمند

ابتدا لایه را مشخص کن: نشست SSH، سرویس، DB/link، provider، archive یا کلاینت.
از یک timeout یا پاسخ health، علت قطعی برای همه لایه ها نتیجه نگیر.

## MobaXterm بی خروجی یا قطع شده

یک بار `Ctrl+Q` می تواند توقف اتفاقی نمایش را آزاد کند. اگر پنجره پاسخ نداد، اتصال SSH جدید باز کن و قبل از تکرار اسکریپت وضعیت را بخوان:

```bash
sudo -u dota2notes -H git --no-pager -C /var/www/dota2notes log -1 --format='%H%n%s'
ps -eo pid,ppid,stat,etime,comm --forest
sudo systemctl show dota2notes-api.service dota2notes-replay.service \
  dota2notes-sync-daemon.service -p Id -p ActiveState -p SubState --no-pager
```

`T` در STAT یعنی process متوقف شده؛ `S` به تنهایی هنگ یا شکست نیست و می تواند انتظار عادی باشد.
`PPID=1` می تواند نشان دهد والد قبلی پایان یافته است؛ اجرای npm یا ادامه اسکریپت را از روی وجود یک Git تنها فرض نکن.
فقط بعد از شناسایی process مربوط به همان اجرای استقرار، آن را ادامه بده یا خاتمه بده؛ PIDهای قدیمی این گفتگو دستور قابل استفاده مجدد نیستند.
ریبوت، `killall node` یا شروع دوباره npm ci همزمان، قدم اول نیست.
استقرار عادی همچنان نشست معمول SSH با دستورهای [راهنمای استقرار](deployment-ubuntu.md) است؛ `nohup` روش الزامی آینده نیست.

## خطای dubious ownership

Git را با کاربر مالک checkout اجرا کن:

```bash
sudo -u dota2notes -H git --no-pager -C /var/www/dota2notes status -sb
```

برای این نصب، اضافه کردن `safe.directory` به root یا تغییر مالکیت کل checkout لازم نیست.

## build یا preflight ناموفق

| نشانه | بررسی |
| --- | --- |
| `npm ci` ناموفق | نسخه Node/npm و lockfile همان commit؛ تست بعدی اجرا نشود |
| فایل resource Companion نیست | روی Windows ابتدا `node apps/desktop/scripts/prepare-native.mjs` |
| اختلاف اندازه یا SHA رسانه | `.gitattributes` و بایت SVG/line ending؛ manifest مستقل ناسازگار نساز |
| schema یا permission | migration با مالک در ایران و grant جدول های جدید برای compute |
| compute connection | link آلمان و listenerهای loopback؛ DB اینترنتی باز نشود |
| JAR یا incoming نامعتبر | مسیر و دسترسی worker آلمان؛ spool در ایران جستجو نشود |

`/health/live` فقط زنده بودن API را نشان می دهد. readiness محلی schema/DB را هم کنترل می کند؛ provider و archive را ثابت نمی کند.

## Companion مچ را تشخیص نداده

PowerShell ویندوز:

```powershell
Get-ScheduledTask -TaskName "DotaNotes-Companion-*" -ErrorAction SilentlyContinue | Select-Object TaskName,State
Get-Process -Name dota-notes-companion -ErrorAction SilentlyContinue
Test-NetConnection -ComputerName 127.0.0.1 -Port 16272
```

وجود launch option، restart بازی، مسیر فایل GSI و حساب Steam درست را بررسی کن.
پورت باز صرفا listener را نشان می دهد؛ مشاهده post-game معتبر جداست.
روی ایران، بدون چاپ secret:

```bash
sudo -u postgres psql -X -d dota_notes -P pager=off -c \
  "SELECT match_id,status,attempts,ended_at,run_after,deadline_at,error_code FROM match_observations ORDER BY ended_at DESC LIMIT 10;"
```

نبود row: مسیر رویداد/ارسال بررسی شود. pending با موعد آینده طبیعی است. processing قدیمی یا failed: daemon آلمان و کد خطا بررسی شود.
رویداد ممکن است اصلا دریافت نشده باشد؛ Fetch دستی و reconciliation دوره ای fallback هستند.
`device.json`، credential، فایل GSI و URL موقت را برای عیب یابی عمومی نفرست.

## دانلود یا تحلیل معطل است

روی ایران:

```bash
sudo -u postgres psql -X -d dota_notes -P pager=off -c \
  "SELECT match_id,status,phase,archive_status,download_requested_at,heartbeat_at,run_after,error_code FROM local_replay_jobs ORDER BY updated_at DESC LIMIT 10;"
```

روی آلمان:

```bash
sudo journalctl -u dota2notes-replay.service -u dota2notes-sync-daemon.service \
  --since '15 minutes ago' -n 100 --no-pager
```

archive ready با completed تحلیل متفاوت است. اگر archive حاضر است ولی native شروع نمی شود، صف انتقال دستگاه، session، ticket و خطای native بررسی شوند.
کندی انتقال مستقیم پارس پک را خودکار به VPS آلمان نسبت نده؛ Host واقعی درخواست و زمان readiness را جدا ثبت کن.
`NoSuchKey` یعنی object در همان URL موجود نیست؛ به تنهایی علت یا مقصر بودن OpenDota را اثبات نمی کند.

### صف ثابت و replay service با خروج موفق خاموش است

روی آلمان، وضعیت خروج را پیش از شروع دوباره ثبت کن:

```bash
sudo systemctl show dota2notes-replay.service \
  -p ActiveState -p SubState -p Result -p ExecMainStatus \
  -p ExecMainExitTimestamp -p NRestarts --no-pager
```

`inactive/dead` با `Result=success` و `ExecMainStatus=0` سلامت پردازش را ثابت نمی کند؛ با `Restart=on-failure` خروج موفق خودکار برنمی گردد.
در نسخه های پیش از اصلاح lifecycle، خطای اتصال DB یا heartbeat می توانست abort مشترک را فعال کند، retry تسک ذخیره شود و فرایند با خروج موفق خاموش بماند.
نسخه اصلاح شده خطای اصلی را نگه می دارد و با `replay_pipeline_failed` و خروج ناموفق پایان می یابد تا systemd دوباره اجرا کند؛ توقف عمدی با SIGTERM/SIGINT همچنان مسیر لغو عادی دارد.
برای تشخیص، زمان خروج را با آخرین `heartbeat_at`/`updated_at` تسک و journal همان بازه تطبیق بده؛ خروج موفق به تنهایی علت آغاز توقف را مشخص نمی کند.

`transportCode=55P03` در لاگ یعنی PostgreSQL قفل لازم را نگرفته است؛ برچسب مرحله مانند `replay_archive_check_failed` به تنهایی خطای storage را ثابت نمی کند.
شناسه خطا بدون URL، credential یا متن کامل query ثبت می شود. نبود blocker در بررسی فعلی نیز مالک قفل تاریخی را مشخص نمی کند.

برای اصلاح worker، سورس canonical در `apps/api/scripts/replay-parser/run-pipeline.mjs` تغییر می کند و runtime سرویس با `npm run api:build` و `npm run release:prepare -w @dota-notes/api` طبق [استقرار](deployment-ubuntu.md) تولید می شود؛ فایل generated را دستی patch نکن.
شروع مجدد سرویس روی production باید با مجوز همان عملیات انجام شود. پس از شروع، worker درخواست های آماده سازی pending با بودجه منقضی را failed می کند؛ checkpoint منتظر parse در مرحله `awaiting_parse` حفظ می شود. این رفتار با گیر کردن صف متفاوت است.
برای آن مچ ها از مسیر معمول برنامه درخواست تازه ثبت کن؛ deadline، attempts یا وضعیت تمام صف را با SQL گسترده بازنشانی نکن.
پذیرش بازیابی، علاوه بر `active/running`، تغییر واقعی وضعیت یک درخواست معتبر و ثبت نتیجه parse در DB است؛ سلامت provider و archive جدا بررسی می شوند.

### لینک مرتب برمی گردد ولی remote forwarding روی 14100 شکست می خورد

خطای `remote port forwarding failed for listen port 14100` در journal لینک آلمان یعنی درخواست reverse forwarding پذیرفته نشده است؛ اشغال پورت و محدودیت forwarding باید از هم جدا شوند. با `ExitOnForwardFailure=yes`، شکست این listener کل اتصال SSH را می بندد؛ در نتیجه listener دیتابیس `127.0.0.1:15432` آلمان هم از دست می رود و worker می تواند `ECONNREFUSED` بدهد. این خطا به تنهایی ایراد UI، parser یا provider را ثابت نمی کند.

ابتدا فقط وضعیت و مالک listener را بخوان؛ روی آلمان:

```bash
sudo journalctl -u dota2notes-link.service -n 12 --no-pager
sudo ss -lntp 'sport = :15432'
```

روی ایران:

```bash
sudo ss -lntp 'sport = :14100'
```

اگر ایران listener دارد، PID همان فرایند، مالک، زمان آغاز و socket اتصال SSH آن را بررسی کن؛ سپس وجود همان اتصال با پورت مبدأ مشاهده شده را روی آلمان تطبیق بده. `ESTAB` سمت ایران به تنهایی زنده بودن دو سر اتصال را ثابت نمی کند. نبود listener روی آلمان نیز به تنهایی مجوز بستن یک نشست روی ایران نیست. اگر listener ایران وجود ندارد، تنظیم مؤثر `sshd -T -C` برای `dota-link` و محدودیت های کلید اختصاصی بررسی شوند؛ کلید، env یا خروجی کامل credential را چاپ نکن.

فقط پس از اثبات اینکه نشست قدیمی با اتصال فعال آلمان متناظر نیست و گرفتن مجوز صریح همان عملیات، همان child متعلق به `dota-link` را می توان با `SIGTERM` بست. مالک، نام فرایند و مالکیت `14100` باید درست پیش از اقدام دوباره کنترل شوند؛ سیگنال از طریق `pidfd` از هدف قرار گرفتن PID بازیافت شده جلوگیری می کند. نبود قابلیت `pidfd` یا شکست کنترل ها باید عملیات را پیش از سیگنال متوقف کند. این کار کانال های DB همان نشست را قطع می کند؛ به master `sshd`، نشست مدیر، PostgreSQL یا PID تاریخی سیگنال نده. `pkill`/`killall` و restart کل SSH راه بازیابی این حالت نیستند.

بعد از آزاد شدن پورت، ابتدا به `Restart=always` لینک آلمان فرصت بازیابی بده. برگشت هر دو listener و سلامت worker را بررسی کن؛ شروع مجدد worker فقط اگر خودکار برنگشت و با مجوز همان سرویس انجام شود. پایان واقعی یک درخواست معتبر در DB معیار پذیرش است، نه فقط `active` شدن unit.

### جلوگیری از باقی ماندن نشست بی پاسخ روی ایران

client آلمان از قبل `ServerAliveInterval=15` و `ServerAliveCountMax=3` دارد. این کنترل از سمت client انجام می شود؛ با قطع مسیر، بسته شدن client نمی تواند به تنهایی تضمین کند که نشست قدیمی سمت ایران فوراً پاک شود. در قالب [SSH محدود](../deploy/ssh/dota-compute-link.conf)، دو گزینه زیر فقط داخل همان `Match User dota-link` در انتهای فایل اصلی ایران قرار دارند:

```text
    ClientAliveInterval 15
    ClientAliveCountMax 3
```

این کنترل از سمت server، client بی پاسخ را پس از حدود ۴۵ ثانیه قطع می کند؛ مقدار تقریبی است و قطع مسیر طولانی تر از این مهلت می تواند به بازاتصال نیاز داشته باشد. این تنظیم ها داخل `Match` مجازند و به نشست های جدید تعلق می گیرند؛ reload نشست از قبل باز را اصلاح نمی کند. مرجع معنا و محدوده، [راهنمای رسمی OpenSSH](https://man.openbsd.org/sshd_config#ClientAliveCountMax) است. تنظیم forwarding، احراز هویت و listenerهای loopback عوض نمی شود.

برای اعمال، همان [روال SSH محدود](two-vps-bootstrap.fa.md#ssh-محدود) را با مجوز مشخص ایران دنبال کن: یک نشست مدیر باز بماند، از فایل فعال backup با نام یکتا بگیر و فقط این دو خط را در `Match` موجود ویرایش کن. بلوک را دوباره append نکن و در Include اولیه نگذار. صرف pull قالب repo تنظیم فعال را تغییر نمی دهد. قبل از هر reload، روی خود ایران `sudo /usr/sbin/sshd -t` باید موفق باشد؛ Windows جای این اعتبارسنجی را نمی گیرد. سپس خروجی محدود زیر برای client واقعی باید مقادیر مورد انتظار را نشان دهد:

```bash
sudo /usr/sbin/sshd -T -C user=dota-link,addr=143.20.60.45,host=143.20.60.45 \
  | grep -E '^(clientaliveinterval|clientalivecountmax|allowtcpforwarding|permitopen|permitlisten|gatewayports) '
```

مقصد این نصب همان حساب و آدرس آلمان است؛ برای میزبان دیگر ورودی `-C` را از مشخصات اتصال واقعی بگیر. مقدار مؤثر باید `clientaliveinterval 15` و `clientalivecountmax 3` و همان محدودیت های قبلی forwarding باشد. در صورت شکست syntax یا اختلاف مقادیر، ادامه نده. بعد از تأیید، unit فعال SSH ایران را `reload` کن، نه `restart`؛ نام معمول Ubuntu برابر `ssh.service` است و باید با میزبان تطبیق داده شود. یک اتصال تازه مدیر را پیش از بستن نشست قبلی امتحان کن.

برای فعال شدن کنترل روی تونل، بازاتصال کنترل شده لینک آلمان به مجوز همان عملیات نیاز دارد. بعد از آن listenerهای ایران `14100` و آلمان `15432`، journal لینک و worker و پیشرفت واقعی یک درخواست بررسی شوند. این تغییر به npm، بیلد API/دسکتاپ، migration یا restart دیتابیس نیاز ندارد.

برای بازگشت، اختلاف فایل فعال و همان backup را بازبینی کن؛ فقط ویرایش این نوبت را برگردان و تغییر همزمان دیگران را حفظ کن. دوباره `sshd -t`، تنظیم مؤثر و سپس reload انجام شوند. برای این بازگشت هم نشست مدیر باز بماند؛ اگر مشکل فقط سلامت لینک بود، credential، host key یا قاعده امنیتی را برای عبور از خطا تغییر نده.

## هشدارهای شناخته شده ساخت

- Rust `dead_code`: ماژول مشترک در دو executable بخش های استفاده نشده دارد؛ به تنهایی به معنی خراب بودن Companion نیست.
- Node `DEP0190`: در prepare فعلی، `npm run build` با shell در Windows اجرا می شود؛ الگوی invocation باید در تغییر جدا اصلاح شود، نه اینکه هشدار پنهان شود.
- Vite native loader: import بدون پسوند و JSON بدون attribute برای سازگاری آینده نیاز به اصلاح دارند؛ بیلد فعلی با loader موجود موفق بوده است.
- `PLUGIN_TIMINGS`: زمان افزونه ها در ساخت است، نه مصرف CPU نرم افزار نصب شده.

این هشدارها جای نتیجه واقعی دستور را نمی گیرند. گزارش بازبینی کد و محدودیت ها در [بازبینی مستندات](documentation-review-2026-11.fa.md) ثبت شده است.
