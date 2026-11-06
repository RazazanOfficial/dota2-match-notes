# استقرار جاری: برنامه در ایران، پردازش در آلمان

مرجع معماری: [دو VPS](two-vps-architecture.fa.md). مسیر دانلود:
[دانلود مستقیم](direct-replay-download.fa.md). این راهنما checkout موجود
`/var/www/dota2notes` و کاربر `dota2notes` را حفظ می کند. clone، reset/clean، نصب
مجدد OS یا حذف دیتابیس قبلی لازم نیست. دستیار روی VPS چیزی اجرا نکرده است.

## ۱. Windows: pull، شاخه، Copy/Replace و بررسی

```powershell
git status --short
git switch main
git pull --ff-only origin main
git switch -c feat/two-vps-processing
```

تغییر محلی را پیش از switch تعیین تکلیف کنید. فایل های ZIP را با مسیر نسبی روی
همین checkout جایگزین کنید؛ env واقعی را بازنویسی نکنید. سپس:

```powershell
npm ci
npm test
npm run test -w @dota-notes/api
npm run test:desktop
npm run typecheck
npm run api:build
npm run desktop:build
npm run test:native-replay
cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml
npm run desktop:installer
git diff --check
git status --short
git add -A
git commit -m "Split Iran application and Germany compute services"
git push -u origin feat/two-vps-processing
git switch main
git pull --ff-only origin main
git merge --no-ff feat/two-vps-processing -m "Merge branch 'feat/two-vps-processing'"
git push origin main
```

نصاب بعد از استقرار API نصب شود. خروجی NSIS در
`apps/desktop/src-tauri/target/release/bundle/nsis/` است.

## ۲. پیش بررسی نسخه و توقف نویسنده ها

IP فعلی ایران `87.107.165.50` و آلمان `143.20.60.45` است. روی هر دو VPS:

```bash
sudo -u dota2notes -H git -C /var/www/dota2notes status -sb
sudo -u postgres psql -d dota_notes -Atc "SHOW server_version;"
pg_dump --version
node --version
```

Node.js 24 و npm 11 استفاده شود. برای این روال restore، major PostgreSQL مقصد
و ابزارها را با منبع آلمان هماهنگ کنید. اگر متفاوت اند، ابتدا همین مورد بررسی
شود؛ dump جدید را به سرور قدیمی تر تحمیل نکنید.

داده نهایی از آلمان می آید. برای حفظ دیتابیس قبلی ایران، مقصد تازه
`dota_notes_primary` خواهد بود. داده دو دیتابیس را با هم merge نکنید.

در هر دو VPS، فقط سرویس های موجود همین پروژه را متوقف کنید:

```bash
for DOTA_UNIT in dota2notes-replay.timer dota2notes-sync.timer dota2notes-sync-manual.timer dota2notes-images.timer dota2notes-performance-reference.timer dota2notes-opendota-parse.timer dota2notes-stratz.timer dota2notes-monitor.timer; do
  if systemctl cat "$DOTA_UNIT" >/dev/null 2>&1; then sudo systemctl disable --now "$DOTA_UNIT"; fi
done
for DOTA_UNIT in dota2notes-sync-daemon.service dota2notes-replay.service dota2notes-sync.service dota2notes-images.service dota2notes-performance-reference.service dota2notes-opendota-parse.service dota2notes-stratz.service dota2notes-api.service dota2notes.service; do
  if systemctl cat "$DOTA_UNIT" >/dev/null 2>&1; then sudo systemctl stop "$DOTA_UNIT"; fi
done
```

این مرحله پنجره توقف دارد. TeamSpeak و سایر سرویس ها در این دستورها نیستند.

## ۳. snapshot خصوصی و restore در ایران

روی آلمان، در نشست root:

```bash
umask 077
sudo -u postgres pg_dump --format=custom --no-owner --no-privileges --dbname=dota_notes > /root/dota-two-vps-final.dump
sha256sum /root/dota-two-vps-final.dump > /root/dota-two-vps-final.dump.sha256
sudo cp -a /var/www/dota2notes/.env.production /root/dota-germany-env.before-two-vps
```

dump و فایل sha را با SFTP به `/root/` ایران منتقل کنید. آنها را در Git، گفتگو
یا storage عمومی قرار ندهید. parser و spool روی آلمان می مانند و پاک نمی شوند.
روی ایران، در نشست root:

