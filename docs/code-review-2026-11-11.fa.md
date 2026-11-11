# بازبینی کد و اعتبارسنجی — ۱۱ نوامبر ۲۰۲۶

مبنای سورس: `0ab8d82beef0f790aea40b7fd42fddf44272518d`؛ شاخهٔ کار: `fix/project-review-hardening`.
این گزارش دربارهٔ checkout محلی Windows و اصلاحات commit‌نشدهٔ همین بازبینی است؛ وضعیت زندهٔ سرورها را تأیید نمی‌کند.
تغییرات مستندات، `AGENTS.md` و تعریف عامل‌ها از پیش در checkout موجود بودند و حفظ شدند.

## نتیجه و دامنه

بازبینی جداگانهٔ `backend`، `frontend`، `database` و `security` انجام شد؛ `qa` اصلاحات را در زمینه‌ای جدا بررسی کرد.
نویسندهٔ تمام اصلاحات، عامل اصلی بود. متخصص‌ها فقط بررسی و پیشنهاد دادند؛ Git، production و دادهٔ واقعی را تغییر ندادند.
مسیرهای auth/recovery، topology/proxy، sync/Companion، صف و انتقال Replay، schema/migration، Desktop/native، cache و polling، UI مشترک و وابستگی‌ها مرور شدند.
این کار بازبینی مبتنی بر ریسک است و تضمین خط‌به‌خط تمام پروژه یا نبود باگ نیست. موبایل typecheck شد؛ Android/iOS build یا اجرای دستگاه انجام نشد.

دو ایراد دیتابیسِ زیر و بخشی از advisoryهای ابزارهای توسعه باز مانده‌اند؛ بنابراین «همهٔ ایرادها رفع شده» یا «آمادهٔ انتشار بدون شرط» نتیجهٔ این گزارش نیست.

## یافته‌های باز

### DB-01 — P2: ساخت partition توسط نقش محدود compute

محل: `apps/api/src/lib/monthly-reference/service.ts:56`، تابع `ensureMonthlyReference`.
این تابع هنگام ساخت نسخهٔ ماهانه، `CREATE TABLE ... PARTITION OF` اجرا می‌کند؛ مسیر tick مرجع از compute فراخوانی می‌شود.
مطابق قرارداد مجوزهای فعلی، `dota_notes_compute` مالک parent/schema نیست و مجوز DDL ندارد.
برای ماهی که partition آن از قبل ساخته نشده باشد، transaction ساخت مرجع با خطای مجوز rollback می‌شود.
تست‌های PGlite با مالک DB اجرا می‌شوند و این محدودیت نقش production را پوشش نمی‌دهند؛ مجوز واقعی سرور در این تسک خوانده نشد.

پیشنهاد: ساخت partitionهای بازهٔ پشتیبانی‌شده با عملیات owner در ایران، grant لازم روی partitionها، و نگه‌داشتن worker در محدودهٔ DML.
این تصمیم به قرارداد نگهداری و rollout نیاز دارد؛ دادن ownership یا DDL عمومی به compute در این بازبینی انجام نشد.
پذیرش لازم: ماه تازه با نقش محدود compute تکمیل شود، بدون مجوز ساخت جدول و بدون از دست‌رفتن مرجع فعال قبلی.

### DB-02 — P2: بازنویسی metadata تازهٔ Replay در import همزمان

محل‌ها: `apps/api/src/lib/opendota/repository.ts:361` و `:497`؛ محاسبهٔ `preserveVerifiedReplayRaw` پیش از upsert.
هر مسیر ابتدا `raw_data` را بدون قفل سطر می‌خواند و سپس payload محاسبه‌شده در JS را کامل می‌نویسد.
قفل user/day یا journal، writer سراسری metadata در `run-queue.mjs` را serialize نمی‌کند.
ترتیب شکست: import دادهٔ basic را می‌خواند؛ worker tuple معتبر cluster/salt/url را می‌نویسد؛ import با snapshot قبلی، همان tuple تازه را حذف می‌کند.
این یافته از ترتیب SQL به دست آمده؛ interleave چنداتصالی روی PostgreSQL واقعی در این نوبت بازتولید نشد.

