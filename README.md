# Dota Notes

Monorepo اپ‌های Dota Notes: دفتر مچ، دریافت و تحلیل ریپلی و کلاینت‌های جدید دسکتاپ و موبایل.
برای ادامهٔ توسعه ابتدا [فهرست مستندات](docs/README.md) و [HANDOFF](docs/HANDOFF.md) را بخوانید.

## ساختار

| مسیر | مسئولیت | وضعیت این مرحله |
| --- | --- | --- |
| `apps/web` | Next.js 16: سایت معرفی و دفتر وب فعلی | `/` معرفی؛ `/journal` دفتر؛ API و Workerهای فعلی حفظ شده‌اند |
| `apps/desktop` | Tauri 2 + React + Vite + Tailwind 4 | پوستهٔ ویندوز و فضای تحلیل با دادهٔ نمونه |
| `apps/mobile` | React Native + Expo SDK 57 | پایهٔ مشترک Android و iOS؛ صفحهٔ آغاز و تنظیمات نمایشی |
| `apps/api` | Express 5 | پایهٔ مستقل، فقط `GET /api/v1/health`؛ مهاجرت قابلیت‌ها هنوز انجام نشده |
| `packages/contracts` | قرارداد TypeScript و اعتبارسنجی Zod | قرارداد سلامت v1 و نوع تنظیمات |
| `packages/api-client` | HTTP client مشترک | سلامت API، اعتبارسنجی پاسخ و لغو درخواست |
| `packages/design-tokens` | رنگ، فاصله و منطق تنظیمات | Obsidian / Radiant / Nebula × Light / Dark / System |
| `deploy` و `docs` | عملیات سرور و مستندات | در ریشه باقی می‌مانند |

Expo ابزار توسعهٔ React Native است؛ این دو یک اپ موبایل‌اند. Tauri هم میزبان رابط React دسکتاپ است.
پوشه‌ها بر اساس برنامهٔ قابل‌اجرا جدا شده‌اند، نه تعداد frameworkها.

## شروع محلی

Node.js **24** و npm 10 یا بالاتر پیشنهاد می‌شود؛ حداقل Node موردنیاز 22.13 است.
تمام فرمان‌های زیر از **ریشهٔ مخزن** اجرا می‌شوند و یک `package-lock.json` مشترک داریم.

```bash
npm ci
```

برای وب و API نمونهٔ `.env.example` را به `.env.local` در **ریشه** کپی کنید.
کلیدها و دیتابیس فقط برای وب فعلی لازم‌اند؛ رابط نمونهٔ دسکتاپ بدون آن‌ها اجرا می‌شود.
فایل production را به دسکتاپ یا موبایل کپی نکنید.

```bash
npm run desktop:dev
```

رابط دسکتاپ در مرورگر: `http://127.0.0.1:1420`. پنجرهٔ Native ویندوز:

```bash
npm run desktop:tauri
```

اجرای Native به Rust با toolchain MSVC، ابزار C++ ویژوال‌استودیو و WebView2 نیاز دارد.
[راهنمای دسکتاپ و مهاجرت](docs/monorepo-desktop-foundation.md) مراحل و محدودیت‌ها را توضیح می‌دهد.

```bash
npm run api:dev
npm run mobile:dev
npm run dev
```

این سه برنامه را در ترمینال‌های جدا اجرا کنید: API روی `127.0.0.1:4100`، Expo با QR، وب روی `localhost:3000`.
برای بازکردن simulator آیفون با `npm run mobile:ios` به macOS/Xcode نیاز است؛ Expo مسیر مشترک هر دو پلتفرم است.

## وضعیت محصول

وب فعلی: Steam OpenID، ژورنال شخصی و عمومی، همگام‌سازی OpenDota، صف ریپلی محلی و آرشیو ParsPack،
مرجع آماری و پنل نظارت. قرارداد داده و migrationهای دیتابیس تغییر نکرده‌اند.
دسکتاپ: ناوبری، تب‌های تحلیل، فیلتر تیم/بازیکن و یادداشت **محلی نمونه**؛ سه تم، سه حالت نمایش و فارسی/انگلیسی با RTL.
دادهٔ دسکتاپ ساختگی است؛ ورود Steam، تحلیل واقعی، همگام‌سازی ژورنال و پرداخت هنوز به آن متصل نشده‌اند.
موبایل فعلاً scaffold است و تنظیماتش فقط در نشست جاری باقی می‌ماند.

دکمهٔ دانلود سایت تا انتشار installer غیرفعال است. بعد از انتشار و بررسی فایل، URL عمومی HTTPS را
در `NEXT_PUBLIC_DOWNLOAD_WINDOWS_URL` تنظیم و وب را دوباره build کنید.

## بررسی و build

```bash
npm test
npm run typecheck
npm run desktop:build
npm run api:build
npm run build
```

`npm run build` فقط وبِ مستقر روی VPS را build می‌کند؛ روی VPS نیازی به ساخت Rust یا اپ موبایل نیست.

```bash
npm run desktop:bundle
```

Installer آزمایشی Windows در `apps/desktop/src-tauri/target/release/bundle/nsis` ساخته می‌شود.
Workflow دستی `Windows desktop test installer` فایل را به‌صورت artifact تحویل می‌دهد و release عمومی منتشر نمی‌کند.
امضای installer و auto-update در این مرحله پیاده نشده‌اند. `Cargo.lock` پس از اولین build واقعی تولید و باید commit شود.

## دیتابیس و استقرار

```bash
npm run db:migrate
npm run db:studio
```

مقادیر `.env.local` ریشه برای Drizzle و Next خوانده می‌شوند؛ در production فایل ریشهٔ `.env.production` حفظ شده است.
`DOTENV_CONFIG_PATH=.env.production` برای migration از ریشه resolve می‌شود.

**برای اولین استقرار این تغییر فولدربندی، فقط pull کافی نیست:** unit سایت و Replay باید از مخزن دوباره نصب شوند.
[راهنمای این انتشار](docs/monorepo-desktop-foundation.md) و [راهنمای کامل Ubuntu](docs/deployment-ubuntu.md) را دنبال کنید.
Worker Cloudflare در این مرحله تغییر نکرده است.
