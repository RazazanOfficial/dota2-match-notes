# پایش سرویس‌ها و صف‌ها

صفحهٔ Services فقط گزارش می‌خواند؛ فرمان systemd یا restart اجرا نمی‌کند.
Services و Timers بر اساس Iran VPS و Germany VPS گروه‌بندی می‌شوند.
API ایران snapshot محلی را با snapshot آلمان از مسیر خصوصی ترکیب می‌کند.
سمت آلمان token پل و session معتبر Super Admin همچنان الزامی‌اند.
قطع آلمان گزارش ایران را حذف نمی‌کند؛ گزارش آلمان با پیام unavailable نمایش داده می‌شود.
دریافت خصوصی حداکثر هشت ثانیه و پاسخ حداکثر ۵۱۲ KiB است؛ redirect دنبال نمی‌شود.
آمار صف‌ها از PostgreSQL اصلی خوانده می‌شوند؛ این پنل health مستقیم providerها نیست.

## نقش میزبان‌ها

| میزبان | سرویس‌های گزارش‌شده |
| --- | --- |
| ایران | Website، API، Nginx، PostgreSQL، Monitor |
| آلمان | Private Link، API، Match Sync، Replay Processing، Image Generation، Statistical Reference، Monitor |

collector فقط allowlist ثابت و journal محدود پروژه را می‌خواند؛ ورودی کاربر به فرمان‌ها نمی‌رسد.
سورس `apps/api/scripts/service-monitor/collect.mjs` است؛ نسخهٔ فعال root-owned و خارج از checkout نصب می‌شود.
snapshot نسخهٔ ۲ نقش صریح app/compute دارد. نسخهٔ قدیمی بدون نقش برای تشخیص میزبان کافی نیست.

## نصب در انتشار این تغییر

پس از استقرار runtime سازگار، روی ایران:

```bash
cd /var/www/dota2notes
sudo bash deploy/scripts/install-service-monitor.sh app
```

و روی آلمان:

```bash
cd /var/www/dota2notes
sudo bash deploy/scripts/install-service-monitor.sh compute
```

اسکریپت collector، unitهای مانیتور و `/etc/dota2notes-monitor.conf` شامل نقش و GID را نصب می‌کند.
env برنامه یا وضعیت timer مرجع را تغییر نمی‌دهد. صرف pull نسخهٔ فعال collector را عوض نمی‌کند.
برای حذف unitهای قدیمی نصب‌شده، پس از بررسی انتشار و با مجوز اپراتور، روی هر میزبان:

```bash
sudo bash /var/www/dota2notes/deploy/scripts/retire-legacy-workers.sh --apply
```

این عملیات روی production هنگام توسعه اجرا نشده است. نصب سفارشی خارج از مسیر موردانتظار باعث توقف پیش از حذف می‌شود.
سوابق و جدول‌های قدیمی DB حفظ می‌شوند؛ migration تخریبی جزو این تغییر نیست.

## معنی وضعیت‌ها

| وضعیت | معنی |
| --- | --- |
| Running | فرایند دائمی برقرار است یا یک اجرای کوتاه در حال انجام است |
| Waiting | timer روشن است و موعد بعدی معتبر دارد |
| Idle | worker کوتاه پایان موفق با timestamp واقعی دارد |
| Disabled | خاموشی عمدی؛ مرجع خاموش برای سبز شدن پنل فعال نمی‌شود |
| Stale / Unknown | گزارش یا زمان معتبر نداریم؛ سلامت حدس زده نمی‌شود |
| Failed / Stopped | شکست، توقف غیرمنتظره یا عبور از موعد معتبر پس از حاشیهٔ مجاز |

API، Match Sync و Replay Processing دائمی‌اند؛ inactive/dead آن‌ها پایان موفق یک oneshot نیست.
مقدار پیش‌فرض Result=success بدون timestamp خروج، مدرک اجرای موفق نیست.
timer برنامهٔ مؤثر، آخرین اجرا، نتیجه، موعد بعدی و شمارش معکوس دارد.
موعد از systemd می‌آید؛ برای timerهای monotonic خروجی JSON list-timers استفاده می‌شود.
اگر موعد قابل خواندن نباشد، شمارش معکوس فرضی ساخته نمی‌شود.
Accuracy/RandomizedDelay و ادامه داشتن اجرای قبلی در تشخیص عقب‌افتادگی لحاظ می‌شوند.
گزارش بیش از سه دقیقه قدیمی مستقل از حرکت شمارنده Stale است.
زمان سرور و مرورگر و نسخهٔ systemd باید در پذیرش زنده بررسی شوند.

Replay Processing یک service باقی است؛ prepare/parse/archive از صف واقعی جدا نمایش داده می‌شوند.
تعداد active فقط lease با heartbeat تازه را می‌شمارد. شکست foreground بدون phase قابل اتکا به مرحلهٔ حدسی نسبت داده نمی‌شود.
سبز بودن process موفقیت تک‌تک jobها را ثابت نمی‌کند؛ خطاهای صف جدا نمایش داده می‌شوند.

## نمایش دسکتاپ

