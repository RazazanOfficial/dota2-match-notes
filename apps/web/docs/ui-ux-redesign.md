# بازطراحی UI/UX با هویت Dota-inspired

این پچ بدون تغییر API، دیتابیس یا رفتار Sync، رابط Web را بازطراحی می‌کند.

## زبان بصری

- Obsidian و فلز تیره برای Surfaceها
- قرمز Dire برای اکشن اصلی و وضعیت‌های تهاجمی
- سبز Radiant برای برد و وضعیت موفق
- طلایی برای Economy، GPM و Net Worth
- قاب‌های زاویه‌دار، خطوط نازک و تراکم اطلاعات شبیه HUD
- انیمیشن محدود با رعایت `prefers-reduced-motion`

از لوگو، Illustration یا Texture رسمی Valve برای تزئین رابط استفاده نشده است. نشان برنامه،
آیکون‌ها و Cursorها SVGهای داخلی و مستقل‌اند. تصاویر Hero فقط همان مسیر داده‌ای قبلی را
استفاده می‌کنند.

## سرعت و دسترس‌پذیری

- درخواست Runtime برای Font کاملاً حذف شده است.
- فونت فارسی و لاتین از System stack استفاده می‌کند.
- Focus قابل مشاهده برای Keyboard اضافه شده است.
- Cursor سفارشی Fallback استاندارد `auto` و `pointer` دارد.
- رابط در اندازه‌های Desktop، Tablet و Mobile بازچینی می‌شود.

## تغییرات مهم تجربه کاربری

- صفحه ورود اکنون Value proposition و انتخاب نقش واضح دارد.
- برند و صفحه Loading هویت یکپارچه دارند.
- خلاصه هفتگی شبیه Dashboard/HUD شده است.
- کارت مچ، KDA و GPM را بدون بازکردن Dialog نمایش می‌دهد.
- صفحه جزئیات برای Mode، Duration، KDA، GPM، XPM، Net Worth و Damage آیکون معنایی دارد.
- Net Worth و GPM با رنگ و نماد Gold از سایر داده‌ها متمایز شده‌اند.
- Sync، Queue، تصاویر تولیدی، Report و Admin از Tokenهای مشترک پیروی می‌کنند.

## بررسی انجام‌شده

```text
86 tests passed
TypeScript passed
Next.js 16.2.12 production build passed
```

## بررسی دستی پیشنهادی

1. صفحه ورود را در عرض‌های 1440، 768 و 390 پیکسل باز کنید.
2. هر دو مسیر Player و Coach را بررسی کنید.
3. یک مچ OpenDota را باز کنید و GPM، XPM، Net Worth و Damage را ببینید.
4. Modal ثبت مچ، Hero Picker، گزارش هفته، Sync panel و Admin را بررسی کنید.
5. Tab navigation و گزینه Reduce Motion سیستم‌عامل را آزمایش کنید.
