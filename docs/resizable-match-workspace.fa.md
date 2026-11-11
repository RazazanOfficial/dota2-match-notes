> سابقه تغییرات و قرارداد همان مرحله است. رفتار و دستور عملیاتی امروز در [معماری](two-vps-architecture.fa.md)، [استقرار](deployment-ubuntu.md)، [دریافت خودکار](automatic-match-discovery.fa.md) و [دانلود مستقیم](direct-replay-download.fa.md) آمده است. عدد تست و وضعیت VPS این متن تاریخی است.

# چیدمان جمع وجور، پنجره قابل تغییر و پارسر ریپلی

مبنا: آخرین `origin/main` تأییدشده، `773076b`، شاخه تسک `fix/resizable-match-workspace`. لاگ واقعی VPS نیز همین نسخه را نشان داد. تغییرات این تسک هنوز توسط کاربر commit/deploy نشده اند.

## رفتار در این مرحله تاریخی

- max-width اصلی ۱۳۲۰px و سایدبار قبلی بازگشته اند. عرض پنجره به محتوای تمام عرض تحمیل نمی شود.
- جدول برای تمام ردیف ها و header یک تعریف مشترک ستون با gap ثابت ۲۰px دارد؛ hero/pos/result دیگر با gap کوچک قبلی فشرده نمی شوند. اندازه hero ۶۴×۳۶، آیتم ۵۲×۳۶ و باف ۳۶×۳۶ است. شش آیتم با gap ۴px همیشه یک ردیف اند، فاصله گروه باف ۱۲px و gap داخلی باف ۶px است. عرض ستون آیتم از بیشترین تعداد باف صفحه محاسبه می شود؛ فضای بیشتری فقط به همان ستون تعلق دارد. اسکرول افقی مجاز است و ستونی حذف نمی شود.
- ترتیب ستون ها در هر دو زبان: Hero، Pos، W/L، KDA، IMP، Mode، Analysis، Duration، ID، Items، Details. header جدا از ناحیه overflow بدنه به صورت عمودی sticky است؛ scrollLeft آن مستقیم با اسکرول افقی بدنه هماهنگ می شود، بدون React render در هر حرکت. font فارسی مود Vazir و ظاهر box آن هم سبک تحلیل است؛ مود طولانی wrap می شود.
- پیشرفت پردازش و خطا در بازدید جدید صفحه بسته اند. دکمه خطا قرمز و با عنوان «خطا در آنالیز / Analysis failed» است. باز کردنش تحلیل را خودکار retry نمی کند؛ دکمه جداگانه تلاش مجدد داخل جزئیات وجود دارد. وقتی خود کاربر شروع/retry می زند، پیشرفت باز می شود. خطای برنامه نویسی به کاربر نمایش داده نمی شود.
- تنظیمات پنجره فقط کارت های نسبت 16:9، 16:10، 21:9، 4:3 و 3:2 دارد. resize و دکمه native maximize فعال اند؛ گزینه fullscreen نداریم. نسبت **ناحیه محتوای پنجره** هنگام کشیدن لبه/گوشه در Windows با `WM_SIZING` حفظ می شود؛ قاب، عنوان، DPI و حداقل اندازه حساب شده اند. maximize همه صفحه را استفاده می کند و از نسبت مستثناست.
- نصب handler روی UI thread انجام می شود؛ JS listener resize/move و چرخه resize مجدد حذف شده است. startup/انتخاب، تنها command محدود `set_window_aspect_ratio` را صدا می زند. انتخاب موفق با کلید تازه ذخیره می شود و preset قدیمی resolution خوانده نمی شود. در مرورگر کارت ها غیرفعال اند؛ در native غیر Windows command خطای Settings می دهد و startup متوقف نمی شود.
- Rust dependency/Cargo.lock تغییر نکرده اند. permission فقط پنج نسبت را برای window main مجاز می کند. مجوزهای قبلی تغییر اندازه از JS حذف شده اند؛ export recovery codes هم در manifest فرمان های app ثبت شده است.

## تشخیص replay واقعی

دو مچ `9033813921` و `9034129766` spool کامل داشته اند؛ مشکل این دو دانلود ناقص نبوده است. آزمون مستقیم مچ اول نشان داد Clarity 4.0.1 هنگام entity parsing با `ArrayIndexOutOfBoundsException` در `ClientFrame.getEntity` شکست خورده. فایل اول Zstandard است، bzip2 نیست. لاگ OOM ارائه شده شاهدی بر کمبود RAM نداشت.

آزمایش جداگانه در VPS با OpenDota commit `e17d09ef40e63c387512057cef7250eebc96be96`، Clarity **4.0.3**، protobuf **6.3** و Java17، **ReplayInspector parse مچ 9033813921** را موفق تمام کرد. علت دقیق field در decoder ایزوله نشده؛ 4.0.1 از قبل تغییر ResourceId را داشت، آن را علت قطعی معرفی نکنید. هنوز موفقیت مچ دوم، Lane extraction، ذخیره و آرشیو واقعی با این نسخه تأیید نشده اند.

build-parser.sh همین ترکیب تأییدشده را pin می کند، revision و خروجی OpenDota را حفظ می کند و JitPack اختیاری را حذف می کند. JAR در Git یا ZIP نیست؛ باید جدا روی VPS ساخته شود. importer ابتدای exception را در لاگ محدود حفظ می کند و نتیجه dry-run تعداد snapshotهای Lane را هم نشان می دهد. هویت ID صفر همچنان فقط با roster کامل تأیید می شود؛ برای عبور از خطا، اعتبارسنجی حذف نشده است.

## بررسی انجام شده و حدود آن

- ۴۱۲ تست ریشه (شامل ۷۲ دسکتاپ)، ۲۷۸ وب، ۴۰۱ API پاس شدند.
- typecheck تمام workspaceها، API build، release:prepare و Vite build موفق اند.
- چهار تست Rust geometry برای پنج نسبت، هشت جهت کشیدن، anchorها، DPI/frame/minimum و fit به فضای نمایشگر پاس شدند.
- ماژول geometry/Win32 با target ویندوز به metadata کامپایل شد؛ POM تبدیل شده با XML و نسخه های pinشده بررسی شد. این **link و installer کامل Tauri نیست**.
- WebView ویندوز، رفتار واقعی native/maximize، صفحه های با DPI متفاوت و بررسی تصویری sticky در این محیط اجرا نشده اند. نصب و تست زیر لازم است. build Next برای این تسک لازم نیست: سورس وب/dependency/schema/ENV/unit/Worker Cloudflare تغییر نکرده اند.