پیشنهاد: حفظ tuple معتبر در conflict update اتمیک بر پایهٔ مقدار جاری DB، یا قفل مشترک match در تمام writerها.
تغییر چند writer بدون تست همزمانی مستقل وارد اصلاحات این نوبت نشد.
پذیرش لازم: دو اتصال مستقل با interleave کنترل‌شده، هم import و هم tuple تازهٔ معتبر را حفظ کنند.

## یافته‌های اصلاح‌شده

| شناسه / شدت | محل اصلی | رفتار پیشین و اصلاح |
| --- | --- | --- |
| F-01 / P1 | `apps/api/scripts/replay-parser/replay-spool.mjs:43`، `run-pipeline.mjs:137` | spool موفق هرگز پاک نمی‌شد و سقف ظرفیت را دائماً پر می‌کرد. cleanup محدود در شروع و هر دقیقه، فقط checkpointهای foreground تکمیل‌شده و archive فعال را با قفل سطر حذف می‌کند. parse pending و archive ناتمام حفظ می‌شوند. |
| F-02 / P2 | `apps/api/src/lib/opendota/client.ts:28` و نسخهٔ Web | timeout بعد از header حذف می‌شد و کل body پیش از بررسی سقف در حافظه می‌آمد. timeout تا پایان body فعال است؛ stream با شمارش بایت خوانده و هنگام عبور از سقف لغو می‌شود. خطای body به خطای امن provider تبدیل می‌شود. |
| F-03 / P2 | `apps/api/src/lib/sync/companion.ts:42` | سهمیه بر اساس `ended_at` کلاینت بود و رویداد دو روز قبل سهمیه مصرف نمی‌کرد. شمارش با deadline سروری انجام می‌شود و قفل مشترک کاربر، دستگاه‌های مختلف را serialize می‌کند. ترتیب قفل `users → companion_devices` با reset رمز سازگار است. |
| F-04 / P2 | `apps/api/src/routes/sync/observations/route.ts:25` | عدد خارج از دامنهٔ Date از شرط age عبور می‌کرد و 500 می‌ساخت. زمان نامتناهی/نامعتبر اکنون 400 می‌دهد. |
| F-05 / P2 | `apps/desktop/src/components/Replay.tsx:50` | پس از تغییر query/bازه در offline، ردیف‌ها و total فیلتر قبلی می‌ماند. snapshot با مسیر درخواست تطبیق داده می‌شود؛ cache نامرتبط نمایش داده نمی‌شود. |
| F-06 / P2 | `apps/desktop/src/components/Replay.tsx:96` | فیلتر پوزیشن نامشخص، position برابر null را پیدا نمی‌کرد. null و نبود metadata به دستهٔ نامشخص نگاشت می‌شوند؛ fa/en تست شده است. |
| F-07 / P2 | `apps/desktop/src/useMatchDetails.ts:12` و POST مسیر `matches/[matchId]/analysis` | شکست کش‌شده می‌توانست retry تازه را عقب ببرد. POST نسخه و progress ثبت‌شده را برمی‌گرداند؛ UI درخواست و updatedAt قدیمی‌تر را کنار می‌گذارد. حالت ready تا دریافت تحلیل واقعی حفظ می‌شود. |
| F-08 / P2 | `apps/api/src/lib/auth/session.ts:46` و route ورود با رمز | login می‌توانست پس از reset رمز، با نتیجهٔ bcrypt روی hash قدیمی session تازه بسازد. hash زیر قفل user دوباره بررسی و session در همان transaction ساخته می‌شود. |
| F-09 / P2 | `apps/desktop/src/desktopAuth.ts:43`، `:177` و `api.ts:144` | callback دیرهنگام Steam یا refresh/password login می‌توانست پس از ورود تازه یا logout، حساب قبلی را برگرداند. pending لغو می‌شود؛ generation/revision در مرزهای async کنترل می‌شود و نوشتن vault ترتیب دارد. logout قدیمی، bearer تازه را پاک نمی‌کند. |
| F-10 / P2 | `apps/desktop/scripts/asset-pack.mjs:53` | بازنویسی manifest یکسان در buildStart، restart پیاپی config در Vite ایجاد می‌کرد؛ هنگام آماده‌سازی پیش‌نمایش مشاهده شد. فایل فقط با تغییر بایت‌ها نوشته می‌شود؛ تست mtime افزوده شد. |
| F-11 / P2 | `.github/workflows/ci.yml` | `npm test` در root تست‌های API با پسوند mjs را شامل نمی‌شد. اجرای صریح suite API به CI اضافه شد تا تست صف/pipeline نیز اجرا شود. اجرای GitHub Actions خود در این تسک انجام نشد. |

