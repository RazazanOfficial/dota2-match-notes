# استقرار Dota2 Notes روی Ubuntu 24.04 بدون Docker

این راهنما برای سرور با دامنه `dota2notes.ir` و مسیر ثابت
`/var/www/dota2notes` نوشته شده است. دستورها را به‌ترتیب اجرا کنید. رمزها و کلیدهای واقعی
نباید داخل Git ثبت شوند.

## ۱. آماده‌کردن DNS

در پنل دامنه یک رکورد `A` برای `dota2notes.ir` بسازید و آن را به IPv4 سرور متصل کنید.
رکورد `www` اختیاری است؛ اگر می‌خواهید `www.dota2notes.ir` هم کار کند، برای آن نیز رکورد
`A` یا `CNAME` بسازید. انتشار DNS ممکن است کمی زمان ببرد.

روی سیستم خودتان بررسی کنید:

```powershell
Resolve-DnsName dota2notes.ir
```

IP نمایش‌داده‌شده باید IP عمومی VPS باشد.

## ۲. اتصال و به‌روزرسانی Ubuntu

با MobaXterm وارد VPS شوید و اجرا کنید:

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y nginx postgresql postgresql-contrib git curl ca-certificates
```

Node.js باید به‌صورت system-wide نصب شود تا systemd آن را در `/usr/bin/node` پیدا کند.
برای این پروژه Node.js 24 مناسب است:

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
node --version
npm --version
which node
```

خروجی `which node` باید `/usr/bin/node` باشد.

## ۳. ساخت کاربر محدود برنامه

برنامه با کاربر `root` اجرا نمی‌شود:

```bash
sudo adduser --system --group --home /var/lib/dota2notes --shell /usr/sbin/nologin dota2notes
sudo install -d -o dota2notes -g dota2notes /var/www/dota2notes
```

اگر پیام داد کاربر از قبل وجود دارد، ساخت مجدد لازم نیست.

## ۴. ساخت PostgreSQL روی VPS

دیتابیس ویندوز به VPS منتقل نمی‌شود؛ روی VPS یک دیتابیس مستقل بسازید. ابتدا یک رمز تصادفی
فقط شامل حروف و عدد تولید کنید تا در URL نیاز به encode نداشته باشد:

```bash
openssl rand -hex 24
```

رمز را موقتاً در Password Manager نگه دارید و سپس وارد PostgreSQL شوید:

```bash
sudo -u postgres psql
```

به‌جای `YOUR_DATABASE_PASSWORD` رمز تولیدشده را قرار دهید:

```sql
CREATE ROLE dota_notes_app WITH LOGIN PASSWORD 'YOUR_DATABASE_PASSWORD';
CREATE DATABASE dota_notes OWNER dota_notes_app;
\c dota_notes
SELECT current_database(), current_user;
\q
```

طبیعی است که `current_user` در این بررسی `postgres` باشد، چون اتصال جاری را با postgres
باز کرده‌اید؛ مالک دیتابیس همچنان `dota_notes_app` است.

## ۵. دریافت کد پروژه

این مرحله را بعد از merge شدن آخرین پچ در شاخه `main` انجام دهید:

```bash
sudo -u dota2notes -H git clone https://github.com/RazazanOfficial/dota2-match-notes.git /var/www/dota2notes
cd /var/www/dota2notes
```

برای به‌روزرسانی‌های بعدی clone مجدد انجام ندهید؛ از `git pull --ff-only` استفاده می‌کنیم.

## ۶. ساخت تنظیمات production

```bash
sudo -u dota2notes -H cp deploy/env.production.example .env.production
sudo nano .env.production
```

حداقل این مقادیر را کامل کنید:

- `STEAM_WEB_API_KEY`
- `SUPER_ADMIN_STEAM_IDS`
- رمز موجود در `DATABASE_URL`
- `SYNC_WORKER_SECRET`
- تمام متغیرهای `CLOUD_SPACE_*`
- در صورت داشتن کلید OpenDota، مقدار `OPENDOTA_API_KEY`

برای ساخت Worker Secret اجرا کنید و خروجی را در `SYNC_WORKER_SECRET` بگذارید:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

سپس مالکیت و سطح دسترسی را محدود کنید:

```bash
sudo chown dota2notes:dota2notes .env.production
sudo chmod 600 .env.production
```

فایل واقعی `.env.production` توسط `.gitignore` نادیده گرفته می‌شود.

## ۷. نصب، Migration و Build اولیه

```bash
cd /var/www/dota2notes
sudo -u dota2notes -H npm ci
sudo -u dota2notes -H env DOTENV_CONFIG_PATH=.env.production npm run db:migrate
sudo -u dota2notes -H npm test
sudo -u dota2notes -H npm run typecheck
sudo -u dota2notes -H npm run build
```

Migration فقط schema را به‌روز می‌کند و در اجرای مجدد migrationهای انجام‌شده را تکرار
نمی‌کند.

## ۸. نصب سرویس و Image Worker

```bash
sudo cp deploy/systemd/dota2notes.service /etc/systemd/system/
sudo cp deploy/systemd/dota2notes-images.service /etc/systemd/system/
sudo cp deploy/systemd/dota2notes-images.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now dota2notes.service
```

وضعیت برنامه را ببینید:

```bash
sudo systemctl status dota2notes.service --no-pager
sudo -u dota2notes -H bash deploy/scripts/health-check.sh
```

