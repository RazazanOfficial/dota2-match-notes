> سابقه تغییرات و قرارداد همان مرحله است. رفتار و دستور عملیاتی امروز در [معماری](two-vps-architecture.fa.md)، [استقرار](deployment-ubuntu.md)، [دریافت خودکار](automatic-match-discovery.fa.md) و [دانلود مستقیم](direct-replay-download.fa.md) آمده است. عدد تست و وضعیت VPS این متن تاریخی است.

# آماده سازی مهاجرت آلمان — ۲۵ اکتبر ۲۰۲۶

مبنا `main d4cbc67`، branch `fix/germany-direct-replay`. فایل ZIP پس از ازبین رفتن فضای تحویل قبلی بازسازی شده است؛ دستورهای قبلی همچنان معتبرند. هیچ فایل حذفی نداریم. کد commit/push نشده و هیچ VPS از این محیط تغییر نکرده است.

## رفتار

- `LOCAL_REPLAY_DOWNLOAD_MODE=direct` ریپلی را از مسیر canonical عمومی `http://replayCLUSTER.valve.net/570/ID_SALT.dem.bz2` دریافت می کند. redirects دنبال نمی شوند، relay credential ارسال نمی شود و URL ورودی استفاده نمی شود. identifiers معتبر و DNS عمومی، سقف حجم، Range/ETag، checkpoint، magic header و SHA256 حفظ شده اند. Java همچنان هویت مچ و ده بازیکن را کنترل می کند؛ header/hash به تنهایی تأیید هویت نیستند. در تست واقعی کاربر HTTPS مستقیم ناموفق بود، HTTP فایل۴۶MB را حدود۱٫۲۷ثانیه دریافت کرد؛ این عدد مدت کل تحلیل نیست.
- پیش فرض proxy ایران حفظ است. در direct اگر refresh مستقیم metadata نتیجه ندهد، worker با retry محدود منتظر می ماند و به relay برنمی گردد. OpenDota هنوز برای اطلاعات پایه/metadata مصرف می شود؛ پارس خارجی و امتیاز خارجی فعال نشده اند.
- `STRATZ_ROUTING=dns` در Node/curl و وب/API پین قدیمیIP را کنار می گذارد؛ پیش فرض pinned است. `User-Agent: STRATZ_API` از قبل وجود داشت و تغییر نکرد؛403 تست اولیه با agent آزمایشی بود. query کوچک موفق، تأیید تمام مرجع ماهانه نیست.
- prepare۱تا۴، parse۱تا۲، archive۱تا۲؛ پیش فرض۲/۱/۱. آلمان4CPU/8GB برای۲/۲/۱ با drop-in موجود، CPUQuota250% و MemoryMax4G آماده شده است. این تنظیم بعد از benchmark/cutover فعال شود؛ هنوز روی سرور نصب نشده است. حلقه ها connection مستقل و همان claim اتمیک/lease و قفل سراسری قدیمی را دارند.
- Next16.4.3، Nodemailer10.2.1، Sharpحداقل0.35.5، Zodحداقل4.6.6، body-parserحداقل2.4.0 و source-map-jsحداقل1.2.2 در manifest/lock به روز شده اند. lock مستقل API/release هم به روز است. مشکلات Expo/mobile با ارتقای ناسازگار یا audit fix --force پنهان نشده اند.
- `verify-direct-download.mjs` فقط SELECT و دانلود در پوشه موقت جدید خودش انجام می دهد و همان پوشه را حذف می کند. job یا تحلیل ثبت نمی کند.

## فقط آلمان si-209448 / 143.20.60.45

فرمان های اجرای این مرحله بازنشسته شده اند؛ برای دستور قابل اجرا از [راهنمای جاری](deployment-ubuntu.md) و برای آزمون از [پذیرش](acceptance-tests.fa.md) استفاده کن.

هر خطا دیدید توقف و خروجی را ارسال کنید. migration جدید DB نداریم؛ DNS و ایران و TeamSpeak تغییر نکنند. هیچ worker/timer روی آلمان فعلاً start/enable نشود. تنظیمات زیر فقط برای همان تست اند و ENV دائمی را تغییر نمی دهند:

فرمان های اجرای این مرحله بازنشسته شده اند؛ برای دستور قابل اجرا از [راهنمای جاری](deployment-ubuntu.md) و برای آزمون از [پذیرش](acceptance-tests.fa.md) استفاده کن.

بررسی STRATZ مرجع را حذف/بازسازی نمی کند؛ از limiter واقعی استفاده می کند و reservation/log عادی می تواند تغییر کند. خروجی این مرحله قبل از ادامه انتقال لازم است.

## باقی مانده مهاجرت

- initial restore و تست های شبکه آلمان انجام شده اند، نه cutover نهایی. اطلاعات mutable و DB باید هنگام توقف هماهنگ writerهای ایران مجدد منتقل شوند.
- TeamSpeak آلمان باید offline/masked آماده شود: UID/GID1000، subuid/subgid100000:65536 و مالکیت109986 فایل ها حفظ شود. هویت مشترک هم زمان روی دو سرور اجرا نشود. TeamSpeak ایران دست نخورده است.
- machine-id دو سرور تکراری است و باید در نگهداری کنترل شده اصلاح شود. SSH9011 پس از reboot بررسی شود. unit مسیرMTU و تنظیمات شبکه ایران روی آلمان نصب نشوند.
- پس از تأیید benchmark Java، nginx/TLS و انتقال نهایی، مقادیر direct/dns و۲/۲/۱ در ENV آلمان ذخیره شوند. قبل از اجرای worker: unit عادی و `deploy/systemd/overrides/germany-replay.conf` به صورت `/etc/systemd/system/dota2notes-replay.service.d/20-germany.conf` نصب و daemon-reload شوند؛ این ها فعلاً اجرا نشوند.
- اگر در انتقال نهایی ENV ایران دوباره کپی شد، گزینه های آلمان دوباره اعمال شوند. DNS و شروع سرویس ها فقط پس از تأیید انتقال نهایی است؛ backup/سرور ایران تا تأیید کامل حفظ شوند.

## محدودیت اعتبارسنجی

build بک اند و تست ها در این محیط ممکن اند؛ build قبلی وب با `ENOENT uv_resident_set_memory` متوقف شد و همان خطا با process.memoryUsage بازتولید شد. ادعای build موفق وب، benchmark دو Java واقعی یا اجرای VPS نداریم. build وب باید روی سیستم کاربر/آلمان تأیید شود. در بازسازی، تست ها و lockها دوباره بررسی می شوند؛ audit لحظه تحویل تضمین نبود آسیب پذیری آینده نیست.

بازسازی مجدد: ۴۶۶ تست API، ۲۷۹ تست وب و۱۶۱ تست دسکتاپ/تم، TypeScript همه workspaceها و API build/release:prepare موفق شدند؛ audit مستقل API صفر مورد داشت. ZIP فقط فایل های تغییرکرده/جدید را با مسیر نسبی صحیح دارد.