```bash
cd /root
sha256sum -c dota-two-vps-final.dump.sha256
sudo cat /root/dota-two-vps-final.dump | sudo -u postgres pg_restore --list
sudo -u postgres createdb --owner=dota_notes_app dota_notes_primary
sudo cat /root/dota-two-vps-final.dump | sudo -u postgres pg_restore --exit-on-error --single-transaction --no-owner --no-privileges --role=dota_notes_app --dbname=dota_notes_primary
sudo -u postgres psql -d dota_notes_primary -P pager=off -c \
"SELECT count(*) AS users FROM users; SELECT count(*) AS matches FROM dota_matches; SELECT count(*) AS replay_jobs FROM local_replay_jobs;"
```

مالک موجود ایران `dota_notes_app` باید وجود داشته باشد. اگر مقصد تازه از قبل
وجود دارد، آن را drop نکنید؛ نام و وضعیت آن قبل از ادامه بررسی شود.
role محدود worker را فقط اگر وجود ندارد بسازید:

```bash
sudo -u postgres psql -d dota_notes_primary
```

```sql
CREATE ROLE dota_notes_compute LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
\password dota_notes_compute
GRANT CONNECT ON DATABASE dota_notes_primary TO dota_notes_compute;
GRANT USAGE ON SCHEMA public TO dota_notes_compute;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dota_notes_compute;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO dota_notes_compute;
ALTER DEFAULT PRIVILEGES FOR ROLE dota_notes_app IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO dota_notes_compute;
ALTER DEFAULT PRIVILEGES FOR ROLE dota_notes_app IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO dota_notes_compute;
ALTER ROLE dota_notes_compute SET statement_timeout = '60s';
ALTER ROLE dota_notes_compute SET lock_timeout = '5s';
ALTER ROLE dota_notes_compute SET idle_in_transaction_session_timeout = '60s';
\q
```

رمز در prompt خصوصی psql وارد و در URL آلمان encode می شود. PostgreSQL روی
loopback:5432 بماند؛ پورت اینترنتی لازم نیست. migration آینده با مالک DB در ایران
اجرا شود، نه با role محدود compute.

## ۴. دریافت سورس و ساخت runtime روی هر دو سرور

```bash
sudo -u dota2notes -H git -C /var/www/dota2notes pull --ff-only origin main
cd /var/www/dota2notes
sudo -u dota2notes -H npm ci
sudo -u dota2notes -H npm run api:build
sudo -u dota2notes -H npm run release:prepare -w @dota-notes/api
sudo -u dota2notes -H npm ci --prefix apps/api/release --workspaces=false
```

در اولین مهاجرت، وب ایران نیز با سورس فعلی build شود:

```bash
sudo -u dota2notes -H npm run build
```

انتشار بعدی بدون تغییر سورس/dependency وب به Next build نیاز ندارد. release را
دستی ویرایش نکنید. هنگام `npm ci` ریشه، وب و workerهای وابسته متوقف باشند.

## ۵. کلید اختصاصی و حساب محدود SSH

روی آلمان، فقط اگر کلید از قبل وجود ندارد:

```bash
sudo install -d -o dota2notes -g dota2notes -m 700 /var/lib/dota2notes/.ssh
sudo -u dota2notes -H ssh-keygen -t ed25519 -N "" -f /var/lib/dota2notes/.ssh/compute_link_ed25519
sudo cat /var/lib/dota2notes/.ssh/compute_link_ed25519.pub
```

کلید موجود overwrite نشود. فقط `.pub` را به ایران منتقل کنید. روی ایران:

```bash
sudo adduser --system --group --home /var/lib/dota-link --shell /usr/sbin/nologin dota-link
sudo install -d -o dota-link -g dota-link -m 700 /var/lib/dota-link/.ssh
sudo nano /var/lib/dota-link/.ssh/authorized_keys
```

یک خط شامل گزینه های زیر و سپس متن کامل public key آلمان در همان خط:

```text
from="143.20.60.45",restrict,port-forwarding,permitopen="127.0.0.1:5432",permitlisten="127.0.0.1:14100" ssh-ed25519 YOUR_GERMANY_PUBLIC_KEY
```

```bash
sudo chown dota-link:dota-link /var/lib/dota-link/.ssh/authorized_keys
sudo chmod 600 /var/lib/dota-link/.ssh/authorized_keys
sudo cp -a /etc/ssh/sshd_config /root/sshd_config.before-dota-link
sudo grep -n "Match User dota-link" /etc/ssh/sshd_config
```

