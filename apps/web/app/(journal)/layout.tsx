import type { ReactNode } from "react";
import AppToastContainer from "@/components/AppToastContainer";
import AmbientBackdrop from "@/components/AmbientBackdrop";
import CursorThemeProvider from "@/components/CursorThemeProvider";
import "react-toastify/dist/ReactToastify.css";
import "./globals.css";
import "./dota-theme.css";
import "./match-details.css";
import "./match-analysis.css";
import "./match-analysis-v3.css";
import "./cursor-themes.css";

export default function JournalLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <><AmbientBackdrop /><CursorThemeProvider>{children}</CursorThemeProvider><AppToastContainer /></>;
}
