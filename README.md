# Dota 2 Match Notes

دفتر فارسی و واکنش‌گرا برای ثبت، مرور و گزارش مچ‌های Dota 2 با Next.js و ذخیره JSON در Google Drive.

## امکانات

- تقویم شمسی هفتگی از شنبه ۳ مرداد ۱۴۰۵
- جست‌وجو و انتخاب همه هیروها همراه تصویر
- انتخاب چندگانه هیروهای بن‌شده
- ثبت Role و Queue Type هر بازی
- ثبت، ویرایش و حذف بازی با به‌روزرسانی فوری رابط
- نشست ورود ۳۰روزه با توکن تصادفی و بدون JWT
- مشاهده فقط‌خواندنی مچ‌ها توسط مربی با Username بازیکن
- گزارش هفتگی با باکس مستقل برای هر روز
- خروجی استاتیک Next.js برای GitHub Pages
- ذخیره اطلاعات در JSON خصوصی Google Drive از طریق Google Apps Script

## اجرا

```bash
npm install
npm run dev
```

سایت محلی روی `http://localhost:3000` اجرا می‌شود.

## بررسی

```bash
npm test
npm run typecheck
npm run build
```

## Google Apps Script

کد Google Apps Script به‌دلیل داشتن شناسه فایل خصوصی Drive و منطق احراز هویت عمداً
داخل ریپوی عمومی نگهداری نمی‌شود. پس از ساخت Deployment جدید از نوع Web App با
`Execute as: Me` و `Who has access: Anyone`، URL عمومی نهایی `/exec` در متغیر
`NEXT_PUBLIC_API_URL` هنگام ساخت سایت قرار می‌گیرد.

داده‌ها در فایل خصوصی `dota2-match-notes.json` ذخیره می‌شوند. رمز خام ذخیره نمی‌شود و
پس از ورود، فقط هش توکن نشست در JSON قرار می‌گیرد. مرورگر فقط توکن تصادفی را در Cookie
نگه می‌دارد و از `localStorage`، `sessionStorage` و `IndexedDB` استفاده نمی‌شود.

اطلاعات ثابت هیروها از پروژه MIT
[`odota/dotaconstants`](https://github.com/odota/dotaconstants) تهیه شده و تصاویر هیروها
از CDN رسمی Steam دریافت می‌شوند. این پروژه وابستگی زمان اجرا به Steam API ندارد.
