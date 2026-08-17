import type { Metadata } from "next";
import AdminDashboard from "@/components/AdminDashboard";

export const metadata: Metadata = {
  title: "مدیریت | دفتر مچ‌های دوتا ۲",
};

export default function AdminPage() {
  return <AdminDashboard />;
}
