# دریافت replay با proxy خصوصی

> این سند جزئیات راه‌اندازی اولیهٔ proxy را نیز نگه داشته است. توضیح
> `waiting_file` و مسیر فایل دستی مربوط به نسخهٔ قدیمی است. جریان جاری در
> [Replay درخواستی](replay-on-demand-archive.md) توضیح داده شده است.

این مسیر از کد سادهٔ ReDota الهام گرفته است، ولی Worker مستقل و اختصاصی Dota2Notes
است. OpenDota فقط آدرس فایل را می‌دهد و فایل همچنان روی Valve قرار دارد.

```text
صف Match روی VPS ایران → Worker خصوصی Cloudflare → فایل Valve
                     ← stream همان فایل ←
            importer و parser روی VPS ایران
```

Worker فقط `GET /v1/replay/CLUSTER/MATCH_ID/SALT` و `GET /healthz` را می‌پذیرد؛
هر دو به secret نیاز دارند. خودش آدرس `replayCLUSTER.valve.net` را می‌سازد؛
URL انتخابیِ درخواست‌کننده، redirect و میزبان دلخواه نمی‌پذیرد. برای تست
از `Range: bytes=0-31` پشتیبانی می‌کند. در دانلود اصلی فایل را در RAM
نگه نمی‌دارد: stream را مستقیم به VPS می‌دهد؛ VPS هم اندازه را به ۲۰۰ MiB
محدود می‌کند و پیش از parse نوع فایل و خود Match ID را بررسی می‌کند.

## چرا تست زنده لازم است

برای Match `9013078038` دریافت مستقیم از VPS ایران `403` بود؛ همان URL
با VPN پاسخ `206` داد. این تفاوت، قابلیت دریافت Worker از Valve و اتصال
VPS ایران به دامنهٔ Worker را اثبات نمی‌کند. پیش از فعال‌کردن صف، باید
تست ۳۲ بایتی و سپس دریافت/parse کامل یک replay تازه از VPS موفق شود.
Worker بدون token تعریف‌شده پاسخ `503` می‌دهد؛ هیچ چیز خودکار راه نمی‌افتد.

## مراحل تست کنترل‌شده (برای زمان استقرار)

1. در Cloudflare یک حساب/Workers subdomain متعلق به خودتان داشته باشید؛
   کد `deploy/cloudflare/replay-proxy/worker.mjs` و تنظیمات کنار آن
   آمادهٔ deploy هستند. این فایل‌ها در پچ صرفاً آماده شده‌اند؛ هیچ Worker
   یا حسابی در زمان تحویل پچ ساخته یا منتشر نمی‌شود.
2. از پوشهٔ `deploy/cloudflare/replay-proxy` با Wrangler به حساب خود وارد
   شوید و یک secret تصادفی ۳۲ بایتی به صورت ۶۴ کاراکتر hex بسازید. secret
   را در محیط امن ذخیره کنید، نه در git، پیام‌رسان یا فایل نمونه. در Worker
   نام secret باید `REPLAY_PROXY_TOKEN` باشد؛ با Wrangler می‌توان آن را
   با `npx wrangler secret put REPLAY_PROXY_TOKEN` ثبت کرد. بعد Worker را
   با `npx wrangler deploy` منتشر کنید. برای استقرار دستورهای دقیق را با
   آدرس Worker و وضعیت حساب خودتان تطبیق می‌دهیم.
3. روی VPS `.env.production` مقدار همان secret را در
   `LOCAL_REPLAY_PROXY_TOKEN` و مبدأ HTTPS واقعی Worker را در
   `LOCAL_REPLAY_PROXY_URL` قرار دهید. مقدار فعلی
   `LOCAL_REPLAY_WORKER_ENABLED=false` بماند.
