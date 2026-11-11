# نسخه گذاری و انتشار

commit، merge، Git tag، GitHub Release، installer و استقرار VPS مراحل جدا هستند.
موفقیت بیلد یا وجود ZIP به تنهایی release عمومی محسوب نمی شود.
مرجع فرمان های Git و VPS [استقرار عادی](deployment-ubuntu.md) است؛ دستور شاخه های تاریخی دوباره اجرا نشود.

## قرارداد نسخه

- نسخه release مخزن با tag annotated مانند `vMAJOR.MINOR.PATCH` روی commit مشخص main ثبت می شود.
- نام نسخه باید برای همان انتشار انتخاب شود؛ شماره قدیمی `v3.2.0` دستور ساخت tag تکراری نیست.
- نسخه دسکتاپ در `apps/desktop/package.json`، `apps/desktop/src-tauri/Cargo.toml` و `apps/desktop/src-tauri/tauri.conf.json` هماهنگ شود. lockfile مربوط هم باید با ابزار پروژه به روز باشد.
- Companion crate نسخه مستقل دارد؛ مستقل بودن آن به معنی نیاز نداشتن به ساخت executable همراه نصاب نیست.
- نسخه موبایل در `apps/mobile/package.json` و `apps/mobile/app.json` و build numberهای انتشار واقعی هماهنگ شود.
- تغییر doc به تنهایی نیاز به تغییر نسخه اجرایی یا نصاب ندارد.

## پیش از انتشار

main تمیز و همان SHA هدف باشد؛ بررسی های مرتبط و تست نصب واقعی اجرا شده باشند.
برای assets، manifest همان نصاب باید به objectهای منتشرشده در ایران اشاره کند.
API و worker سازگار قبل از توزیع نصاب جدید مستقر شوند. وضعیت هر VPS جدا ثبت شود.
برای تغییر schema، rollback و سازگاری نسخه قبل پیش از انتشار مشخص باشند.

پس از تعیین نسخه، در PowerShell ریشه ریپو:

```powershell
git status --short
git switch main
git pull --ff-only origin main
git fetch origin --tags
$DotaRelease = Read-Host "Release tag (for example vX.Y.Z)"
if ($DotaRelease -notmatch '^v\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$') { throw "Invalid release tag" }
if (git tag --list $DotaRelease) { throw "Tag already exists; choose a new version" }
git log -1 --format="%H%n%s"
git tag -a $DotaRelease -m "Dota Notes $DotaRelease"
git push origin $DotaRelease
git show --no-patch $DotaRelease
```

این دستورها فقط در زمان تصمیم واقعی انتشار اجرا شوند. tag قبلی جابه جا، حذف یا force-push نشود.
اگر main از نسخه تست شده جلو رفته، به جای HEAD باید SHA تایید شده همان انتشار انتخاب شود.

## یادداشت انتشار

نسخه و SHA، تغییر قابلیت، migration/env/unit لازم، نسخه manifest، نام و SHA256 نصاب، نتیجه بررسی Windows و وضعیت هر دو VPS ثبت شوند.
تعداد pass و skipped و دلیل skipped جدا نوشته شود؛ تعداد گزارش قدیمی به عنوان تضمین نسخه جدید تکرار نشود.
تست Linux و jsdom جای تست Task Scheduler، GSI و WebView2 واقعی نیستند.
