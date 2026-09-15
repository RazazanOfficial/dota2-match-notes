import Link from "next/link";
import { ArrowRight, SearchX } from "lucide-react";

export default function MatchNotFound() {
  return (
    <main className="match-not-found">
      <section>
        <SearchX aria-hidden="true" />
        <p>جزئیات مچ</p>
        <h1>این مچ پیدا نشد</h1>
        <span>ممکن است مچ در دفتر این بازیکن ثبت نشده باشد یا لینک کامل نباشد.</span>
        <Link href="/"><ArrowRight aria-hidden="true" /> بازگشت به صفحه اصلی</Link>
      </section>
    </main>
  );
}
