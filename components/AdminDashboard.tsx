"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CircleX,
  KeyRound,
  Search,
  UserPlus,
} from "lucide-react";
import { toast } from "react-toastify";
import AppLogo from "./AppLogo";
import AdminReleaseNotes from "./AdminReleaseNotes";
import AdminPasswordDialog from "./AdminPasswordDialog";

type RangeDays = 7 | 30 | 90;
type JobStatus = "pending" | "processing" | "completed" | "failed";

interface AdminOverview {
  counts: {
    users: number;
    usersWithLogin: number;
    databaseAdmins: number;
    activeSessions: number;
    journalMatches: number;
    cachedDotaMatches: number;
    generatedImages: number;
    generatedImageBytes: number;
    adminAuditLogs: number;
    newUsersToday: number;
    analyzedMatchesToday: number;
  };
  imageJobs: Record<JobStatus, number>;
  openDotaUsage: Array<{
    key: string;
    used: number;
    limit: number;
    remaining: number;
    percent: number;
    resetAt: string | null;
  }>;
  analytics: {
    rangeDays: number;
    from: string;
    to: string;
    daily: Array<{
      day: string;
      newUsers: number;
      analyzedMatches: number;
      openDotaRequests: number;
    }>;
  };
  recentImageJobs: Array<{
    id: string;
    status: JobStatus;
    attempts: number;
    errorCode: string | null;
    updatedAt: string;
    matchId: string;
    dotaMatchId: string | null;
    heroName: string;
    userHandle: string;
  }>;
}

interface AdminUser {
  id: string;
  steamId: string;
  steamAccountId: number;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  profileUrl: string | null;
  hasPassword: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  lastLoginAt: string | null;
  lastManualSyncAt: string | null;
  createdAt: string;
}

const number = new Intl.NumberFormat("fa-IR");
const compactNumber = new Intl.NumberFormat("fa-IR", { notation: "compact" });
const date = new Intl.DateTimeFormat("fa-IR", { month: "short", day: "numeric" });
const dateTime = new Intl.DateTimeFormat("fa-IR", { dateStyle: "short", timeStyle: "short" });

async function adminRequest<T>(input: string, init?: RequestInit) {
  const response = await fetch(input, {
    credentials: "same-origin",
    cache: "no-store",
    ...init,
  });
  const body = await response.json().catch(() => null) as {
    error?: { message?: string };
  } | null;
  if (!response.ok) throw new Error(body?.error?.message || "درخواست مدیریت انجام نشد");
  return body as T;
}

function bytes(value: number) {
  if (value < 1024) return `${number.format(value)} B`;
  if (value < 1024 ** 2) return `${number.format(value / 1024)} KB`;
  if (value < 1024 ** 3) return `${number.format(value / 1024 ** 2)} MB`;
  return `${number.format(value / 1024 ** 3)} GB`;
}