خطاهای اعتبارسنجی محلی نیز رفع شدند: dependency قفل‌شدهٔ S3 در نصب محلی نبود و با `npm ci` بازسازی شد؛
تست استقرار API/Web با راهنمای دو VPS جاری هماهنگ شد و الزام غیرفعال‌بودن hourly sync حفظ شد.
دو SVG نشانگر با CRLF به‌جای LF، با manifest اختلاف checksum داشتند؛ بایت‌های کاری مطابق `.gitattributes` نرمال شد.
manifest فقط با اسکریپت رسمی تولید شد و نسخهٔ نهایی همان `39f45443779b9ee16c7a2ff8077bfa7cc6f3f782af3c040276157bfe28e60c94` است؛ دست‌ویرایش نشد.

## وابستگی‌ها

patchهای محدود نصب و با `npm ls` تأیید شدند:

- Desktop Vite: `8.3.2 → 8.3.8`؛ Vite زیر Vitest نیز روی `8.3.8` است.
- root/API/Web Vitest و `@vitest/mocker`: `4.1.11 → 4.1.12`.
- node-forge در هر دو مصرف‌کنندهٔ Expo: `1.4.0 → 1.4.3`، در range سازگار موجود.
- در پیگیری همین بازبینی، `@expo/cli` در range فعلی Expo از `57.0.27` به `57.0.33` رسید؛ config/config-plugins/metro-config سازگار نیز از همان زنجیره به‌روز شدند. نسخهٔ SDK اصلی Expo تغییر نکرد.
- lockfileهای root و standalone API/Web هماهنگ شدند. نسخه، integrity و قرارداد وابستگی‌های runtime API و lock تولیدی آن تغییر نکردند.

lock مستقل Web از manifest موجود عقب بود: برای مثال Next `16.3.6` را نگه می‌داشت، در حالی که manifest از قبل `16.4.3` را الزام می‌کرد؛ sharp/Zod نیز عقب بودند.
بازسازی lock آن‌ها را به قرارداد فعلی manifest و نسخه‌های استفاده‌شده در تست/بیلد root رساند؛ ارتقای جداگانهٔ manifest این پکیج‌ها انجام نشد.

اعتبارسنجی نصب تمیز با npm `11.6.2` مورد استفادهٔ CI، پس از patchها نقص entryهای optional مربوط به esbuild `0.28.2` را آشکار کرد.
root lock با همان resolver بازسازی شد؛ dry-run نصب تمیز اکنون pass است.
مقایسهٔ نسخه‌های lock نهایی با نسخه‌های نصب‌شده‌ای که تست/بیلد شدند، اختلافی در پکیج‌های موجود نشان نداد؛ entryهای اختیاری غایب اضافه شدند.
در lock مستقل API، resolver قدیمی `peer:true` را به entry مربوط به `pg` اضافه می‌کند؛ production همین پکیج را با نسخه و integrity یکسان بدون آن flag دارد.
مقایسهٔ `release:prepare` فقط این flag مربوط به چیدمان نصب را نادیده می‌گیرد؛ version/resolved/integrity و `dependencies`/`peerDependencies`/`peerDependenciesMeta` همچنان مقایسه می‌شوند.
تست‌های `release-lock.test.mjs` تغییر نسخه، integrity، dependency، peer dependency و حذف entry را رد می‌کنند. lock تولیدی runtime و نسخهٔ pg تغییر نکردند.

