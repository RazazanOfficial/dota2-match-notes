# کنسول وضعیت سرویس‌ها

پنل Super Admin بخش «وضعیت سرویس‌ها و صف‌ها» را فقط هنگام بازکردن دریافت می‌کند. `/dev/mock/service-monitor` در حالت توسعه نمونهٔ ثابت را نشان می‌دهد. پنل هر ۳۰ ثانیه، در صورت باز بودن صفحه، تازه می‌شود. وضعیت systemd و حداکثر ۳۵ خط آخر journal هر واحد برنامه از ۲۴ ساعت اخیر در یک snapshot دقیقه‌ای ثبت می‌شوند. Queueها از دیتابیس در زمان درخواست خوانده می‌شوند.

## نصب روی VPS، پس از استقرار کد

این مرحله را پس از راه‌اندازی دوبارهٔ سرویس اصلی و timerهای فعلی انجام دهید. collector باید خارج از checkout، در مسیر فقط قابل‌ویرایش توسط root، نصب شود؛ اجرای اسکریپت در checkout با دسترسی root مجاز نیست.

```bash
cd /var/www/dota2notes
sudo install -d -o root -g root -m 755 /usr/local/libexec/dota2notes
sudo install -o root -g root -m 644 scripts/service-monitor/collect.mjs /usr/local/libexec/dota2notes/collect.mjs
sudo install -d -o root -g dota2notes -m 750 /var/lib/dota2notes/monitor
getent group dota2notes | cut -d: -f3
```

عدد GID خروجی دستور آخر را به‌جای `YOUR_GID` قرار دهید. فایل `/etc/dota2notes-monitor.conf` فقط `MONITOR_GROUP_GID=YOUR_GID` داشته باشد و مجوز آن `root:root 0600` باشد:

```bash
sudo install -o root -g root -m 600 /dev/null /etc/dota2notes-monitor.conf
sudo nano /etc/dota2notes-monitor.conf
sudo cp deploy/systemd/dota2notes-monitor.service deploy/systemd/dota2notes-monitor.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now dota2notes-monitor.timer
sudo systemctl start dota2notes-monitor.service
sudo systemctl status dota2notes-monitor.timer --no-pager
sudo ls -l /var/lib/dota2notes/monitor/status.json
sudo -u dota2notes test -r /var/lib/dota2notes/monitor/status.json && echo readable
```

در پنل ادمین بخش Console را باز کنید. وضعیت ثبت‌شده اگر بیش از ۳ دقیقه قدیمی شود، هشدار دارد. خطاهای collector را با `sudo journalctl -u dota2notes-monitor.service -n 50 --no-pager` بررسی کنید. `inactive (dead)` برای workerهای `Type=oneshot` پس از اجرای موفق طبیعی است؛ timer فعال و `Result=success` و زمان اجرای قبلی را بررسی کنید. سرویس‌های قدیمی sync و Stratz هم در فهرست هستند و در صورت غیرفعال بودن با همین وضعیت دیده می‌شوند.

این صفحه هیچ فرمانی اجرا، سرویس را شروع/متوقف، یا log زنده stream نمی‌کند. واحدهای برنامه در یک allowlist ثابت هستند؛ Nginx و PostgreSQL فقط وضعیت دارند و journal آن‌ها خوانده نمی‌شود. خطوط مشکوک به کلید یا رمز حذف می‌شوند، اما بهتر است خود سرویس‌ها هیچ secretی log نکنند. صف‌های قدیمی ممکن است شمارش داشته باشند حتی وقتی worker متناظر غیرفعال است. سرویس‌های بیرونی مانند Cloudflare و ParsPack فقط از نتیجهٔ jobهای برنامه قابل‌استنباط‌اند؛ این صفحه health مستقیم آن‌ها را نشان نمی‌دهد.

## مدت مرجع ماهانه

در پنل «مرجع آماری ماهانه» برای هر سرویس نسبت انجام‌شده، تعداد باقی‌مانده و آخرین خطا نمایش داده می‌شود. در نسخهٔ قدیمی همهٔ Rankها جمع‌آوری می‌شدند و ۵۱۲ درخواست Performance به‌اضافهٔ ۱۶ Meta داشت. در سیاست جدید برای ماه دارای ۴ هفته، Performance شامل `۴ هفته × فقط گروه Divine/Immortal × ۳۲ دستهٔ Hero = ۱۲۸` درخواست است. Meta هم ۴ درخواست دارد. هر اجرای timer فقط یک دسته را پیش می‌برد، پس حداقل حدود ۱۳۲ دقیقه از ابتدای نسخهٔ تازه لازم است؛ زمان پاسخ Stratz، خطاها، rate limit و خاموش بودن timer آن را افزایش می‌دهند. این زمان **برآورد کف** است، نه زمان پایان تضمین‌شده. صفر بودن ردیف Hero تا پایان نسخه به معنی صفر بودن پیشرفت نیست؛ شمارندهٔ cursor را ببینید.