export default function AdminDashboard() {
  const [range, setRange] = useState<RangeDays>(30);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [steamIdentifier, setSteamIdentifier] = useState("");
  const [provisioning, setProvisioning] = useState(false);
  const [passwordUser, setPasswordUser] = useState<AdminUser | null>(null);

  const loadOverview = useCallback(async () => {
    const result = await adminRequest<{ ok: true; overview: AdminOverview }>(
      `/api/admin/overview?range=${range}`,
    );
    setOverview(result.overview);
  }, [range]);

  const loadUsers = useCallback(async () => {
    const params = new URLSearchParams({
      query: appliedQuery,
      limit: "25",
      offset: String(offset),
    });
    const result = await adminRequest<{
      ok: true;
      users: AdminUser[];
      total: number;
    }>(`/api/admin/users?${params.toString()}`);
    setUsers(result.users);
    setTotalUsers(result.total);
  }, [appliedQuery, offset]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([loadOverview(), loadUsers()])
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "داشبورد بارگذاری نشد");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [loadOverview, loadUsers]);

  useEffect(() => {
    const active = Boolean(
      overview && (overview.imageJobs.pending || overview.imageJobs.processing),
    );
    if (!active) return;
    const timer = window.setInterval(() => void loadOverview(), 5_000);
    return () => window.clearInterval(timer);
  }, [loadOverview, overview]);

  async function provision(event: FormEvent) {
    event.preventDefault();
    setProvisioning(true);
    try {
      const result = await adminRequest<{ created: boolean; user: AdminUser }>(
        "/api/admin/users",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ steamIdentifier }),
        },
      );
      toast.success(
        result.created
          ? `حساب ${result.user.displayName} ساخته شد.`
          : `اطلاعات ${result.user.displayName} از Steam به‌روزرسانی شد.`,
      );
      setSteamIdentifier("");
      await Promise.all([loadUsers(), loadOverview()]);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "ثبت حساب انجام نشد");
    } finally {
      setProvisioning(false);
    }
  }

  if (loading && !overview) {
    return (
      <main className="admin-state">
        <span className="loading-mark"><AppLogo size={70} alt="" priority /></span>
        <p>در حال آماده‌سازی داشبورد</p>
      </main>
    );
  }

  if (error && !overview) {
    return (
      <main className="admin-state">
        <span className="admin-lock"><CircleX aria-hidden="true" /></span>
        <h1>دسترسی به داشبورد ممکن نیست</h1>
        <p>{error}</p>
        <a className="secondary-button" href="/">بازگشت به دفتر مچ</a>
      </main>
    );
  }

  if (!overview) return null;

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <div className="admin-brand">
          <AppLogo size={64} priority />
          <div>
            <p className="week-kicker">SUPER ADMIN</p>
            <h1>مرکز مدیریت Dota2 Notes</h1>
          </div>
        </div>
        <div className="admin-top-actions">
          <span className="queue-live-dot">داده زنده</span>
          <a className="secondary-button" href="/"><ArrowRight aria-hidden="true" /> بازگشت به دفتر</a>
        </div>
      </header>

      <section className="admin-metrics" aria-label="آمار اصلی">
        <Metric label="کل کاربران" value={number.format(overview.counts.users)} note={`${number.format(overview.counts.newUsersToday)} عضو امروز`} />
        <Metric label="مچ‌های تحلیل‌شده" value={number.format(overview.counts.journalMatches)} note={`${number.format(overview.counts.analyzedMatchesToday)} مچ امروز`} tone="green" />
        <Metric label="نشست‌های فعال" value={number.format(overview.counts.activeSessions)} note={`${number.format(overview.counts.usersWithLogin)} کاربر واردشده`} />
        <Metric label="تصاویر تولیدشده" value={number.format(overview.counts.generatedImages)} note={bytes(overview.counts.generatedImageBytes)} tone="gold" />
      </section>

      <section className="admin-section analytics-section">
        <header className="admin-section-header">
          <div><p className="week-kicker">ANALYTICS</p><h2>روند فعالیت سرویس</h2></div>
          <div className="range-switch" aria-label="بازه گزارش">
            {([7, 30, 90] as RangeDays[]).map((days) => (
              <button className={range === days ? "is-active" : ""} type="button" key={days} onClick={() => setRange(days)}>
                {number.format(days)} روز
              </button>
            ))}
          </div>
        </header>
        <div className="analytics-grid">
          <BarChart title="مچ‌های تحلیل‌شده" data={overview.analytics.daily.map((row) => ({ day: row.day, value: row.analyzedMatches }))} tone="green" />
          <BarChart title="درخواست‌های OpenDota" data={overview.analytics.daily.map((row) => ({ day: row.day, value: row.openDotaRequests }))} tone="blue" />
          <BarChart title="ثبت‌نام کاربران" data={overview.analytics.daily.map((row) => ({ day: row.day, value: row.newUsers }))} tone="gold" />
        </div>
      </section>

      <div className="admin-two-column">
        <section className="admin-section">
          <header className="admin-section-header"><div><p className="week-kicker">API USAGE</p><h2>ظرفیت OpenDota</h2></div></header>
          <div className="quota-list">
            {overview.openDotaUsage.map((usage) => (
              <article className="quota-card" key={usage.key}>
                <div><strong>{usage.key.endsWith("minute") ? "سهمیه دقیقه" : "سهمیه روز"}</strong><span>{number.format(usage.used)} از {number.format(usage.limit)}</span></div>
                <div className="quota-track"><span style={{ width: `${usage.percent}%` }} /></div>
                <footer><span>{number.format(usage.remaining)} باقی‌مانده</span><b>{number.format(Math.round(usage.percent))}٪ مصرف</b></footer>
              </article>
            ))}
          </div>
        </section>

        <section className="admin-section">
          <header className="admin-section-header"><div><p className="week-kicker">IMAGE QUEUE</p><h2>صف ساخت تصاویر</h2></div></header>
          <div className="queue-metrics">
            <QueueMetric label="در صف" value={overview.imageJobs.pending} status="pending" />
            <QueueMetric label="در حال ساخت" value={overview.imageJobs.processing} status="processing" />
            <QueueMetric label="تکمیل" value={overview.imageJobs.completed} status="completed" />
            <QueueMetric label="ناموفق" value={overview.imageJobs.failed} status="failed" />
          </div>
          <div className="admin-job-list">
            {overview.recentImageJobs.slice(0, 8).map((job) => (
              <article key={job.id}>
                <span className={`job-status-dot is-${job.status}`} />
                <div><strong lang="en" dir="ltr">{job.heroName}</strong><span lang="en" dir="ltr">{job.userHandle} · #{job.dotaMatchId || "—"}</span></div>
                <span>{job.status === "pending" ? "در صف" : job.status === "processing" ? "در حال ساخت" : job.status === "completed" ? "آماده" : job.errorCode || "خطا"}</span>
              </article>
            ))}
          </div>
        </section>
      </div>

      <section className="admin-section users-section">
        <header className="admin-section-header">
          <div><p className="week-kicker">USERS</p><h2>مدیریت کاربران</h2></div>
          <strong>{number.format(totalUsers)} نتیجه</strong>
        </header>
        <div className="user-admin-tools">
          <form className="admin-search" onSubmit={(event) => { event.preventDefault(); setOffset(0); setAppliedQuery(query.trim()); }}>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="جستجو نام، Handle یا Steam ID" />
            <button className="secondary-button" type="submit"><Search aria-hidden="true" /> جستجو</button>
          </form>
          <form className="provision-form" onSubmit={provision}>
            <input lang="en" dir="ltr" value={steamIdentifier} onChange={(event) => setSteamIdentifier(event.target.value)} placeholder="SteamID64 یا Account ID" required />
            <button className="primary-button" type="submit" disabled={provisioning}><UserPlus aria-hidden="true" /> {provisioning ? "در حال دریافت" : "افزودن کاربر"}</button>
          </form>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-users-table">
            <thead><tr><th>کاربر</th><th>Steam Account</th><th>عضویت</th><th>آخرین Sync</th><th>دسترسی</th><th>رمز عبور</th></tr></thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td><div className="admin-user-cell">{user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : <span /> }<div><strong>{user.displayName}</strong><b lang="en" dir="ltr">{user.handle}</b></div></div></td>
                  <td lang="en" dir="ltr">{user.steamAccountId}</td>
                  <td>{dateTime.format(new Date(user.createdAt))}</td>
                  <td>{user.lastManualSyncAt ? dateTime.format(new Date(user.lastManualSyncAt)) : "—"}</td>
                  <td>{user.isSuperAdmin ? <span className="access-chip is-super">Super Admin</span> : user.isAdmin ? <span className="access-chip">Admin</span> : <span className="access-chip is-user">User</span>}</td>
                  <td><button className={`password-admin-button${user.hasPassword ? " is-active" : ""}`} type="button" onClick={() => setPasswordUser(user)}><KeyRound aria-hidden="true" /> {user.hasPassword ? "تغییر" : "تعیین رمز"}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer className="admin-pagination">
          <button className="secondary-button" type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 25))}><ArrowRight aria-hidden="true" /> صفحه قبل</button>
          <span>{number.format(offset + 1)} تا {number.format(Math.min(offset + 25, totalUsers))}</span>
          <button className="secondary-button" type="button" disabled={offset + 25 >= totalUsers} onClick={() => setOffset(offset + 25)}>صفحه بعد <ArrowLeft aria-hidden="true" /></button>
        </footer>
      </section>
      <AdminReleaseNotes />
      <AdminPasswordDialog
        user={passwordUser}
        onClose={() => setPasswordUser(null)}
        onChange={(userId, hasPassword) => {
          setUsers((current) => current.map((user) => user.id === userId ? { ...user, hasPassword } : user));
        }}
      />
    </main>
  );
}

