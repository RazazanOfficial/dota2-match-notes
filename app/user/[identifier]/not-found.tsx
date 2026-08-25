import Link from "next/link";
import AppLogo from "@/components/AppLogo";

export default function PlayerNotFound() {
  return (
    <main className="player-not-found">
      <AppLogo size={84} priority />
      <p lang="en">PLAYER NOT FOUND</p>
      <h1>این بازیکن در Dota2Notes پیدا نشد</h1>
      <span>شناسه را بررسی کن یا از جست‌وجوی بازیکن استفاده کن.</span>
      <Link className="primary-button" href="/">بازگشت به Dota2Notes</Link>
    </main>
  );
}
