import { notFound } from "next/navigation";
import AdminServiceMonitor from "@/components/AdminServiceMonitor";

export default function ServiceMonitorMock() {
  if (process.env.NODE_ENV === "production") notFound();
  return <main className="admin-shell" dir="rtl" style={{ paddingBlock: 40 }}>
    <header className="admin-topbar"><div className="admin-brand"><div><p className="week-kicker">DEV / MOCK</p><h1>کنسول سرویس‌ها</h1></div></div></header>
    <AdminServiceMonitor mock />
  </main>;
}