function Metric({ label, value, note, tone = "" }: { label: string; value: string; note: string; tone?: string }) {
  return <article className={`admin-metric ${tone}`}><span>{label}</span><strong>{value}</strong><p>{note}</p></article>;
}

function QueueMetric({ label, value, status }: { label: string; value: number; status: JobStatus }) {
  return <article className={`queue-metric is-${status}`}><span>{label}</span><strong>{number.format(value)}</strong></article>;
}

function BarChart({ title, data, tone }: { title: string; data: Array<{ day: string; value: number }>; tone: string }) {
  const max = Math.max(1, ...data.map((item) => item.value));
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const visible = data.length > 30 ? data.filter((_, index) => index % 3 === 0 || index === data.length - 1) : data;
  return (
    <article className={`bar-chart is-${tone}`}>
      <header><span>{title}</span><strong>{compactNumber.format(total)}</strong></header>
      <div className="bar-chart-plot">
        {visible.map((item) => (
          <div className="bar-column" key={item.day} title={`${item.day}: ${item.value}`}>
            <span style={{ height: `${Math.max(item.value ? 8 : 2, (item.value / max) * 100)}%` }} />
            {(visible.length <= 10 || item === visible[0] || item === visible[visible.length - 1]) && <b>{date.format(new Date(`${item.day}T00:00:00Z`))}</b>}
          </div>
        ))}
      </div>
    </article>
  );
}