بلوک `deploy/ssh/dota-compute-link.conf` فقط یک بار در انتهای فایل اصلی اضافه
شود؛ در Include ابتدای فایل قرار نگیرد. پورت SSH و دسترسی administrator عوض نشود.
اگر `AllowUsers/AllowGroups` محدود است، حساب جدید باید طبق همان سیاست مجاز شود.

```bash
sudo sh -c 'printf "\n" >> /etc/ssh/sshd_config; cat /var/www/dota2notes/deploy/ssh/dota-compute-link.conf >> /etc/ssh/sshd_config'
sudo /usr/sbin/sshd -t && sudo systemctl reload ssh
sudo /usr/sbin/sshd -T | sed -n '/^port /p'
sudo ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

روی آلمان، پورت واقعی بالا را وارد و fingerprint را با خود ایران مقایسه کنید:

```bash
read -r -p "Iran SSH port: " DOTA_IRAN_SSH_PORT
ssh-keyscan -p "$DOTA_IRAN_SSH_PORT" -t ed25519 87.107.165.50 > /root/dota-iran-hostkey.candidate
ssh-keygen -lf /root/dota-iran-hostkey.candidate
```

فقط پس از تطبیق دقیق fingerprint:

```bash
sudo sh -c 'cat /root/dota-iran-hostkey.candidate >> /var/lib/dota2notes/.ssh/known_hosts'
sudo chown dota2notes:dota2notes /var/lib/dota2notes/.ssh/known_hosts
sudo chmod 600 /var/lib/dota2notes/.ssh/known_hosts
sudo install -d -m 700 /etc/dota2notes
sudo install -m 600 /var/www/dota2notes/deploy/tunnel.env.example /etc/dota2notes/tunnel.env
sudo nano /etc/dota2notes/tunnel.env
```

IP و پورت واقعی را وارد کنید؛ پورت 22 را حدس نزنید.

## ۶. env نقش ها و شروع پل

از env فعلی هر میزبان کپی خصوصی بگیرید. فایل مثال را با آن merge کنید، نه اینکه
کل فایل را با placeholder جایگزین کنید:

- ایران: `deploy/env.app.example` با دیتابیس محلی `dota_notes_primary`.
- آلمان: `deploy/env.compute.example` با role compute و پورت 15432.
- `DOTA_COMPUTE_TOKEN`: مقدار تصادفی یکسان حداقل ۴۳ کاراکتری در دو میزبان.
- `SYNC_WORKER_SECRET`، super admin و سیاست های حساب/زمان یکسان باشند.
- کلید Steam، STRATZ و ایمیل روی آلمان. CLOUD_SPACE_* برای امضای GET در ایران
  و upload در آلمان لازم است. URL عمومی callback همان API ایران می ماند.

```bash
node -e 'console.log(require("crypto").randomBytes(32).toString("base64url"))'
sudo chown dota2notes:dota2notes /var/www/dota2notes/.env.production
sudo chmod 600 /var/www/dota2notes/.env.production
```

مقدار واقعی secret فقط در env خصوصی دو سرور قرار بگیرد. روی آلمان:

```bash
sudo cp /var/www/dota2notes/deploy/systemd/dota2notes-link.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now dota2notes-link.service
sudo systemctl status dota2notes-link.service --no-pager
sudo ss -lntp 'sport = :15432'
```

روی ایران `ss -lntp 'sport = :14100'` باید listener loopback نشان دهد.

## ۷. API ایران و workerهای آلمان

روی هر دو، unit API ریپو را نصب کنید. روی ایران:

```bash
cd /var/www/dota2notes
sudo cp deploy/systemd/dota2notes-api.service /etc/systemd/system/
sudo -u dota2notes -H env DOTENV_CONFIG_PATH=/var/www/dota2notes/.env.production node apps/api/release/dist/migrate.js
sudo -u dota2notes -H env DOTENV_CONFIG_PATH=/var/www/dota2notes/.env.production node apps/api/release/dist/preflight.js --check-db
sudo cp deploy/systemd/dota2notes.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now dota2notes-api.service dota2notes.service
curl -fS --max-time 10 http://127.0.0.1:4100/health/ready
```

هیچ worker پردازشی روی ایران فعال نشود. روی آلمان JAR معتبر و incoming خصوصی
قبلی حفظ شوند؛ این تغییر JAR تازه لازم ندارد. سپس:

```bash
cd /var/www/dota2notes
sudo cp deploy/systemd/dota2notes-api.service deploy/systemd/dota2notes-replay.service deploy/systemd/dota2notes-sync-daemon.service /etc/systemd/system/
sudo cp deploy/systemd/dota2notes-images.service deploy/systemd/dota2notes-images.timer /etc/systemd/system/
sudo cp deploy/systemd/dota2notes-performance-reference.service deploy/systemd/dota2notes-performance-reference.timer /etc/systemd/system/
for DOTA_SERVICE in dota2notes-api dota2notes-replay dota2notes-images dota2notes-performance-reference; do
  sudo install -d "/etc/systemd/system/$DOTA_SERVICE.service.d"
  sudo cp deploy/systemd/overrides/compute-link.conf "/etc/systemd/system/$DOTA_SERVICE.service.d/20-compute-link.conf"
