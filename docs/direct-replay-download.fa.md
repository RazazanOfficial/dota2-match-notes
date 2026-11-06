# دانلود مستقیم ریپلی

`GET /api/replays/:matchId/download` پس از session معتبر، کلید متعلق به همان مچ،
اندازه آرشیو و SHA256 را بررسی می کند و یک presigned GET پانزده دقیقه ای برای
همان object می دهد: `download.url`, `bytes`, `sha256`, `expiresAt`.
پاسخ `private, no-store` است؛ URL در خطا یا لاگ قرار نمی گیرد. Secret Key به
کلاینت نمی رسد، ولی شناسه Access Key طبق قرارداد S3 بخشی از URL است.

نبود آرشیو 409 `replay_archive_pending` و اختلال storage خطای 503 می دهد.
سیاست دسترسی authenticated standalone-match endpoint قبلی حفظ شده و ژورنال
حساب دیگر همراه فایل افشا نمی شود.

native ابتدا ticket را با bearer از API می گیرد، سپس بدون bearer یا Cookie
برنامه از storage دریافت می کند. فقط HTTPS و tenant تست شده `c677095.parspack.net`
پذیرفته می شوند؛ userinfo، پورت غیرعادی، fragment، نام فایل مچ دیگر و redirect
رد می شوند. SHA256 روی بایت های واقعی شبکه محاسبه و پیش از نهایی شدن فایل بررسی
می شود. codec از محتوا raw/BZip2/Zstandard را تشخیص می دهد، نه صرفا پسوند.

ورودی آرشیو حداکثر ۲۰۰ MiB و خروجی بازشده حداکثر ۲ GiB است. فایل موقت پس از
موفقیت بدون بازنویسی فایل موجود نهایی می شود. resume بایتی اضافه نشده است.
timeout اتصال بیست ثانیه و سقف انتقال پانزده دقیقه است.

کلاینت جدید منتظر `directDownloadReady` می ماند؛ وجود spool آلمان کافی نیست.
خطای موقت pending/busy حداقل پنج ثانیه تا تلاش بعد فاصله دارد. پایان بودجه آرشیو
دانلود را failed می کند، حتی اگر آنالیز completed باشد. درخواست تازه بودجه آرشیو
را از نو شروع می کند. API جدید باید قبل از نصب جدید منتشر شود؛ `/file` قدیمی
برای سازگاری باقی است.

[قرارداد S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html)
و [SDK](https://github.com/aws/aws-sdk-js-v3/tree/main/packages/s3-request-presigner)
مرجع امضا هستند. تست curl مستقیم جای تست نصاب native را نمی گیرد.
