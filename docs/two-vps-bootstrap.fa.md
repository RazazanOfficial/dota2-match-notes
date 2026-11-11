# آماده سازی اولیه دو نقش؛ جدا از آپدیت عادی

این راهنما فقط برای ساخت یا بازسازی کنترل شده زیرساخت است. در نصب موجود دوباره اجرا نمی شود.
استقرار معمول از [راهنمای آپدیت](deployment-ubuntu.md) پیروی می کند؛ نصب تازه سیستم عامل یا حذف DB شرط آن نیست.

## پیش نیاز و انتخاب داده

یک حساب OS به نام `dota2notes`، checkout در `/var/www/dota2notes`، Node 24/npm 11 و env خصوصی هر نقش لازم است.
ایران PostgreSQL و Nginx/HTTPS معتبر و سایت Next دارد. آلمان Java مناسب JAR فعال، مسیر spool خصوصی و دسترسی provider و storage دارد.
پورت SSH واقعی هر میزبان باید از تنظیم فعال خوانده شود؛ در نصب گزارش شده `9011` است.

پیش از هر انتقال داده، فقط یک DB به عنوان منبع اصلی انتخاب و writerهای قدیمی متوقف شوند.
در نصب فعلی، DB اصلی `dota_notes` در ایران و مالک آن `dota_notes_app` است؛ همین داده حفظ می شود.
DBهای قدیمی ایران/آلمان خودکار merge، drop یا restore نشوند. تعداد مچ یا جدیدتر بودن بخشی از داده به تنهایی سیاست مهاجرت نیست.
اگر انتقال به محیط تازه لازم شد، snapshot خصوصی، بررسی سازگاری major PostgreSQL، restore آزمایشی و نقطه توقف نوشتن باید برنامه جدا داشته باشند.

## نقش DB

compute با نقش محدود `dota_notes_compute` متصل می شود، نه مالک schema یا superuser.
برای DB انتخاب شده، مجوز CONNECT، USAGE schema، DML جدول های مورد نیاز و USAGE/SELECT sequenceهای لازم تنظیم شوند.
migration با مالک در ایران انجام می شود. default privileges به نام نقش سازنده آینده وابسته است؛ مجوز جدول های تازه بعد از هر migration بررسی شود.
رمز فقط در prompt امن یا env خصوصی قرار گیرد؛ اتصال DB از اینترنت باز نشود.

## SSH محدود

تعریف قابل بررسی در `deploy/systemd/dota2notes-link.service` و `deploy/ssh/dota-compute-link.conf` است.
کلید اختصاصی در `/var/lib/dota2notes/.ssh/compute_link_ed25519` آلمان نگهداری می شود؛ کلید موجود overwrite نشود.
ایران حساب محدود `dota-link` با public key همان کلید را می پذیرد. private key هرگز به ایران یا Git کپی نمی شود.
گزینه های authorized key برای نصب فعلی:

```text
from="143.20.60.45",restrict,port-forwarding,permitopen="127.0.0.1:5432",permitlisten="127.0.0.1:14100" ssh-ed25519 PUBLIC_KEY_FROM_GERMANY
```

این خط نمونه است؛ placeholder با public key معتبر کامل جایگزین می شود.
بلوک `Match User dota-link` فقط یک بار و در انتهای `sshd_config` قرار گیرد؛ در Include اولیه فایل اصلی اضافه نشود.
دسترسی administrator، پورت SSH و سیاست AllowUsers/AllowGroups بدون بررسی تغییر نکنند.
قبل از reload، `sshd -t` باید موفق باشد و یک نشست administrator باز باقی بماند.

host key ایران باید از مسیر معتبر با fingerprint خود سرور تطبیق داده شود؛ خروجی ssh-keyscan به تنهایی اعتماد ایجاد نمی کند.
کلید تایید شده در `/var/lib/dota2notes/.ssh/known_hosts` آلمان و تنظیم پورت/host در `/etc/dota2notes/tunnel.env` قرار می گیرد.
فایل tunnel نمونه در `deploy/tunnel.env.example` است؛ کلید و env خصوصی permission محدود داشته باشند.

پس از آماده بودن این پیش نیازها، روی آلمان:

```bash
cd /var/www/dota2notes
sudo install -o root -g root -m 644 deploy/systemd/dota2notes-link.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now dota2notes-link.service
sudo systemctl status dota2notes-link.service --no-pager
sudo ss -lntp 'sport = :15432'
```

روی ایران:

```bash
sudo ss -lntp 'sport = :14100'
```

listenerها باید loopback باشند. `15432` آلمان به `5432` ایران و `14100` ایران به API آلمان می رود.

## unitهای نقش ها

سورس unitها در `deploy/systemd` است. قبل از فعال سازی، env و runtime همان نقش با preflight بررسی شوند.
ایران API و Next را می گیرد؛ workerها، sync timerهای قدیمی و replay timer را فعال نمی کند.
آلمان API خصوصی، link، replay service مداوم، sync daemon و timerهای images/monitor را می گیرد.
`deploy/systemd/overrides/compute-link.conf` برای وابستگی API و پردازش های مربوط به link است؛ در ایران نصب نشود.
`germany-replay.conf` برای منابع میزبان چهار core/هشت GiB فعلی است و نباید بدون سنجش روی میزبان کوچک تر کپی شود.
collector طبق [پایش](service-monitoring.md) خارج checkout و root-owned نصب می شود.
performance reference فقط پس از تایید مستقل provider فعال می شود؛ وجود فایل unit مجوز فعال کردن همه timerها نیست.

## ورودی عمومی و DNS

Nginx ایران HTTPS سایت و API را با گواهی معتبر سرو می کند. `/api/` سایت به Express، وب به Next و مسیر assets به API یا alias عمومی محدود می رود.
مسیرهای internal و readiness از ورودی عمومی بسته باشند. template HTTP ریپو جایگزین مستقیم فایل HTTPS موجود نیست.
A دامنه سایت و API و مقصد www در نصب فعلی به ایران می رسند؛ حالت DNS only مسیر مستقیم انتخاب شده است.
رکورد AAAA ناسازگار، certificate نام دامنه و upstreamهای محلی باید بررسی شوند. رکوردهای ایمیل و nameserverها به دلیل جابه جایی worker تغییر نمی کنند.
آلمان برای کلاینت public API مستقل یا رکورد DNS تازه لازم ندارد.

پس از تایید زیرساخت، ساخت runtime، migration ایران، grants، انتشار assets و آغاز سرویس ها طبق [استقرار](deployment-ubuntu.md) و سپس [پذیرش](acceptance-tests.fa.md) انجام می شوند.
