# نسخه‌گذاری و انتشار

ترجیح تأییدشدهٔ کاربر: هر انتشار قطعی tag داشته باشد. ساخت tag و push آن پس از بررسی نسخه انجام می‌شود؛
پچ ZIP یا موفقیت کامپایل به‌تنهایی مجوز اعلام release آمادهٔ production نیست.

## قرارداد نسخه‌ها

- tag کل مخزن با قالب `vMAJOR.MINOR.PATCH`؛ پیشنهاد این مرحله `v3.2.0` است، مطابق version ریشه.
- tag روی commit ادغام‌شدهٔ `main` قرار می‌گیرد و annotated است؛ tag قبلی بازنویسی یا force-push نمی‌شود.
- نسخهٔ اپ دسکتاپ فعلاً `0.1.0` است؛ هنگام انتشار installer، نسخهٔ `apps/desktop/package.json`،
  `src-tauri/Cargo.toml` و `src-tauri/tauri.conf.json` هماهنگ شوند. versionهای اپ‌ها می‌توانند از release کل مخزن مستقل باشند.
- نسخهٔ موبایل در `apps/mobile/app.json` و package آن هماهنگ شود. build numberهای Android/iOS نیز
  هنگام انتشار واقعی تنظیم می‌شوند؛ Git tag به‌تنهایی نسخهٔ installer یا store را عوض نمی‌کند.
- برای انتشار آزمایشی می‌توان نامی مانند `v3.2.0-rc.1` انتخاب کرد. نام قطعی پیش از tag با کاربر نهایی شود.
- GitHub Release، فایل installer، Git tag و استقرار VPS مراحل جدا هستند؛ ساخت tag خودبه‌خود آن‌ها را انجام نمی‌دهد.

## مراحل پس از آماده‌شدن نسخه

از checkout تمیز، بعد از موفقیت بررسی‌ها و تأیید رفتار Windows و وب. این فرمان‌ها برای آینده‌اند:

```powershell
Set-Location "D:\Projects\dota2-match-notes"
git add -A
git diff --cached --stat
git commit -m "Create app workspaces and desktop foundation"
git push -u origin chore/monorepo-desktop-foundation
git switch main
git pull --ff-only origin main
git merge --no-ff chore/monorepo-desktop-foundation -m "Merge branch 'chore/monorepo-desktop-foundation'"
git push origin main
```

بعد از موفقیت CI و نهایی‌شدن انتشار، برای نسخهٔ پیشنهادی:

```powershell
git status --short
git fetch origin --tags
git tag --list v3.2.0
git tag -a v3.2.0 -m "Dota Notes 3.2.0 - monorepo and desktop foundation" HEAD
git push origin v3.2.0
git show --no-patch v3.2.0
```

هنگام tag باید روی `main` و HEAD همان release باشد. اگر tag از قبل وجود دارد، آن را حذف یا جابه‌جا نکنید؛
نسخهٔ جدید انتخاب کنید. اگر main بعد از commit هدف جلو رفته است، به‌جای HEAD، SHA دقیق همان merge commit را بدهید.
tag و SHA نسخهٔ مستقرشده در یادداشت انتشار ثبت شوند. مراحل VPS مطابق [راهنمای monorepo](monorepo-desktop-foundation.md)
است؛ بعد از استقرار SHA با `git rev-parse HEAD` تطبیق داده شود.

## اصلاح نصب بستهٔ اولیه

در لاگ کاربر، اعمال v2 موفق بود اما `npm ci` پیش از نصب با کمبود metadata بعضی optional dependencyهای
esbuild متوقف شد. خطا با npm 11.6.2 و انتخاب بسته‌های Windows بازتولید شد، درحالی‌که بررسی قبلی با npm 11.9
موفق بود. lockfile در workspace بدون node_modules با resolver 11.6.2 بازسازی شد؛ versionهای وابستگی‌های موجود
و package.json برنامه‌ها حفظ شدند. CI نیز Windows و Linux را پوشش می‌دهد.

اصلاحیهٔ کوچک را روی همان branch و ساختار اعمال‌شدهٔ v2 کپی کنید؛ اسکریپت اولیهٔ انتقال مجدداً اجرا نمی‌شود.
فایل واقعی env و سورس باقی می‌مانند. پس از جایگزینی lockfile:

```powershell
npm --version
npm ci
```

اگر نصب خطا داشت، پیش از تست و typecheck همان خطا بررسی شود. خطاهای نبودن Expo، Express و packageهای
مشترک در لاگ اولیه پس از نصب ناموفق رخ داده‌اند و باید بعد از نصب صحیح دوباره ارزیابی شوند.
