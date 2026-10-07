"use client";

import { useState } from "react";
import styles from "./intro.module.css";

export function Intro({ windowsDownload }: { windowsDownload: string | null }) {
  const [language, setLanguage] = useState<"fa" | "en">("fa");
  const fa = language === "fa";
  const copy = fa ? {
    journal: "ورود به دفتر مچ", eyebrow: "فضای شخصی تو برای DOTA 2", title: "هر مچ، یک فرصت برای بهتر شدن.",
    description: "مچ‌هایت را مرور کن، ریپلی را تحلیل کن و نکته‌هایی را که یاد گرفته‌ای کنار بازی نگه دار. Dota Notes در مسیر یک تجربهٔ تازه برای دسکتاپ و موبایل است.",
    download: "دانلود برای ویندوز", upcoming: "نسخهٔ ویندوز در حال ساخت است", legacy: "باز کردن نسخهٔ وب", platform: "Windows اول · Android و iOS در مراحل بعد", sample: "پیش‌نمایش · دادهٔ نمونه", victory: "پیروزی Radiant", worth: "ارزش دارایی", lane: "امتیاز لین", duration: "مدت بازی", features: "بازی را از زاویهٔ تازه ببین", cards: [["مچ‌ها و یادداشت‌ها", "دفتر مچ فعلی همین حالا در نسخهٔ وب در دسترس است؛ مرور بازی و ثبت نکته‌ها در یک جا."], ["ریپلی و تحلیل محلی", "دریافت ریپلی و صف پردازش روی سرور؛ مسیر فعلی تحلیل در زمان ساخت کلاینت‌های جدید حفظ می‌شود."], ["تجربه به انتخاب تو", "رابط دسکتاپ با چند تم، حالت روشن و تاریک و سیستم، و پشتیبانی از فارسی و انگلیسی."]], footer: "Dota Notes یک پروژهٔ مستقل است و وابسته به Valve نیست.",
  } : {
    journal: "Open match journal", eyebrow: "YOUR PERSONAL DOTA 2 WORKSPACE", title: "Every match. A chance to improve.",
    description: "Review your matches, analyze replays and keep what you learn next to the game. Dota Notes is building a new experience for desktop and mobile.",
    download: "Download for Windows", upcoming: "Windows app is in development", legacy: "Open the web journal", platform: "Windows first · Android and iOS later", sample: "Preview · Sample data", victory: "Radiant victory", worth: "Net worth", lane: "Lane score", duration: "Duration", features: "See your game from a new angle", cards: [["Matches and notes", "The existing web journal is available now. Review games and record what you learn in one place."], ["Replays and local analysis", "Replay downloads and processing run on the server. The current analysis pipeline stays available as new clients are built."], ["Make it yours", "Desktop foundation with multiple themes, light, dark and system appearance, plus English and Persian."]], footer: "Dota Notes is an independent project and is not affiliated with Valve.",
  };
  return <main className={styles.intro} dir={fa ? "rtl" : "ltr"} lang={language}>
    <header className={styles.header}><a href="/" className={styles.brand}><img src="/logos/logo_64x64.png" width={36} height={36} alt="" /><bdi>DOTA NOTES</bdi></a><nav className={styles.nav}><label><span className={styles.srOnly}>{fa ? "زبان" : "Language"}</span><select value={language} onChange={event => setLanguage(event.target.value as "fa" | "en")}><option value="fa">فارسی</option><option value="en">English</option></select></label><a href="/journal">{copy.journal}</a></nav></header>
    <section className={styles.hero}><div><p className={styles.eyebrow}>{copy.eyebrow}</p><h1>{copy.title}</h1><p className={styles.description}>{copy.description}</p><div className={styles.actions}>{windowsDownload ? <a className={styles.primary} href={windowsDownload}>{copy.download}</a> : <button className={styles.primary} disabled>{copy.upcoming}</button>}<a className={styles.secondary} href="/journal">{copy.legacy}</a></div><p className={styles.platform}>{copy.platform}</p></div>
      <div className={styles.preview}><div className={styles.previewBar}><bdi>DOTA NOTES / ANALYSIS</bdi><span>{copy.sample}</span></div><div className={styles.match}><img src="/heroes/ember_spirit.png" width={128} height={72} alt="Ember Spirit" /><div><h2><bdi>Ember Spirit</bdi></h2><p>{copy.victory} · <bdi>36:42</bdi></p></div></div><div className={styles.stats}><div><span>K / D / A</span><strong><bdi>9 / 3 / 17</bdi></strong></div><div><span>{copy.worth}</span><strong><bdi>21,480</bdi></strong></div><div><span>{copy.lane}</span><strong><bdi>81 / 100</bdi></strong></div></div><div className={styles.spark} aria-hidden="true">{[18,24,21,37,44,40,58,66,61,82,90,100].map((height,index) => <span key={index} style={{height:`${height}%`}} />)}</div></div>
    </section>
    <section className={styles.features}><h2>{copy.features}</h2><div className={styles.cards}>{copy.cards.map(([title, description],index) => <article key={title}><span className={styles.number}><bdi>0{index+1}</bdi></span><h3>{title}</h3><p>{description}</p></article>)}</div></section><footer className={styles.footer}>{copy.footer}</footer>
  </main>;
}
