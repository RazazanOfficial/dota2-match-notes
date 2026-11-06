# تحویل جاری: ایران و آلمان

مبنای سورس `072e48b27bfdf9bcb6ae9a925fac5136ed4cc3cd` است. شاخه کار
`feat/two-vps-processing` است. این بسته هنوز روی VPS اجرا نشده است.

## مرجع جاری

- [معماری](two-vps-architecture.fa.md)
- [استقرار و rollback](deployment-ubuntu.md)
- [دانلود مستقیم](direct-replay-download.fa.md)
- [اندازه گیری مسیر فایل](network-baseline-2026-11.fa.md)
- گزارش اعتبارسنجی در بسته تحویل؛ وضعیت واقعی VPS فقط از خروجی همان VPS مشخص است.

## قرارداد همکاری

آخرین main و شاخه جدا؛ تغییر محلی کاربر بازنویسی نشود. تحویل ZIP با مسیر نسبی
فایل هاست. کاربر در checkout موجود Windows ابتدا pull و branch و سپس Copy/Replace
انجام می دهد. commit/push/merge خودکار انجام نشود. merge کاربر `--no-ff` است.
روی VPS موجود clone مجدد یا reset/clean انجام نشود. secrets، dump، کلید خصوصی و
URL موقت واقعی وارد Git، ZIP و لاگ نشوند. TeamSpeak یا دیتابیس قبلی خودکار پاک نشوند.

## نقش ها

- `standalone`: رفتار یک سرور برای توسعه و سازگاری نصب قدیمی.
- `app`: API عمومی، سایت، session، DB اصلی و ثبت صف در ایران.
- `compute`: دریافت خارجی، parser، sync، مرجع STRATZ و تصویر روی آلمان.
- همه workerها روی آلمان به همان دیتابیس ایران از SSH متصل می شوند؛ DB دوم نداریم.
- پورت 15432 آلمان به 5432 ایران و پورت 14100 ایران به API:4100 آلمان متصل اند؛
  همگی loopback. PG اینترنتی نمی شود. کلید host تایید و حساب SSH محدود است.
- `DOTA_COMPUTE_TOKEN` با session کاربر متفاوت است؛ هر دو در هدایت خصوصی رعایت می شوند.
- نسخه عمومی سایت و API به IP ایران اشاره می کند. failover جهانی اضافه نشده است.

## مسیرهای مهم

| بخش | مسیر |
| --- | --- |
| نقش، allowlist و کنترل مقصد | `apps/api/src/runtime/topology.ts` |
| guard مشترک worker | `apps/api/scripts/node-role.mjs` |
| پل HTTP خصوصی | `apps/api/src/http/compute-proxy.ts` |
| صف و پردازش | `apps/api/scripts/replay-parser/run-pipeline.mjs` و `run-queue.mjs` |
| وضعیت ریپلی و آرشیو | `apps/api/src/lib/replay/job-repository.ts` |
| امضای دانلود | `apps/api/src/lib/replay/download-ticket.ts` |
| اعتبارسنجی لینک و هش | `apps/desktop/src-tauri/src/replay_download.rs` |
| دریافت و باز کردن ریپلی | `apps/desktop/src-tauri/src/replay.rs` و `replay_codec.rs` |
| دانلود پس زمینه | `apps/desktop/src/taskManager.ts` |
| نمونه های نقش | `deploy/env.app.example` و `deploy/env.compute.example` |

## قواعد داده و بازیابی

منشای داده parser، خلاصه خارجی و override کاربر متفاوت است؛ فرمول نمره و مرجع
فعال تغییر داده نشده اند. queue، lease و heartbeat در DB باقی می مانند. قطع
اتصال، وضعیت ذخیره شده ایران را حذف نمی کند. HTTP نوشتنی خودکار retry نمی شود.

spool متعلق به آلمان است؛ ایران آن را روی دیسک خود بررسی نمی کند. مچ قدیمی با
checkpoint ثبت شده می تواند برای بررسی فایل روی آلمان دوباره صف شود. دانلود
کلاینت جدید منتظر آرشیو می ماند. پایان بودجه آرشیو به کاربر گزارش می شود؛ درخواست
تازه کاربر تلاش آرشیو را از نو شروع می کند. سقف شبکه ۶، metadata ۱۲ در ۲۴ ساعت و
آرشیو ۸ حفظ شده است.

ورود تازه، ایمیل و lookup خارجی هنگام قطع پل می توانند 503 بدهند. session موجود،
تاریخچه، health و enqueue محلی ادامه دارند. پس از قطع عمدی unit پل، سرویس های
وابسته باید صریح restart شوند. وقفه عادی شبکه با reconnect و بازیابی lease مدیریت می شود.

## محدودیت ها

- SQL worker از لینک بین الملل عبور می کند؛ latency و حجم نتیجه باید روی VPS سنجیده شود.
- دانلود مستقیم resume بایتی ندارد. URL پانزده دقیقه اعتبار دارد؛ اتصال native
  بیست ثانیه و کل انتقال پانزده دقیقه timeout دارند. خطا فایل نهایی معتبر ایجاد نمی کند.
- native فقط میزبان تست شده `c677095.parspack.net` را می پذیرد. تغییر storage به
  بررسی allowlist و نصاب تازه نیاز دارد. bearer برنامه به storage ارسال نمی شود.
- API جدید قبل از نصاب جدید منتشر شود. `/file` برای سازگاری نصاب قدیمی باقی است.
- GC، Telegram، auto-fetch و تغییر الگوریتم history در این تسک ساخته نشده اند.
- `/internal/stratz/tick` بازنشسته و 410 است؛ timer آن فعال نشود. worker مرجع جداست.
- موفقیت تست محلی به معنی نصب VPS، رفع همه مشکلات ISP یا ساخت installer Windows نیست.

[handoff قدیمی](history/handoff-single-vps.md) فقط سابقه باگ ها و تصمیم های قبلی است.