audit آنلاین root، قبل از اصلاح **۲۰ entry: ۴ high، ۱۵ moderate، ۱ low**، پس از اصلاح اول **۱۶ entry: ۲ high، ۱۳ moderate، ۱ low** و پس از patch سازگار Expo CLI **۸ entry، همگی moderate** دارد؛ high، critical و low فعلی صفر هستند.
این عدد تعداد entryهای آسیب‌پذیر در درخت است؛ تعداد exploitهای مستقل یا اثبات دسترسی‌پذیری در production نیست.
دو high مرحلهٔ میانی مربوط به `@expo/cli` و Zod 3 تو‌در‌توی همان CLI بودند؛ CLI جدید آن وابستگی را حذف کرد. API/Web خودشان Zod `4.6.7` دارند.
glob زیر CLI/config/metro اکنون `14.0.4` و minimatch آن `11.0.8` است؛ deepmerge و زنجیرهٔ uuid آسیب‌پذیر نیز در audit فعلی وجود ندارند.
override سراسری Zod 3 به major 4 یا downgrade پیشنهادی audit به Expo 53 / drizzle-kit 0.18 انجام نشد؛ سازگاری این تغییرها نیاز به تسک جدا دارد.
audit مستقل `apps/api/release --omit=dev --workspaces=false` **صفر advisory شناخته‌شده** گزارش کرد؛ این نتیجه اثبات امنیت کامل runtime نیست.
بررسی اولیهٔ آفلاین صفر نشان داده بود؛ آن نتیجه معتبر تلقی نشد و با audit آنلاین جایگزین شد.

