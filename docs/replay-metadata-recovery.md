# بازیابی اطلاعات ناقص Replay

اگر دریافت سادهٔ مچ قبل از آماده‌شدن Replay انجام شود، `dota_matches.raw_data` ممکن است `cluster` داشته باشد ولی `replay_salt` نداشته باشد. رکورد مچ و اتصال ژورنال حذف نمی‌شوند.

پس از **درخواست صریح دانلود یا تحلیل**، صف Replay ابتدا آرشیو ParsPack و دادهٔ Parse موجود را بررسی می‌کند. فقط اگر واقعاً به دریافت از Valve نیاز باشد و اطلاعات دانلود ناقص باشد، endpoint خصوصی `/v1/metadata/{matchId}` در Cloudflare Worker را صدا می‌زند. Worker ابتدا OpenDota `/api/matches/{matchId}` را بررسی می‌کند؛ اگر salt مستقیم وجود نداشته باشد، لینک استاندارد Valve را فقط با تطبیق دقیق Match ID و cluster می‌خواند. سپس `/api/replays?match_id=...` را امتحان می‌کند. در صورت دریافت ۴۲۹ از مسیر عمومی، اگر secret اختیاری `OPENDOTA_API_KEY` روی Worker تنظیم شده باشد، **فقط یک درخواست** به `/api/matches/{matchId}` با آن کلید می‌فرستد. Worker تنها Match ID، cluster و salt معتبر را برمی‌گرداند. صف همان `raw_data` را بدون حذف سایر فیلدهای آن تکمیل می‌کند و دانلود عادی را ادامه می‌دهد؛ کاربر سایت چیزی وارد نمی‌کند.

| نتیجه | رفتار صف |
|---|---|
| salt معتبر پیدا شد | تکمیل همان ردیف دیتابیس، سپس دانلود، Parse فقط برای درخواست تحلیل و آپلود آرشیو. |
| OpenDota هنوز salt نداد | `replay_metadata_pending`، تلاش بعدی حداقل ۵ دقیقه بعد؛ تا پایان مهلت ۲۴ ساعتهٔ همان درخواست. |
| OpenDota پاسخ ۴۲۹ می‌دهد | مسیر عمومی دیگر و در صورت تنظیم secret، یک درخواست دارای کلید امتحان می‌شود؛ اگر همه محدود باشند، job با فاصلهٔ کنترل‌شده در صف می‌ماند. |
| OpenDota/relay موقتاً در دسترس نیست | job در صف می‌ماند و retry با فاصلهٔ کنترل‌شده انجام می‌شود. |
| قبلاً در ParsPack ذخیره شده | فایل آرشیو استفاده می‌شود؛ درخواست تازه‌ای به OpenDota یا Valve نمی‌رود. |

برای این تغییر، استقرار Worker کافی است؛ کد فعلی VPS با پاسخ آن سازگار است. Secret قبلی `REPLAY_PROXY_TOKEN` عوض نمی‌شود؛ migration لازم نیست. تنظیم `OPENDOTA_API_KEY` روی Worker اختیاری است، اما اگر هر دو endpoint عمومی ۴۲۹ بدهند، بدون کلید یا منبع مستقل دیگری هیچ تضمینی برای استخراج خودکار salt وجود ندارد. کلید OpenDota اگر از قبل در اختیار دارید، فقط در secret های Cloudflare ذخیره کنید و هرگز در git یا خروجی دستورها نگذارید. کلید سرور VPS به Worker منتقل نمی‌شود مگر اینکه خودتان آن را به‌صورت secret تعریف کنید.

برای افزودن کلید موجود، از پوشهٔ `deploy/cloudflare/replay-proxy` دستور `npx wrangler secret put OPENDOTA_API_KEY` را اجرا و مقدار را در ورودی مخفی Wrangler ثبت کنید. سپس `npx wrangler deploy` را اجرا کنید. اگر کلید ندارید، ابتدا Worker را بدون آن مستقر و probe زیر را اجرا کنید؛ اگر هنوز ۴۲۹ بود، تغییر کد به‌تنهایی رفع قطعی محدودیت OpenDota نیست. کاربران سایت هیچ مرحلهٔ دستی ندارند.

تست read-only مسیر metadata روی VPS، بدون نوشتن در دیتابیس یا دانلود فایل:

```bash
cd /var/www/dota2notes
sudo -u dota2notes -H node --env-file=/var/www/dota2notes/.env.production \
  scripts/replay-parser/probe-metadata.mjs 9023606320 271
```

برای همین مچ نتیجهٔ درست `ok:true`، `cluster:271` و `salt:349414436` است. این probe فقط metadata را می‌سنجد؛ اثبات دانلود/Parse/آپلود کامل نیست. `replay_metadata_rate_limited` یعنی منابع مورد استفادهٔ Worker همچنان ۴۲۹ می‌دهند؛ `replay_metadata_pending` یعنی هنوز salt نداده‌اند. بعد از موفقیت probe، درخواست تحلیل همین مچ را در سایت دوباره بزنید؛ job شکست‌خورده قابل درخواست دوباره است. در `local_replay_jobs` مرحلهٔ `resolving_metadata` و سپس `downloading` دیده می‌شود. هیچ ردیفی را دستی پاک یا ویرایش نکنید.

این تغییر فقط نقص metadata مچ را پوشش می‌دهد؛ اگر OpenDota واقعاً salt را منتشر نکرده باشد، یا فایل دیگر در Valve موجود نباشد، هیچ کدی نمی‌تواند Replay را از Match ID به‌تنهایی بسازد.