done
sudo cp deploy/systemd/overrides/germany-replay.conf /etc/systemd/system/dota2notes-replay.service.d/30-germany-resources.conf
sudo systemctl daemon-reload
sudo systemctl enable --now dota2notes-api.service
curl -fS --max-time 15 http://127.0.0.1:4100/health/ready
sudo systemctl enable --now dota2notes-replay.service dota2notes-sync-daemon.service
sudo systemctl enable --now dota2notes-images.timer
sudo systemctl enable --now dota2notes-performance-reference.timer
```

timer قدیمی sync/manual-sync و replay، enrichment بازنشسته STRATZ و OpenDota parse
خاموش بمانند. وب آلمان لازم نیست. collector آلمان را نیز با نسخه root-owned جدید
طبق [راهنمای مانیتور](service-monitoring.md) جایگزین کنید تا unit پل و daemon دیده شوند.

## ۸. بررسی HTTPS، DNS و پذیرش

روی ایران health محلی و health پل را بخوانید:

```bash
curl -fS --max-time 10 http://127.0.0.1:4100/health/ready
curl -fS --max-time 15 http://127.0.0.1:14100/health/ready
sudo nginx -t
sudo certbot certificates
```

HTTPS ایران باید گواهی معتبر دامنه های فعلی را داشته باشد. اگر ندارد، پیش از
cutover گواهی معتبر آماده شود؛ از `-k` استفاده نکنید. config HTTP نمونه را روی
config HTTPS موجود کورکورانه کپی نکنید. upstream عمومی همان loopback:4100 و 3000 است.
قبل از DNS، روی Windows:

```powershell
curl.exe -4 --noproxy "*" --resolve api.dota2notes.ir:443:87.107.165.50 --connect-timeout 10 --max-time 20 https://api.dota2notes.ir/health/live
curl.exe -4 --noproxy "*" --resolve dota2notes.ir:443:87.107.165.50 --connect-timeout 10 --max-time 20 -o NUL -w "HTTP=%{http_code} TOTAL=%{time_total}\n" https://dota2notes.ir/
```

بعد از موفقیت، رکورد A سایت/API و www را به ایران ببرید. برای مسیر مستقیم
فعلی proxy DNS خاموش بماند. AAAA متناقض حذف شود؛ nameserver و رکوردهای ایمیل به
این مهاجرت ربطی ندارند و تغییر نمی کنند. cache DNS را پاک و تست عادی را تکرار کنید.

بعد از نصب جدید: session و مچ ها از ایران، دریافت مچ و آنالیز در آلمان، نتیجه
در DB ایران و دانلود از میزبان پارس پک با هش درست بررسی شوند. یک بار پل را عمدا
stop کنید: خواندن اطلاعات و enqueue محلی باید ادامه داشته باشند و عملیات خارجی
خطای مشخص بدهند. بعد پل و سرویس های وابسته را صریح restart کنید:

```bash
sudo systemctl stop dota2notes-link.service
sudo systemctl start dota2notes-link.service
sudo systemctl restart dota2notes-api.service dota2notes-replay.service dota2notes-sync-daemon.service
```

این سه فرمان برای آزمون کنترل شده روی آلمان اند. `Requires` در stop عمدی می تواند
وابسته ها را متوقف کند. در قطع عادی شبکه reconnect/Restart و بازیابی lease فعال اند.
زمان دریافت، parse، نوشتن نتیجه و upload واقعی multipart جدا سنجیده شوند.

## rollback

قبل از اولین نوشتن در DB تازه ایران، با توقف writerها، برگرداندن env و سرویس
های قبلی آلمان و DNS می توان به منبع قبلی برگشت. DB و spool قبلی حذف نشده اند.
بعد از پذیرفتن نوشتن جدید در ایران، بازگرداندن صرف DNS/env کافی نیست: writerها
باید متوقف و آخرین DB ایران به مقصد rollback منتقل شود تا دو شاخه داده ایجاد نشود.
