# تصمیم معماری چندسکویی Dota Notes

## نتیجه

معماری هدف شامل Web با Next.js، Android با React Native، Windows با Tauri و یک API مستقل
Node.js/Express است. این جهت درست است، اما انتقال فوری تمام API Routeهای موجود به Express
در این مرحله توصیه نمی‌شود. ابتدا مرزهای مشترک ساخته می‌شوند و مهاجرت Backend هم‌زمان با شروع
اولین کلاینت Native انجام می‌شود.

دلیل اصلی این ترتیب:

- Route Handlerهای فعلی Next.js همین حالا یک API عمومی HTTP هستند و برای توسعه Web کافی‌اند.
- Tauri محتوای Static را داخل WebView اجرا می‌کند و Server-side Next.js را داخل برنامه اجرا
  نمی‌کند؛ نسخه Windows باید به API راه‌دور متصل شود.
- React Native می‌تواند منطق TypeScript و قرارداد داده را به اشتراک بگذارد، اما UI آن Native
  است و نباید کامپوننت‌های DOM/CSS وب به آن تحمیل شوند.
- انتقال زودهنگام Backend، هم‌زمان با بازطراحی محصول، سطح خطا و زمان نگهداری را بدون منفعت فوری
  افزایش می‌دهد.

منابع رسمی:

- [Next.js Backend for Frontend](https://nextjs.org/docs/app/guides/backend-for-frontend)
- [Tauri + Next.js](https://v2.tauri.app/start/frontend/nextjs/)
- [Tauri frontend configuration](https://v2.tauri.app/start/frontend/)
- [React Native platform-specific code](https://reactnative.dev/docs/platform-specific-code)
- [Express production security](https://expressjs.com/en/advanced/best-practice-security/)

## ساختار هدف Monorepo

```text
apps/
  web/              Next.js
  api/              Node.js + Express 5
  mobile/           React Native (Android first)
  desktop/          Tauri 2 + React/Vite shell
packages/
  contracts/        Zod schemas, DTOs, error codes, API version
  domain/           Pure TypeScript business rules
  api-client/       Typed HTTP client used by every frontend
  design-tokens/    Colors, spacing, semantic icon names
  test-fixtures/    Shared safe test data
```

کد وابسته به PostgreSQL، Steam، OpenDota، Object Storage و Secretها فقط در `apps/api` قرار
می‌گیرد. کلاینت‌ها هیچ‌گاه مستقیم به دیتابیس یا سرویس‌های دارای Secret متصل نمی‌شوند.

## مراحل اجرا

### مرحله ۱ — اکنون

- تثبیت UI/UX وب و Design Tokenهای معنایی.
- حفظ Backend فعلی برای جلوگیری از دو تغییر بزرگ هم‌زمان.
- تعریف DTOها و Error Codeهای پایدار برای API.
- خارج‌کردن تدریجی منطق Pure از Route Handlerها به ماژول‌های مستقل.

### مرحله ۲ — پیش از React Native

- تبدیل Repository به Monorepo با npm workspaces.
- ساخت `packages/contracts` و `packages/api-client`.
- مستندسازی API با OpenAPI یا تولید Spec از Schemaهای Zod.
- طراحی احراز هویت کلاینت Native؛ Cookie مرورگر نباید بدون طراحی به Mobile/Desktop تعمیم داده
  شود.

### مرحله ۳ — API مستقل

- ساخت Express 5 در `apps/api` و انتقال Routeها به‌صورت عمودی، Feature-by-feature.
- نگه‌داشتن URL و شکل Responseها در زمان مهاجرت.
- قرار دادن Nginx جلوی Web و API، مانند `/api/v1/...` یا زیردامنه مشخص.
- افزودن Helmet، CORS allowlist، Rate limit، Validation، Structured logging، Health check و
  Graceful shutdown.
- در پایان، Next.js فقط Web frontend/BFF بسیار نازک خواهد بود.

### مرحله ۴ — کلاینت‌ها

- Android: React Native با UI سازگار با Touch، Back navigation و وضعیت شبکه ضعیف.
- Windows: Tauri با React/Vite و API راه‌دور؛ فقط قابلیت‌های واقعاً Desktop در Rust/Pluginها.
- اشتراک کد روی قرارداد، API client، Domain و Design tokenهاست؛ انتظار اشتراک صددرصد UI وجود
  ندارد.

## تصمیم‌های امنیتی

- فایل `.env.production` از VPS به سیستم‌های توسعه کپی نمی‌شود.
- برای توسعه، Secret و دیتابیس جدا با حداقل دسترسی ساخته می‌شود.
- Steam/OpenDota/Object Storage Key فقط در Backend باقی می‌ماند.
- Authentication برای Mobile/Desktop پیش از پیاده‌سازی Tokenها Threat-model می‌شود.
- API از ابتدا Version می‌شود تا انتشار یک کلاینت قدیمی Desktop یا Android شکسته نشود.

## معیار شروع مهاجرت Express

مهاجرت زمانی شروع شود که حداقل یکی از موارد زیر برقرار باشد:

1. اولین Sprint واقعی React Native آغاز شده باشد؛
2. Routeهای API قرارداد تست‌شده و نسبتاً پایدار داشته باشند؛
3. منطق Domain از HTTP handlerها جدا شده باشد؛
4. زمان کافی برای تست هم‌زمان Web، Mobile و Production وجود داشته باشد.

تا قبل از آن، جداسازی مرزها مهم‌تر از جداسازی Processهاست.
