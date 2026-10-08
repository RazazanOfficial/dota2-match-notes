import { AlertCircle } from "lucide-react";
import { isPersian, type Messages } from "../i18n";

export function errorCode(error: unknown): string | null {
    return error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : null;
}
export function friendlyError(code: string | null | undefined, t: Messages) {
    const fa = isPersian(t);
    const local: Record<string, [string, string]> = {
        dota_folder_invalid: ["پوشهٔ نصب دوتا را انتخاب کن؛ همان پوشه‌ای که Steam با Browse local files باز می‌کند.", "Choose the Dota installation folder opened by Steam’s Browse local files."],
        replay_folder_required: ["ابتدا پوشهٔ نصب دوتا را انتخاب کن.", "Choose your Dota installation folder first."],
        replay_folder_write_failed: ["امکان ذخیره در پوشهٔ ریپلی نیست. دسترسی نوشتن و فضای آزاد این درایو را بررسی کن.", "The replay folder is not writable. Check its permissions and free disk space."],
        replay_write_failed: ["ذخیرهٔ فایل روی سیستم کامل نشد. فضای آزاد و دسترسی پوشهٔ ریپلی را بررسی کن.", "The replay could not be saved locally. Check free disk space and folder permissions."],
        replay_existing_invalid: ["یک فایل ناقص با این شناسه در پوشهٔ ریپلی وجود دارد. آن فایل را جابه‌جا کن و دوباره دانلود کن.", "An invalid file with this match ID already exists. Move it out of the replay folder and download again."],
        replay_format_invalid: ["فایل دریافت‌شده یک ریپلی معتبر نیست. دوباره تلاش کن؛ اگر تکرار شد، شناسهٔ مچ را به پشتیبانی بده.", "The downloaded file is not a valid replay. Try again; if it persists, share the match ID with support."],
        replay_decode_failed: ["بازکردن فایل ریپلی کامل نشد؛ ممکن است دریافت فایل ناقص باشد. دوباره دانلود کن.", "The replay could not be unpacked; its download may be incomplete. Download it again."],
        replay_transfer_failed: ["دریافت فایل ریپلی کامل نشد. اتصال اینترنت را بررسی کن و دوباره دانلود کن.", "The replay transfer could not finish. Check your connection and download again."],
        replay_size_limit: ["حجم این ریپلی از محدودیت ۲ گیگابایت بیشتر است.", "This replay exceeds the supported 2 GB size limit."],
        replay_busy: ["تا پایان دانلود فعلی صبر کن.", "Wait for the current download to finish."],
        replay_local_failed: ["دسترسی به فایل‌های ریپلی روی سیستم ممکن نشد. پوشهٔ انتخاب‌شده و دسترسی آن را بررسی کن.", "Local replay files could not be accessed. Check the selected folder and its permissions."],
        steam_launch_failed: ["بازکردن استیم ممکن نشد. نصب استیم و دسترسی میان‌برهای آن را بررسی کن.", "Steam could not be opened. Check that Steam and its game shortcuts are installed."],
    };
    if (code && local[code]) return local[code][fa ? 0 : 1];
    if (code === "offline_mode") return t.offlineRequired;
    if (code?.startsWith("replay_identity_")) return fa ? "اطلاعات این ریپلی با مچ انتخاب‌شده تأیید نشد. دوباره تلاش کن؛ اگر مشکل ادامه داشت، شناسهٔ مچ را به پشتیبانی بده." : "We couldn't verify that this replay belongs to the selected match. Try again; if it persists, share the match ID with support.";
    if (code?.includes("parser") || code === "analysis_failed") return fa ? "خواندن و تحلیل این ریپلی کامل نشد. دوباره تلاش کن؛ اگر مشکل ادامه داشت، پشتیبانی می‌تواند آن را بررسی کند." : "We couldn't finish reading and analyzing this replay. Try again; support can investigate if it continues.";
    if (code === "unauthorized" || code === "onboarding_required") return fa ? "برای ادامه، ورود و مراحل ثبت‌نام حسابت را بررسی کن." : "Check your sign-in and account setup before continuing.";
    if (code === "match_not_found" || code === "invalid_match_id") return fa ? "این مچ در دسترس نیست. تاریخچه را بازخوانی و دوباره امتحان کن." : "This match is unavailable. Refresh your history and try again.";
    if (code === "replay_too_old" || code === "replay_retry_exhausted") return fa ? "مهلت دریافت این ریپلی تمام شده است. اگر فایل در آرشیو موجود باشد، می‌توان آن را دوباره بررسی کرد." : "The replay retrieval window has ended. An archived copy may still be available for analysis.";
    if (code?.includes("disk") || code?.includes("capacity")) return fa ? "فضای پردازش سرور موقتاً کافی نیست. کمی بعد دوباره بررسی کن." : "The server temporarily lacks processing space. Check again shortly.";
    if (code?.includes("archive") || code?.includes("upload")) return fa ? "ذخیره یا دریافت ریپلی از آرشیو کامل نشد. کمی بعد دوباره تلاش کن." : "The replay couldn't be saved to or retrieved from the archive. Try again shortly.";
    if (code?.includes("metadata") || code === "replay_not_found") return fa ? "اطلاعات یا فایل ریپلی هنوز از سرور بازی در دسترس نیست. زمان تلاش بعدی در همین بخش نمایش داده می‌شود." : "The game server hasn't made the replay or its details available yet. The next retry time appears here.";
    if (code?.includes("download") || code?.includes("connect") || code?.includes("valve") || code?.includes("blocked")) return fa ? "ارتباط با سرور ریپلی یا دریافت فایل کامل نشد. کمی بعد دوباره تلاش کن." : "The replay connection or download couldn't finish. Please try again shortly.";
    if (code?.includes("checksum") || code?.includes("checkpoint") || code?.includes("invalid")) return fa ? "فایل دریافت‌شده قابل تأیید نبود. درخواست را دوباره امتحان کن." : "The downloaded file couldn't be verified. Please try the request again.";
    return fa ? "این مرحله کامل نشد. اتصال اینترنت را بررسی کن و دوباره تلاش کن." : "This step couldn't finish. Check your connection and try again.";
}
export function ErrorNotice({ error, code, title, t }: { error?: unknown; code?: string | null; title?: string; t: Messages }) {
    return <div className="error-notice" role="alert"><AlertCircle size={21}/><div><strong>{title || t.operationFailed}</strong><p>{friendlyError(code ?? errorCode(error), t)}</p></div></div>;
}