4. بدون تغییر DB یا دانلود فایل کامل، این probe را روی VPS اجرا کنید:

   ```bash
   sudo -u dota2notes -H node --env-file=/var/www/dota2notes/.env.production \
     /var/www/dota2notes/scripts/replay-parser/probe-proxy.mjs \
     189 9013078038 724775528
   ```

   خروجی `ok:true` به معنای دریافت header معتبر replay است. اگر این Match
   تا آن زمان منقضی شده بود، CLUSTER/MATCH_ID/SALT یک Match تازه را بگذارید.
   سپس با فایل کامل یک Match تازه، مسیر `proxy → VPS → parser → DB` را با
   اجرای دستی service صف بررسی کنید. فقط بعد از موفقیت کامل timer را
   فعال کنید (راهنمای [صف replay](replay-queue-stage2.md)).

## پایداری و ظرفیت

- هر job در DB ثبت می‌شود، تکراری برای همان Match ساخته نمی‌شود و در قطع
  proxy از بین نمی‌رود. Health check پیش از برداشتن job خطای DNS/secret و
  اختلال عمومی proxy را آشکار می‌کند. `502`، `503`، `429` و قطعی شبکه با
  backoff تا یک ساعت retry می‌شوند؛ `404` تا پیش از ۱۴ روزگی Match retry
  می‌شود. `403` از Valve در وضعیت `waiting_file` ثبت می‌شود تا مسیر دستی
  همچنان کار کند. خطاهای importer بعد از تلاش‌های محدود متوقف می‌شوند.
- Service روی VPS در هر اجرا یک replay و timer در هر دقیقه یک اجرا دارد:
  **سقف نظری فعلی ۶۰ Match در ساعت**، در عمل کمتر و وابسته به سرعت دانلود
  و parser. این معماری صف را برای افزایش حجم کار حفظ می‌کند، اما throughput
  و تعرفهٔ ترافیک VPS باید با بار واقعی اندازه‌گیری شود. افزایش هم‌زمانی
  پیش از سنجش RAM، CPU و پهنای باند VPS چهار گیگابایتی مجاز نیست.
- پیش از اتکا به این مسیر برای کاربران، دست‌کم چند ده replay تازه با
  duration و اندازهٔ متفاوت را در طول چند روز پردازش کنید. وضعیت‌های
  `pending`، `waiting_file`، `failed`، زمان تکمیل و تعداد صف را در DB و
  `journalctl -u dota2notes-replay.service` ببینید. نمونهٔ پرس‌وجو:

  ```sql
  SELECT status, count(*), min(created_at) AS oldest,
         max(updated_at) AS latest
  FROM local_replay_jobs GROUP BY status ORDER BY status;
  ```

  اگر تعداد `pending` در چند ساعت پیاپی بالا رفت، سقف پردازش این VPS
  پاسخگوی نرخ Matchها نیست؛ پیش از افزایش دفعات timer، مصرف RAM، CPU،
  فضای خالی و ترافیک ماهانه را اندازه‌گیری کنید.
- فایل خودکار بعد از parse پاک می‌شود و فایل ناقص در نام نهایی ظاهر
  نمی‌شود. فایل‌های موقت باقی‌مانده از crash پس از یک ساعت پاک می‌شوند؛
  فایل‌های دستی در `incoming` دست‌نخورده می‌مانند. برای آرشیو طولانی‌مدت،
  فضای ParsPack یک مرحلهٔ مستقل خواهد بود.
- فعلاً موفقیت شبکهٔ Worker/Valve، دسترسی VPS ایران به `workers.dev` و
  هزینه/محدودیت ترافیک استفادهٔ واقعی تأیید نشده‌اند. اگر یکی از این
  شرط‌ها فراهم نباشد، همان قرارداد صف و دانلود stream را می‌توان به relay
  روی VPS آلمان منتقل کرد؛ token و آدرس endpoint آن باید حفظ شوند.

Cloudflare در مستندات فعلی برای حجم **پاسخ** Worker سقف ثابت اعلام نمی‌کند،
ولی حافظهٔ isolate را به ۱۲۸ MiB محدود کرده است. برای همین buffering کل
فایل در Worker ممنوع است و فقط stream استفاده می‌کنیم. محدودیت
**حجم درخواست ورودی** با پاسخ فایل فرق دارد.