پس از موفقیت Health Check، Timer ساخت تصاویر را فعال کنید:

```bash
sudo systemctl enable --now dota2notes-images.timer
systemctl list-timers 'dota2notes-*'
```

Sync کاربران فقط با دکمه داخل سایت انجام می‌شود. Image Worker هر دقیقه صف مشترک تصاویر را
پردازش می‌کند و قفل دیتابیس اجازه نمی‌دهد یک Job دوبار ساخته شود. فایل‌های Scheduler ساعتی
برای توسعه آینده در مخزن باقی مانده‌اند، اما در این نسخه نباید نصب یا فعال شوند.

برای اجرای دستی روی VPS:

```bash
sudo systemctl start dota2notes-images.service
```

برای دیدن Logها:

```bash
sudo journalctl -u dota2notes.service -n 100 --no-pager
sudo journalctl -u dota2notes-images.service -n 100 --no-pager
```

## ۹. فعال‌کردن Nginx

```bash
sudo cp deploy/nginx/dota2notes.ir.conf /etc/nginx/sites-available/dota2notes.ir
sudo ln -s /etc/nginx/sites-available/dota2notes.ir /etc/nginx/sites-enabled/dota2notes.ir
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

حالا این آدرس باید پاسخ بدهد:

```bash
curl --fail --show-error http://dota2notes.ir/api/health
```

دو endpoint داخلی عمداً از طریق دامنه مسدود شده‌اند و باید `404` بدهند:

```bash
curl -i -X POST http://dota2notes.ir/api/internal/sync/tick
curl -i -X POST http://dota2notes.ir/api/internal/images/tick
```

## ۱۰. Firewall بدون قطع‌شدن SSH

قبل از فعال‌کردن UFW، پورت SSH خود را بررسی کنید. اگر MobaXterm با پورتی غیر از `22` وصل
می‌شود، ابتدا همان پورت را مجاز کنید. برای پورت استاندارد:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw status
```

فقط وقتی مطمئن شدید قانون SSH صحیح است:

```bash
sudo ufw enable
sudo ufw status verbose
```

پورت‌های `3000` و `5432` نباید عمومی شوند.

## ۱۱. HTTPS با Let's Encrypt

بعد از اینکه DNS و HTTP درست شدند:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d dota2notes.ir
```

اگر رکورد `www` را نیز ساخته‌اید، می‌توانید به‌جای دستور بالا اجرا کنید:

```bash
sudo certbot --nginx -d dota2notes.ir -d www.dota2notes.ir
```

بررسی نهایی:

```bash
curl --fail --show-error https://dota2notes.ir/api/health
sudo certbot renew --dry-run
```

`APP_URL` باید از ابتدا `https://dota2notes.ir` باشد تا Steam OpenID فقط به دامنه نهایی
برگردد.

## ۱۲. روال هر انتشار بعدی

در روال ساده فعلی، سایت هنگام Pull، Migration و Build برای مدت کوتاهی متوقف است. این توقف
عمدی است تا فایل‌های `.next` در حال استفاده هم‌زمان بازنویسی نشوند:

```bash
cd /var/www/dota2notes
sudo systemctl stop dota2notes.service
sudo -u dota2notes -H git pull --ff-only origin main
sudo -u dota2notes -H npm ci
sudo -u dota2notes -H env DOTENV_CONFIG_PATH=.env.production npm run db:migrate
sudo -u dota2notes -H npm test
sudo -u dota2notes -H npm run typecheck
sudo -u dota2notes -H npm run build
sudo systemctl start dota2notes.service
sudo -u dota2notes -H bash deploy/scripts/health-check.sh
```

اگر هر فرمان قبل از `systemctl start` شکست خورد، ادامه ندهید و Log همان فرمان را بررسی
کنید. قبل از تغییرات بزرگ دیتابیس نیز از PostgreSQL نسخه پشتیبان بگیرید.

## عیب‌یابی سریع

```bash
sudo systemctl status dota2notes.service --no-pager
sudo journalctl -u dota2notes.service -n 200 --no-pager
sudo nginx -t
sudo ss -lntp | grep -E ':80|:443|:3000|:5432'
systemctl list-timers 'dota2notes-*'
```

- `127.0.0.1:3000` باید فقط محلی باشد.
- PostgreSQL باید روی localhost بماند.
- خطای Steam callback معمولاً از `APP_URL` یا DNS/HTTPS است.
- خطای Worker را ابتدا در unit مربوطه و سپس در جدول Job مربوطه بررسی کنید.

### مسیر مستقیم STRATZ

اگر DNS سرور بعضی دامنه‌ها را از یک واسط با IP چرخشی عبور می‌دهد، فقط برای STRATZ
نام‌حل‌کنی مستقیم را در `.env.production` فعال کنید:

```dotenv
STRATZ_DNS_OVER_HTTPS_URL=https://dns.google/resolve
```

این گزینه DNS سراسری سیستم یا ارتباط سرویس‌های دیگر را تغییر نمی‌دهد. پیش از استفاده از
توکن، مسیر مستقیم را بدون ارسال توکن بررسی کنید:

```bash
sudo -u dota2notes -H npm run stratz:route-check
```

مقدار `Unique direct egress IPs` باید فقط یک IP داشته باشد. سپس برنامه را Restart کنید.
