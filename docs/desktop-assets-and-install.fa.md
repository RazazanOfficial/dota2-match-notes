# assets دسکتاپ، ساخت و نصب پاک

## بسته نصب و کش رسانه

لوگو، فونت ها، favicon و فایل های اجرایی/رابط ضروری در نصب می مانند. تصاویر، ویدیوها و رسانه های غیرضروری از API عمومی ایران دریافت می شوند.
این بسته عمومی با فایل خصوصی ریپلی پارس پک یکسان نیست.
قبل از login یا باز شدن فضای کار، `AssetGate` manifest داخل نسخه نصب شده را با کش محلی تطبیق می دهد.
اگر همه فایل ها سالم باشند، دانلود کامل انجام نمی شود؛ فایل ناقص یا خراب دوباره گرفته می شود.

| مورد | مسیر یا قرارداد |
| --- | --- |
| سورس رسانه | `apps/desktop/public` |
| manifest نسخه | `apps/desktop/asset-manifest.json` |
| کش مستقل نصب | `%LOCALAPPDATA%\DotaNotesShared\assets` |
| مبدا دانلود | `https://api.dota2notes.ir/desktop-assets/objects/` |
| نام object | SHA256 محتوا و پسوند مجاز |
| انتشار در ایران | `npm run desktop:assets:publish` سپس `release:prepare` |
| نمایش محلی | protocol اختصاصی `dota-assets` |

حذف و نصب عادی برای همان کاربر نباید assets سالم را پاک کند. پاکسازی کامل تست عمدا آنها را حذف می کند.
برنامه پیش از ورود به manifest همان نصاب وابسته است؛ نسخه قدیمی ممکن است هنوز objectهای قدیمی را لازم داشته باشد. حذف دسته جمعی objectها بدون بررسی نسخه های پشتیبانی شده انجام نشود.

## تغییر رسانه و line ending

بعد از تغییر فایل رسانه، manifest باید روی checkout استاندارد تولید، اختلاف بازبینی و همراه همان سورس commit شود:

```bash
npm run desktop:assets:publish
```

این فرمان علاوه بر تولید manifest، objectهای قابل انتشار را می سازد. فایل های خروجی عمومی از مسیر درست به runtime ایران کپی می شوند.
فونت ها داخل نصاب باقی می مانند. اسکرین شات های قدیمی انتخاب دستی پوشه توزیع نمی شوند؛ `step-01` برای آموزش پخش مشترک است.

`.gitattributes` ریشه `eol=lf` دارد. فایل متنی مانند SVG با تغییر CRLF/LF، اندازه و SHA متفاوت پیدا می کند.
اگر تست manifest در ویندوز شکست خورد، فایل واقعی را با Git و manifest همان نسخه مقایسه کن. manifest ناسازگار ویندوز را صرفا برای سبز شدن تست دوباره تولید نکن.
پس از اصلاح علت، فایل و manifest در Linux و Windows باید بایت یکسان داشته باشند.

## ساخت نصاب روی Windows

از ریشه ریپو و پس از نصب dependencyها:

```powershell
node apps/desktop/scripts/prepare-native.mjs
cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml
npm run desktop:installer
```

اسکریپت prepare ابتدا رابط و سپس Companion مستقل را می سازد و executable را به resources مورد نیاز Tauri می برد.
خروجی نصاب در `apps/desktop/src-tauri/target/release/bundle/nsis/` است.
قبل از نصب نسخه جدید، API و objectهای manifest آن باید در ایران منتشر شده باشند.

## پاکسازی کامل برای شبیه سازی نصب اول

این بخش مخصوص تست نصب اول است؛ برای آپدیت معمول اجرا نکن.
حساب و داده سرور، Steam، فایل بازی و ریپلی های `.dem` بازی پاک نمی شوند.
کش رسانه، ورود ذخیره شده، تنظیمات/WebView و Companion همین کاربر پاک می شوند.

۱. برنامه و بازی را ببند.
۲. از `Windows Settings > Apps > Installed apps > Dota Notes` برنامه را Uninstall کن.
۳. در PowerShell همان کاربری که برنامه را نصب کرده، از executable تازه ساخته شده داخل checkout استفاده کن:

```powershell
Set-Location "D:\Projects\dota2-match-notes"
& .\deploy\windows\reset-desktop.ps1 -CompanionExe .\apps\desktop\companion\target\release\dota-notes-companion.exe
```

اگر ویندوز فقط همین فایل دانلود شده را blocked کرده:

```powershell
Unblock-File -LiteralPath .\deploy\windows\reset-desktop.ps1
```

سپس reset را دوباره اجرا کن؛ Execution Policy کل سیستم را تغییر نده.
اسکریپت task و فرایندهای همین محصول و همان نشست را مدیریت می کند؛ پنجره متعلق به برنامه دیگر را نبند.
اگر خطا داد، نصب را به عنوان «پاک» حساب نکن. پس از پیام موفقیت:

```powershell
Test-Path "$env:LOCALAPPDATA\DotaNotesShared"
Test-Path "$env:APPDATA\ir.dota2notes.desktop"
Test-Path "$env:LOCALAPPDATA\ir.dota2notes.desktop"
```

هر سه باید `False` باشند. نصاب جدید را اجرا کن؛ صفحه assets باید قبل از login بیاید.
برای آزمون حفظ کش، در نوبت بعد فقط uninstall/install عادی انجام بده و reset را اجرا نکن.

## فایل محلی ریپلی و تشخیص بازی

تشخیص مسیر از رجیستری Steam، `libraryfolders.vdf`، `appmanifest_570.acf` و وجود executable معتبر بازی استفاده می کند؛ اسکن حجیم همه درایوها و حدس حجم ۵۰ گیگ لازم نیست.
قبل از هر دانلود مسیر انتخابی دوباره اعتبارسنجی می شود؛ مسیر نامعتبر دوباره کشف یا از کاربر گرفته می شود.
وجود فایل معتبر وضعیت «دانلود شده» دارد. فایل ناقص نباید فقط با وجود نام نهایی معتبر فرض شود.
توضیح قرارداد انتقال در [دانلود مستقیم](direct-replay-download.fa.md) است.
