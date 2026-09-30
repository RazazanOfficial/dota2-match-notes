# بازیابی اطلاعات ناقص Replay

اگر دریافت سادهٔ مچ قبل از آماده‌شدن Replay انجام شود، `dota_matches.raw_data` ممکن است `cluster` داشته باشد ولی `replay_salt` نداشته باشد. رکورد مچ و اتصال ژورنال حذف نمی‌شوند.

پس از **درخواست صریح دانلود یا تحلیل**، صف Replay ابتدا آرشیو ParsPack و دادهٔ Parse موجود را بررسی می‌کند. فقط اگر واقعاً به دریافت از Valve نیاز باشد و اطلاعات دانلود ناقص باشد، endpoint خصوصی `/v1/metadata/{matchId}` در Cloudflare Worker را صدا می‌زند. Worker فقط برای همین Match ID از OpenDota `/api/replays` و در صورت لزوم `/api/matches/{matchId}` را می‌خواند و تنها Match ID، cluster و salt را برمی‌گرداند. صف شناسه‌ها را بررسی می‌کند، همان `raw_data` را بدون حذف سایر فیلدهای آن تکمیل می‌کند و دانلود عادی را ادامه می‌دهد.

| نتیجه | رفتار صف |
|---|---|
| salt معتبر پیدا شد | تکمیل همان ردیف دیتابیس، سپس دانلود، Parse فقط برای درخواست تحلیل و آپلود آرشیو. |
| OpenDota هنوز salt نداد | `replay_metadata_pending`، تلاش بعدی حداقل ۵ دقیقه بعد؛ تا پایان مهلت ۲۴ ساعتهٔ همان درخواست. |
| OpenDota/relay موقتاً در دسترس نیست | job در صف می‌ماند و retry با فاصلهٔ کنترل‌شده انجام می‌شود. |
| قبلاً در ParsPack ذخیره شده | فایل آرشیو استفاده می‌شود؛ درخواست تازه‌ای به OpenDota یا Valve نمی‌رود. |

Worker و کد VPS **هر دو** باید به نسخهٔ این پچ به‌روز شوند؛ بهتر است ابتدا Worker آپدیت شود. Secret قبلی Cloudflare عوض نمی‌شود. migration و تنظیم env جدید لازم نیست. اجرای Worker جدید روی سرور ایران به VPN رایانهٔ شخصی وابسته نیست، اما موفقیت واقعی endpoint OpenDota از Cloudflare را باید پس از استقرار تست کرد.

تست read-only مسیر metadata روی VPS، بدون نوشتن در دیتابیس یا دانلود فایل:

```bash
cd /var/www/dota2notes
sudo -u dota2notes -H node --env-file=/var/www/dota2notes/.env.production \
  scripts/replay-parser/probe-metadata.mjs 9020830802 436
```

نتیجهٔ `ok:true` همراه `cluster` و `salt` یعنی مسیر دریافت metadata کار می‌کند. `replay_metadata_pending` یعنی OpenDota از مسیر Worker هم هنوز salt نداده است؛ `replay_metadata_unavailable` مشکل موقت upstream/relay را نشان می‌دهد. بعد از موفقیت probe، درخواست همان مچ در سایت را دوباره بزنید؛ job شکست‌خوردهٔ قبلی قابل درخواست دوباره است. در `local_replay_jobs` مرحلهٔ `resolving_metadata` و سپس `downloading` دیده می‌شود. هیچ ردیفی را دستی پاک یا ویرایش نکنید.

این تغییر فقط نقص metadata مچ را پوشش می‌دهد؛ اگر OpenDota واقعاً salt را منتشر نکرده باشد، یا فایل دیگر در Valve موجود نباشد، هیچ کدی نمی‌تواند Replay را از Match ID به‌تنهایی بسازد.
