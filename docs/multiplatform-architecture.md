# ساختار چندسکویی و مرز workspaceها

این سند ساختار فعلی را شرح می دهد. [معماری دو VPS](two-vps-architecture.fa.md) مرجع topology production است.
طرح مرحله ای اولیه و شرط «بعدا Express بسازیم» با وجود API فعلی جایگزین شده است.

| workspace | نقش فعلی |
| --- | --- |
| `apps/api` | Express مستقل، احراز هویت، PostgreSQL، صف ها و providerها |
| `apps/api/release` | runtime آماده استقرار، ساخته شده از همان API |
| `apps/web` | Next.js سایت و ماژول های قدیمی/مشترک مورد نیاز رابط |
| `apps/desktop` | React/Vite و Tauri ویندوز |
| `apps/desktop/companion` | crate اجرایی مستقل برای GSI و ارسال رویداد با UI بسته |
| `apps/mobile` | workspace موبایل؛ وجود سورس به معنی انتشار store یا تست دستگاه واقعی نیست |
| `packages/api-client` | قرارداد ارتباط کلاینت با API |
| `packages/contracts` | قراردادها و نوع های مشترک |
| `packages/design-tokens` | توکن های طراحی مشترک |

## مرز داده و اجرا

business logic production در API و worker است. کلاینت مستقیم به PostgreSQL متصل نمی شود.
دانلود ریپلی native با ticket API و بدون bearer برنامه به storage انجام می شود.
Companion session کامل حساب را ندارد؛ credential گزارش دستگاه مجزا و محدود است.
مهاجرت schema در ایران انجام می شود و هر دو نقش از همان DB استفاده می کنند.
وجود فایل legacy route یا script داخل web به معنی اجرای production آن نیست؛ unitهای مستقر مرجع entry point هستند.

## مرز اشتراک کد

کد قابل اشتراک نباید dependency پلتفرم مانند Node fs یا Tauri را ناخواسته به کلاینت دیگر وارد کند.
نمایش native، Credential Manager، Steam discovery و دانلود فایل دسکتاپ با preview مرورگر برابر نیستند.
تست jsdom قرارداد رابط را بررسی می کند؛ نصب Windows، Task Scheduler و GSI به پذیرش واقعی نیاز دارند.

## توسعه و انتشار

نصب از ریشه با npm workspaces و lockfile انجام می شود. API runtime با `release:prepare` ساخته می شود؛ پوشه release دستی توسعه داده نمی شود.
نسخه نصاب، manifest و API باید هماهنگ منتشر شوند. نسخه موبایل، desktop و tag مخزن می توانند مستقل باشند؛ [انتشار](releasing.md) مرجع است.
