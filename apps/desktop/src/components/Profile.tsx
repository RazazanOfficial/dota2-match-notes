import type { Session } from "@/lib/types";
import { Check, CircleHelp, ShieldCheck, RefreshCw } from "lucide-react";
import { heroById, heroImage } from "@/data/heroes";
import { adminDate, adminNumber, adminText, useAccountRead, type AccountProfile } from "../admin";
import { durationText, filterHistory, SAMPLE_DATE, summarize } from "../history";
import type { Messages } from "../i18n";
import { Avatar, CopyValue } from "./Shared";
import { LoadingView } from "./LoadingView";
import { ErrorNotice } from "./ErrorNotice";

export function Profile({ session, t, live }: { session: Session; t: Messages; live: boolean }) {
  const read = useAccountRead<{ profile: AccountProfile }>("/api/profile/me", live);
  const sample = summarize(filterHistory("month", SAMPLE_DATE));
  const profile = read.data?.profile;
  const stats = profile?.stats || (!live ? { ...sample, analyzed: 0 } : null);
  return <div className="screen-stack profile-screen"><div className="page-heading"><h1>{adminText(t,"پروفایل من","My profile")}</h1>{live && <button className="secondary-button" disabled={read.busy} onClick={read.refresh}><RefreshCw size={16}/>{t.refresh}</button>}</div>
    {!!read.error && <ErrorNotice error={read.error} t={t}/>}
    <section className="panel account-identity"><Avatar session={session}/><div><h2><bdi>{profile?.user.displayName || session.displayName || session.username}</bdi></h2><span className="muted"><bdi>{profile?.user.handle || session.username}</bdi></span></div>{session.isSuperAdmin && <span className="account-access"><ShieldCheck size={17}/>{t.admin}</span>}</section>
    {live && read.busy && !profile && <LoadingView t={t}/>}
    <div className="account-grid"><section className="panel account-section"><h2>{adminText(t,"مشخصات حساب","Account details")}</h2><dl className="account-facts">
      <div><dt>{adminText(t,"آیدی اکانت استیم","Steam account ID")}</dt><dd>{(profile?.user.steamAccountId || session.steamAccountId) ? <CopyValue value={String(profile?.user.steamAccountId || session.steamAccountId)} t={t}/> : "—"}</dd></div>
      <div><dt>Steam ID</dt><dd>{session.steamId ? <CopyValue value={session.steamId} t={t}/> : "—"}</dd></div>
      <div><dt>{adminText(t,"تاریخ عضویت","Joined")}</dt><dd>{adminDate(profile?.user.createdAt || session.createdAt, t)}</dd></div>
      <div><dt>{adminText(t,"آخرین ورود","Last sign-in")}</dt><dd>{adminDate(profile?.user.lastLoginAt, t)}</dd></div>
      <div><dt>{adminText(t,"آخرین دریافت مچ","Last match request")}</dt><dd>{adminDate(profile?.user.lastManualSyncAt, t)}</dd></div>
    </dl></section><section className="panel account-section"><h2>{adminText(t,"امنیت حساب","Account security")}</h2><SecurityStatus label={adminText(t,"رمز ورود","Password")} value={profile?.user.hasPassword ?? session.hasPassword} t={t}/><SecurityStatus label={adminText(t,"ایمیل تأییدشده","Verified email")} value={profile?.user.hasVerifiedEmail ?? session.hasVerifiedEmail} t={t}/><SecurityStatus label={adminText(t,"کدهای بازیابی ذخیره‌شده","Recovery codes saved")} value={profile?.user.hasSavedRecoveryCodes ?? Boolean(session.recoveryCodesSavedAt)} t={t}/></section></div>
    {stats && <section className="account-stats" aria-label={adminText(t,"آمار کل حساب","Lifetime account statistics")}>{[[t.totalMatches,stats.total],[t.wins,stats.wins],[t.losses,stats.losses],[t.winRate,`${adminNumber(stats.winRate,t)}%`],[t.analysisDone,stats.analyzed]].map(([label,value])=><div className="panel" key={label}><span>{label}</span><strong>{typeof value === "number" ? adminNumber(value,t) : value}</strong></div>)}</section>}
    {profile && <ProfileRecent profile={profile} t={t}/>}
  </div>;
}
export function SecurityStatus({ label, value, t }: { label: string; value: boolean | undefined; t: Messages }) {
  return <div className={`security-status ${value ? "is-complete" : ""}`}><span>{label}</span><span>{value ? <Check size={16}/> : <CircleHelp size={16}/>} {value ? adminText(t,"تکمیل‌شده","Complete") : adminText(t,"تکمیل‌نشده","Not set")}</span></div>;
}
export function ProfileRecent({ profile, t }: { profile: AccountProfile; t: Messages }) {
  return <section className="panel account-section"><h2>{t.recent}</h2><div className="account-recent">{profile.recent.map((match,index)=>{
    const hero = heroById(match.heroId || 0);
    return <div key={match.matchId || index}>{hero && <img src={heroImage(hero)} alt={hero.name} width={52} height={30}/>}<span className={`result-pill ${match.result === "win" ? "win" : "loss"}`}>{match.result === "win" ? "W" : "L"}</span><span>{durationText(match.duration || 0)}</span><time>{adminDate(match.startedAt,t)}</time>{match.matchId && <CopyValue value={String(match.matchId)} t={t}/>}</div>;
  })}{!profile.recent.length && <p className="muted">{t.noData}</p>}</div></section>;
}
