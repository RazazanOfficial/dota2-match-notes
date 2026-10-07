import AdminMonthlyReferences from "@/components/AdminMonthlyReferences";

export default function MonthlyReferenceMock() {
  return <main className="admin-shell" dir="rtl" style={{ paddingBlock: 40 }}>
    <header className="admin-topbar"><div className="admin-brand"><div><p className="week-kicker">DEV / MOCK</p><h1>مرجع آماری ماهانه</h1></div></div></header>
    <AdminMonthlyReferences mock />
  </main>;
}
