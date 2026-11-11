# پایش سرویس ها و صف ها

پنل ادمین snapshot خواندنی است؛ از داخل آن فرمان systemd اجرا یا سرویس restart نمی شود.
route مربوط به مانیتور از ایران به compute هدایت می شود؛ آمار سیستم عامل نمایش داده شده متعلق به آلمان است.
وضعیت ایران، Nginx عمومی و PostgreSQL اصلی باید جدا روی ایران بررسی شود؛ سبز بودن صفحه compute اثبات سلامت همه میزبان ها نیست.

## collector

سورس canonical در `apps/api/scripts/service-monitor/collect.mjs` است.
collector با allowlist ثابت وضعیت unitها و journal محدود پروژه را می خواند؛ ورودی کاربر به systemctl/journalctl نمی رسد.
نصب root-owned خارج از checkout انجام می شود. روی آلمان، هنگام تغییر خود collector:

```bash
sudo bash <<'BASH'
set -euo pipefail
cd /var/www/dota2notes
install -d -o root -g root -m 755 /usr/local/libexec/dota2notes
install -o root -g root -m 644 apps/api/scripts/service-monitor/collect.mjs \
  /usr/local/libexec/dota2notes/collect.mjs
install -d -o root -g dota2notes -m 750 /var/lib/dota2notes/monitor
DotaMonitorGid=$(getent group dota2notes | cut -d: -f3)
test -n "$DotaMonitorGid"
install -o root -g root -m 600 /dev/null /etc/dota2notes-monitor.conf
printf 'MONITOR_GROUP_GID=%s\n' "$DotaMonitorGid" > /etc/dota2notes-monitor.conf
install -o root -g root -m 644 deploy/systemd/dota2notes-monitor.service \
  deploy/systemd/dota2notes-monitor.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now dota2notes-monitor.timer
systemctl start dota2notes-monitor.service
sudo -u dota2notes test -r /var/lib/dota2notes/monitor/status.json
BASH
```

این بلوک فقط تنظیم اختصاصی collector را بازسازی می کند؛ env برنامه را تغییر نمی دهد.
در آپدیت صرف Markdown لازم نیست. کپی فایل collector بدون نصب دوباره نسخه root-owned، نسخه فعال را عوض نمی کند.

## تفسیر درست وضعیت

| نشانه | معنی |
| --- | --- |
| API، replay و sync daemon: `active/running` | فرایند اصلی برقرار است؛ موفقیت provider را ثابت نمی کند |
| images/monitor service: `inactive/dead` با `Result=success` | برای واحد تک اجرا پس از پایان طبیعی است؛ timer و زمان آخرین اجرا هم بررسی شوند |
| replay/sync قدیمی: disabled یا inactive | با daemon فعلی مورد انتظار است |
| performance reference timer خاموش | در نصب گزارش شده تصمیم عمدی است؛ برای سبز شدن پنل فعال نشود |
| snapshot بیش از سه دقیقه قدیمی | collector/timer/مجوز خواندن بررسی شود |
| queue pending با API سالم | worker، موعد retry، quota یا لینک DB بررسی شود |

پنل باز به طور دوره ای تازه می شود؛ اتصال WebSocket سراسری لحظه ای نداریم.
صف ها از DB خوانده می شوند و می توانند از snapshot سیستم عامل جدیدتر باشند.
collector logهای مشکوک به secret را حذف می کند، ولی log اصلی سرویس هم نباید token یا URL امضاشده داشته باشد.
این پنل health مستقیم ParsPack، Cloudflare، STRATZ یا Valve نیست.

## مشاهده هدفمند

روی آلمان:

```bash
sudo systemctl show dota2notes-link.service dota2notes-api.service \
  dota2notes-replay.service dota2notes-sync-daemon.service \
  -p Id -p ActiveState -p SubState -p NRestarts --no-pager
sudo journalctl -u dota2notes-sync-daemon.service -u dota2notes-replay.service \
  --since '15 minutes ago' -n 100 --no-pager
sudo systemctl show dota2notes-monitor.service \
  -p Result -p ExecMainStatus -p ExecMainExitTimestamp --no-pager
```

زمان ساخت مرجع ماهانه عدد ثابت ۱۳۲ دقیقه نیست؛ تعداد batch، پاسخ provider، retry، quota و خاموش بودن timer اثر دارند.
برای پیشرفت واقعی cursor و وضعیت نسخه را بخوان؛ [قرارداد مرجع](monthly-reference-services.md) مرجع است.
