import { Intro } from "./intro/Intro";

export default function HomePage() {
  const configured = process.env.NEXT_PUBLIC_DOWNLOAD_WINDOWS_URL?.trim();
  let windowsDownload: string | null = null;
  if (configured) {
    try { const url = new URL(configured); if (url.protocol === "https:" && !url.username && !url.password) windowsDownload = url.href; } catch { /* Unpublished download stays disabled. */ }
  }
  return <Intro windowsDownload={windowsDownload} />;
}