هر VPS در باکس مستقل با پرچم نمایش داده می‌شود. ترتیب سرویس‌های ایران API، Website،
Nginx، PostgreSQL و Service Monitor است؛ در آلمان API، Private Link، Replay Processing،
Statistical Reference، Match Sync، Image Generation و Service Monitor است.
کارت مرجع آماری فضای بیشتری دارد و تک‌کارت timer تمام عرض را پر نمی‌کند.
Replay Stages شامل Replay Intake، Local Parser و Archive Upload است؛ Processing Queues
تعداد واقعی وضعیت‌های صف را در باکس‌های مستقل نمایش می‌دهد. مقدار ناموجود `—` است.

در جزئیات، چهار سطح INFO آبی، WARNING زرد، SUCCESS سبز و ERROR قرمز مستقل فیلتر
می‌شوند؛ ابتدا همه فعال‌اند. کپی فقط شامل لاگ‌های مطابق فیلتر است و شمارهٔ خطوط
موقع فیلتر همان شمارهٔ گزارش اصلی می‌ماند. priority خطا/هشدار journal حفظ می‌شود؛
خطای صریح در متن یا JSON می‌تواند stdout با priority شش را ERROR کند. پاسخ HTTP 200
یا `ok:true` به‌تنهایی موفقیت job نیست. JSON معتبر قالب‌بندی می‌شود و متن خام systemd
یا JSON ناقص بدون تغییر معنی باقی می‌ماند. زمان‌ها تقویم زبان انتخابی، منطقهٔ تهران
و رقم Latin دارند. توضیح `?` با hover موس یا فوکوس قابل‌مشاهدهٔ صفحه‌کلید باز می‌شود.

Latest Errors خطاهای journal، خطای خواندن snapshot، وضعیت شکست/توقف و خطاهای صف
را با نام سرویس و میزبان ترکیب می‌کند؛ حداکثر ۴۰ مورد نمایش داده می‌شود. این فهرست
جایگزین سامانهٔ جامع ثبت خطا نیست: collector فقط ۳۵ خط اخیر در ۲۴ ساعت هر unit و API
فقط هشت خطای صف اخیر را برمی‌گرداند. زمان snapshot جای زمان وقوع نامعلوم قرار نمی‌گیرد.
صف‌های replay، replay_archive، images و sync طبق قرارداد متعلق به workerهای آلمان‌اند؛
منبع ناشناخته بدون پرچم حدسی نمایش داده می‌شود. خاموشی عمدی مرجع همچنان Disabled است
و در جزئیات توضیح دارد؛ UI فرمان فعال‌سازی سرویس یا timer اجرا نمی‌کند.

دارایی ایران در `apps/desktop/public/flags/ir.svg` در مانیتور و انتخاب زبان مشترک است:
SVG شیر و خورشید از [ConflictFan در Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Lion_and_Sun_flag_(wreath).svg)
با مجوز CC0، پس از حذف metadata و داده‌های ویرایشگر؛ پرچم آلمان SVG سادهٔ پروژه است.
پس از تغییر دارایی‌ها، manifest را با اسکریپت‌های رسمی تولید و پیش از انتشار کلاینت
با `npm run desktop:assets:publish` روی میزبان دارایی منتشر کنید؛ build به‌تنهایی انتشار نیست.

### بررسی مرجع آماری خاموش

`Disabled` حاصل `ExpectedActive=no` در snapshot است: collector تنها وقتی timer مرجع
واقعاً `disabled` و `inactive` باشد این مقدار را برای timer و service ثبت می‌کند.
این بازطراحی وضعیت زنده یا تنظیمات STRATZ سرورها را تغییر نداده است. اپراتور روی آلمان
می‌تواند بدون فعال‌سازی، وضعیت را بررسی کند:

```bash
systemctl show dota2notes-performance-reference.timer \
  --property=UnitFileState --property=ActiveState --property=NextElapseUSecRealtime
systemctl show dota2notes-performance-reference.service \
  --property=ActiveState --property=Result --property=ExecMainStatus --property=ExecMainExitTimestamp
sudo journalctl -u dota2notes-performance-reference.service --since "24 hours ago" -n 35 --no-pager
```

پیش از تصمیم به فعال‌سازی، پذیرش اتصال و قرارداد داده طبق
[تشخیص STRATZ](stratz-connectivity-diagnostics.fa.md) و [مرجع ماهانه](monthly-reference-services.md)
انجام شود. صرف سبز شدن پنل یا یک پاسخ HTTP 200 برای فعال‌سازی کافی نیست.

## پذیرش پس از استقرار

روی هر میزبان نقش snapshot، تازگی فایل و نتیجهٔ collector بررسی شود.
توقف collector باید Stale، قطع پل باید unavailable آلمان، و خاموشی عمدی مرجع باید Disabled نشان دهد.
وب/Nginx/PostgreSQL باید از ایران گزارش شوند. تایمرهای حذف‌شده نباید کارت داشته باشند.
لاگ‌ها محدود و پاکسازی‌شده‌اند؛ token، URL امضاشده و env خصوصی وارد گزارش نشوند.
دریافت واقعی مچ، تولید سه عکس از local parser و تحلیل/آرشیو ریپلی جدا بررسی شوند.
