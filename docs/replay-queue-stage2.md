# صف replay محلی — مرحلهٔ دوم

## جریان کار

وقتی Match summary در دیتابیس وجود دارد، worker هر بار حداکثر یک Match را
پردازش می‌کند. Matchهایی که طی ۱۴ روز گذشته شروع شده‌اند، به journal وصل‌اند،
اطلاعات آدرس replay دارند و هنوز `local_replay_data` ندارند، به‌صورت یکتا
وارد `local_replay_jobs` می‌شوند. Matchهایی که تازه درخواست «دریافت ساده»
شده‌اند به محض اجرای tick بعدی بررسی می‌شوند؛ برای ثبت خودکار Match جدید
هنوز همان دکمهٔ sync سایت لازم است.

worker اول فایل `MATCH_ID_REPLAY_SALT.dem.bz2` یا `.dem` را در پوشهٔ
`/var/lib/dota2notes/replays/incoming` جست‌وجو می‌کند. اگر فایلی نباشد
و proxy خصوصی تنظیم شده باشد، فایل را از Worker می‌گیرد؛ Worker آدرس
Valve را فقط از cluster، replay salt و match ID معتبر می‌سازد. بدون
تنظیم proxy، مسیر مستقیم Valve امتحان می‌شود. URL دلخواه، redirect و
تغییر میزبان مجاز نیست؛ دانلود و حجم فایل محدودند.
فایل در مسیر موقت با دسترسی محدود دریافت می‌شود، سپس importer مرحلهٔ اول
compression، Match ID از خود replay و ۱۰ slot را بررسی می‌کند. تحلیل سایت
بعد از ذخیره، local replay را بر OpenDota ترجیح می‌دهد.

| وضعیت | معنی و اقدام |
| --- | --- |
| `pending` | Match منتظر نوبت یا retry با تأخیر است. |
| `processing` | یک worker دارای lease در حال دریافت و import است. |
| `waiting_file` | مسیر دریافت مسدود بوده یا retryهای خطای قطعی تمام شده‌اند؛ worker هر ۵ دقیقه `incoming` را بررسی می‌کند. اگر قبلاً proxy امتحان نشده باشد، یک بار آن را نیز امتحان می‌کند؛ پس از `403` دائماً آن را تکرار نمی‌کند. |
| `completed` | همان Match ID با هر ۱۰ بازیکن در DB ذخیره شده است. |
| `failed` | metadata یا فایل نامعتبر است یا parser پس از retry موفق نشده؛ اپراتور باید علت را ببیند. |

`/var/lib/dota2notes/replays/incoming` پوشه‌ای خصوصی با مالک
`dota2notes` است. فایل‌های دستی پس از import حفظ می‌شوند؛ دانلودهای خودکار
پس از import حذف می‌شوند تا دیسک ۲۰ گیگابایتی VPS پر نشود. دریافت خودکار
از مسیر [proxy خصوصی](replay-proxy-cloudflare.md) در پچ آماده شده است،
ولی باید با VPS و یک فایل واقعی آزمایش شود. آرشیو replay در ParsPack هنوز
ساخته نشده است؛ تا آن زمان می‌توان فایلِ قابل اعتماد را مانند قبل به
`incoming` منتقل کرد. OpenDota همچنان Match summary و benchmark را تأمین
می‌کند. Banها فقط‌خواندنی و وابسته به draft موجود در OpenDota هستند.

## نصب کنترل‌شده در مرحلهٔ استقرار

پس از merge شدن پچ، در VPS پیش از migration طبق راهنمای اصلی از
`dota_notes` در `/var/backups/dota2notes` بکاپ معتبر بگیرید. migration
`0017_local-replay-queue` جدول جدید و دو index برای جست‌وجوی Match می‌سازد
و اطلاعات Matchهای موجود را بازنویسی نمی‌کند. واحدهای service و timer جدید
را به systemd منتقل کنید:

```bash
sudo install -d -o dota2notes -g dota2notes -m 700 /var/lib/dota2notes/replays/incoming
sudo cp deploy/systemd/dota2notes-replay.service /etc/systemd/system/
sudo cp deploy/systemd/dota2notes-replay.timer /etc/systemd/system/
sudo systemctl daemon-reload
```

در `.env.production` مسیر واقعی JAR و پوشه را قرار دهید؛ بعد از نصب
و تست، `LOCAL_REPLAY_WORKER_ENABLED=true` کنید. تا پیش از این تغییر، service
فقط `{ "enabled": false }` چاپ می‌کند و به DB یا اینترنت وصل نمی‌شود:

```dotenv
LOCAL_REPLAY_WORKER_ENABLED=false
REPLAY_PARSER_JAR=/var/lib/dota2notes/parser/parser.jar
LOCAL_REPLAY_INCOMING_DIR=/var/lib/dota2notes/replays/incoming
LOCAL_REPLAY_PROXY_URL=
LOCAL_REPLAY_PROXY_TOKEN=
```

پیش از فعال‌کردن worker، تست آدرس proxy و دریافت ۳۲ بایت از Valve را طبق
[راهنمای proxy](replay-proxy-cloudflare.md) اجرا کنید. برای تست کامل proxy
پس از migration و فعال‌کردن env، از Match جدیدی استفاده کنید که summary
آن در `dota_matches` ثبت است و هنوز local replay ندارد. فایل آن Match را
دستی به `incoming` منتقل نکنید؛ وگرنه proxy آزمایش نمی‌شود. سپس:

```bash
sudo systemctl start dota2notes-replay.service
sudo journalctl -u dota2notes-replay.service -n 35 --no-pager
sudo -u postgres psql -d dota_notes -c \
  "SELECT match_id,status,attempts,source,error_code FROM local_replay_jobs ORDER BY updated_at DESC LIMIT 10;"
```

برای موفقیت تست proxy باید `status=completed` و `source=proxy` برای همان
Match ثبت شود و API تحلیل نیز `replaySource=local` برگرداند. مسیر دستی
همچنان برقرار است: فایل را ابتدا با پسوند `.part` به `incoming` منتقل
کنید، سطح دسترسی آن را `600` کنید و پس از تمام‌شدن کپی در همان پوشه به نام
`MATCH_ID_REPLAY_SALT.dem.bz2` تغییر نام دهید؛ worker نباید فایل نیمه‌کاره
را بخواند.

اگر Match از قبل در DB هست ولی job آن `failed` یا `waiting_file` است، بعد
از رفع مشکل این فرمان آن را دوباره در صف می‌گذارد (Match ذخیره‌شدهٔ موفق را
دوباره parse نمی‌کند):

```bash
sudo -u dota2notes -H node --env-file=/var/www/dota2notes/.env.production \
  /var/www/dota2notes/scripts/replay-parser/run-queue.mjs --enqueue MATCH_ID
```

پس از مشاهدهٔ import موفق، timer را فعال کنید:

```bash
sudo systemctl enable --now dota2notes-replay.timer
systemctl status dota2notes-replay.timer --no-pager
```

روی VPS ایران برای نمونهٔ قبلی Valve پاسخ `403` داده بود؛ بدون proxy
`waiting_file` نتیجهٔ مورد انتظار است. سرویس
عمداً `-Xmx1200m`، محدودیت systemd بر RAM/CPU و اجرای یک job در هر tick دارد.
قبل از اتکا به این صف برای Score، replay چند Match با Hero و duration متفاوت
باید با آمار بازی بررسی شود.