منابع upstream برای patchهای امنیتی:
[Vitest manual mocks](https://github.com/vitest-dev/vitest/security/advisories/GHSA-qxg6-89mg-rqv8)،
[Vitest Windows traversal](https://github.com/vitest-dev/vitest/security/advisories/GHSA-xp26-3454-mjgp)،
[Forge](https://github.com/digitalbazaar/forge/security/advisories/GHSA-6889-vf6x-f3g5).
جزئیات advisoryهای باقیمانده و dependency path در خروجی audit نهایی ثبت شده است.

### بررسی ۸ هشدار باقی‌مانده

- `drizzle-kit → @esbuild-kit/esm-loader → core-utils → esbuild` چهار entry دارد که به همان advisory قابلیت `serve` در esbuild مربوط‌اند. loader بررسی‌شده از `transform`/`transformSync` استفاده می‌کند؛ مسیر `serve` در این مصرف پیدا نشد. [اعلام upstream](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99).
- `expo → @expo/fingerprint → glob/minimatch` چهار entry دیگر دارد. fingerprint فعلی `0.20.13` از glob `13.0.6` و minimatch `10.2.6` استفاده می‌کند؛ metadata patchهای سازگار `0.20.14` و `0.20.15` هم همچنان همین rangeهای major را دارند. اصلاحات upstream glob از `14.0.2` و minimatch از `11.0.1` شروع می‌شوند؛ override major بدون بررسی سازگاری اعمال نشد. ورودی بررسی‌شده فایل‌ها و patternهای پروژهٔ محلی است، نه درخواست API عمومی. [glob](https://github.com/isaacs/node-glob/security/advisories/GHSA-3g3m-2fjr-6pw4)، [minimatch](https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249).

این تحلیل، قابل بهره‌برداری نبودن تمام حالت‌ها را ثابت نمی‌کند؛ فقط دامنه و علت باقی‌ماندن هشدارها را مشخص می‌کند. خروجی audit صفرِ runtime مستقل API به این ابزارهای dev تعمیم داده نشده است.

### هشدار TypeScript

`baseUrl` از `apps/api/tsconfig.json` و `apps/desktop/tsconfig.json` حذف و aliasها به مسیر نسبی صریح متکی شدند؛ API اکنون `./src/*` و Desktop همچنان `../web/*` را برای `@/*` دارد.
`ignoreDeprecations` اضافه نشد. این روش مطابق [راهنمای رسمی TypeScript 6](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html#deprecated---baseurl) است و پکیج TypeScript پروژه همچنان نسخهٔ قفل‌شدهٔ `5.9.3` باقی ماند.

## اعتبارسنجی

محیط: Windows، Node `v24.16.0`، npm `11.13.0`، Cargo `1.93.1`؛ Vitest نهایی `4.1.12`.
تست‌های DB با PGlite و fixture مصنوعی اجرا شدند؛ هیچ اتصال DB زنده یا migration روی VPS اجرا نشد.
اجرای اولیهٔ Vitest با `spawn EPERM` sandbox متوقف شد و سپس با مجوز اجرا شد.
وابستگی‌های npm/Cargo غایب از cache، با lockfileهای موجود و دسترسی مجاز دریافت شدند.

| بررسی | نتیجه |
| --- | --- |
| `npm test` | Web: ۵۲ فایل / ۲۸۱ تست pass؛ root: ۹۱ فایل / ۶۵۱ تست pass |
| `npm run test -w @dota-notes/api` | ۷۳ فایل؛ ۵۲۱ pass، یک skip مخصوص Windows |
| علت skip | `replay-parser-lifecycle.test.mjs`: تست توقف descendantهای importer مخصوص Unix، به‌صراحت روی Windows غیرفعال است |
| `npm run test:native-replay` | ۱۵ pass |
| `npm run test:companion` | ۴ pass |
| `node apps/desktop/scripts/prepare-native.mjs` | build فرانت و Companion و resource موفق؛ build نهایی فرانت نیز در installer تکرار می‌شود |
| `cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml` | ۲۵ pass |
| `npm run typecheck` | تمام workspaceها pass، از جمله mobile |
| `npm run api:build` و `npm run release:prepare -w @dota-notes/api` | pass؛ خروجی تولیدی release از source بازسازی شد |
| `npm run build` | build تولیدی Next.js pass |
| `npm run desktop:installer` | pass؛ فرانت، Companion، native release و یک bundle NSIS تولید شد |
| `git diff --check` | pass؛ تغییرات کد این تسک UTF-8/LF هستند |
| `npx --yes --package=npm@11.6.2 npm ci --dry-run --ignore-scripts --offline=false` | pass؛ اعتبارسنجی root lock بدون نصب مجدد؛ اجرای remote CI ادعا نمی‌شود |
| همان dry-run با `--workspaces=false` در API/Web | هر دو lock مستقل اعتبارسنجی شدند؛ entryهای optional ناقص هماهنگ شدند |

نصاب محلی: `apps/desktop/src-tauri/target/release/bundle/nsis/Dota Notes_0.1.0_x64-setup.exe`؛ حجم گزارش‌شدهٔ Tauri حدود `4.44 MiB`.
این فایل نصب یا اجرا نشد. warningهای `dead_code` در Rust، `DEP0190` در اسکریپت موجود آماده‌سازی و هشدار اندازهٔ chunk فرانت، build را شکست ندادند؛ رفع آن‌ها وارد scope این نوبت نشد.
SHA-256 نصاب: `455C588DA2CE2D8CC918061E34BF2C5C63CD997F44B22D341052103E542704D9`.

شمار تست‌های suiteها با هم جمع نمی‌شود، چون بخشی از فایل‌های API/Desktop در root نیز اجرا می‌شوند.
تست‌های جدید، سقف و timeout stream، سهمیهٔ رویداد قدیمی و duplicate، Date نامعتبر، حذف امن spool،
قرارداد نسخهٔ POST، رقابت reset/login، callback/lookup/refresh دیرهنگام و ترتیب vault، cache فیلتر و پوزیشن نامشخص را پوشش می‌دهند.

بررسی بصری با App واقعی و `previewProfile` ساختگی در سرور محلی انجام شد:
داشبورد و Replay در فارسی/انگلیسی، RTL، viewport معمول حدود `1280×720` و `800×450`، بازکردن فیلتر و Escape با بازگشت فوکوس.
داده‌ها به‌وضوح «پیش‌نمایش آفلاین / آمار ساختگی» بودند و درخواست live provider لازم نبود.
آزمایش end-to-end ورود Steam، ایمیل، بازی/GSI واقعی، نصب و uninstall، Task Scheduler و دانلود storage واقعی انجام نشد.
reduced motion و حالت‌های offline/polling در تست‌های خودکار موجود بررسی شدند؛ audit بصری تمام صفحات/ترکیب‌های theme انجام نشد.
audit advisoryهای این گزارش مربوط به npm است؛ `cargo audit` و audit جداگانهٔ وابستگی‌های Java اجرا نشدند.

## انتشار و ادامهٔ کار

commit، push، merge، تغییر credential، اجرای schema و deploy انجام نشد. تصمیم انتشار با MeriJ است.
در پیگیری، کاربر تصمیم گرفت commit، push و merge را شخصاً انجام دهد؛ این قاعده در `AGENTS.md`، تعریف عامل release و راهنماهای Git ثبت شد. عامل این سه عملیات را اجرا نکرد.
الگوی نام شاخه `fix/<topic>` یا `feat/<topic>` و پیام commit `fix: ...` یا `feat: ...` است؛ شاخهٔ این کار به `fix/project-review-hardening` تغییر نام یافت.
نصاب این نوبت خروجی آزمایشی نسخهٔ فعلی پروژه است؛ پاس build مجوز توزیع و تأیید عملیات زنده نیست.
API اصلاح‌شده باید پیش از کلاینتِ وابسته به progress پاسخ POST مستقر شود.
بازبینی مستقل QA دو نقص در اصلاح اولیهٔ نسخهٔ POST و refresh پس از logout پیدا کرد؛ آن‌ها با تست تکمیلی اصلاح شدند.
QA در بازبینی نهایی source و تست‌های اصلاحات، blocker مشخص دیگری گزارش نکرد؛ خود QA تست/بیلد اجرا نکرد.
موارد DB-01، DB-02 و advisoryهای باقیمانده باید در تصمیم انتشار صریحاً لحاظ شوند.

## پیگیری نام شاخه، npm و TypeScript

پس از درخواست بعدی MeriJ، typecheck همهٔ workspaceها، `npm test`، تست کامل API، build API/Desktop و `release:prepare` با تنظیمات بدون baseUrl و lockfile Expo اصلاح‌شده دوباره پاس شدند.
تست config عمومی Expo CLI نیز با SDK `57.0.0` موفق بود؛ این تست، build یا نصب Android/iOS نیست.
نصب تمیز root با npm `11.6.2` به‌صورت dry-run دوباره پاس شد. هشدارهای audit فعلی همان ۸ moderate بالا هستند.
نصاب Windows و تست‌های Rust ثبت‌شده مربوط به مرحلهٔ نخست این گزارش‌اند؛ در این پیگیری فایل Rust تغییر نکرد و نصاب دوباره ساخته نشد.
هیچ فایل stage نشد و HEAD روی مبنای `0ab8d82` باقی ماند؛ هیچ commit، push یا merge انجام نشد.

### دستورهای Git فقط برای اجرای MeriJ

این بلوک توسط عامل اجرا نشده است. محدودهٔ stage مطابق تأیید کاربر، اصلاحات این تسک و همهٔ تغییرات فعلی مستندات و تعریف agentهاست.
قبل از commit، diff را بخوان؛ اگر از زمان تحویل تغییر دیگری اضافه شده، آن را جدا تعیین تکلیف کن. خروجی‌های build، env و فایل‌های موقت داخل ignore می‌مانند؛ فقط خود `.agent-work/.gitignore` اضافه می‌شود.
اگر هر دستور خطا داد، همان‌جا توقف کن؛ force-push، reset یا پاکسازی خودکار لازم نیست.

```powershell
git switch fix/project-review-hardening
git status --short
git diff --check
git diff
git add -- .github/workflows/ci.yml README.md AGENTS.md package.json package-lock.json .codex/agents .agent-work/.gitignore docs apps/api apps/desktop apps/web
git diff --cached --stat
git diff --cached
git commit -m "fix: harden replay workflows and project validation"
git show --no-patch --format=fuller HEAD
git push -u origin fix/project-review-hardening
git switch main
git pull --ff-only origin main
git merge --no-ff fix/project-review-hardening -m "Merge branch 'fix/project-review-hardening'"
git push origin main
git log -1 --format="%H%n%s"
```

این دستورها tag، GitHub Release، توزیع نصاب یا اعمال تغییر روی VPSها را انجام نمی‌دهند. مراحل VPS با خود MeriJ و طبق راهنمای استقرار است.
