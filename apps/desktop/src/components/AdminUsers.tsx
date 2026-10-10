import { useState } from "react";
import { Search, UserPlus, KeyRound, RefreshCw, ArrowUpRight, ShieldCheck } from "lucide-react";
import { apiRequest } from "../api";
import { adminDate, adminNumber, adminText, useAccountRead, type AdminUser, type AccountProfile } from "../admin";
import type { Messages } from "../i18n";
import { Avatar, CopyValue } from "./Shared";
import { PasswordField } from "./PasswordField";
import { ErrorNotice } from "./ErrorNotice";
import { ProfileRecent, SecurityStatus } from "./Profile";
import { AdminReadState, SuccessNotice, mutationResult, AdminModal as Modal } from "./AdminShared";

export function AdminUsers({ t }: { t: Messages }) {
  const [query,setQuery] = useState(""), [applied,setApplied] = useState(""), [offset,setOffset] = useState(0);
  const [steam,setSteam] = useState(""), [busy,setBusy] = useState(false), [error,setError] = useState<unknown>(null), [notice,setNotice] = useState("");
  const [inspect,setInspect] = useState<AdminUser|null>(null), [action,setAction] = useState<{user:AdminUser;kind:"password"|"reprocess"}|null>(null);
  const read = useAccountRead<{users:AdminUser[];total:number}>(`/api/admin/users?${new URLSearchParams({query:applied,limit:"25",offset:String(offset)})}`, true);
  async function provision() {
    setBusy(true); setError(null); setNotice("");
    try {
      const result = await apiRequest<{ created: boolean; user: AdminUser }>("/api/admin/users",{method:"POST",body:JSON.stringify({steamIdentifier:steam.trim()})});
      setSteam(""); setNotice(adminText(t,result.created ? "حساب کاربر ساخته شد." : "مشخصات کاربر به‌روز شد.",result.created ? "User account created." : "User profile updated.")); read.refresh();
    } catch(failure) { setError(failure); } finally { setBusy(false); }
  }
  return <div className="screen-stack"><section className="panel account-section"><div className="section-heading"><h2>{adminText(t,"مدیریت کاربران","User management")}</h2><button className="secondary-button" disabled={read.busy} onClick={read.refresh}><RefreshCw size={15}/>{t.refresh}</button></div>
    <div className="admin-user-tools"><form className="admin-inline-form" onSubmit={event=>{event.preventDefault();setOffset(0);setApplied(query.trim());}}><input aria-label={adminText(t,"جست‌وجوی کاربران","Search users")} placeholder={adminText(t,"نام، شناسه یا استیم","Name, handle or Steam ID")} maxLength={100} value={query} onChange={event=>setQuery(event.target.value)}/><button className="secondary-button" type="submit"><Search size={16}/>{t.search}</button></form>
    <form className="admin-inline-form" onSubmit={event=>{event.preventDefault();void provision();}}><input aria-label={adminText(t,"آیدی استیم کاربر جدید","New user's Steam ID")} dir="ltr" inputMode="numeric" maxLength={20} value={steam} onChange={event=>setSteam(event.target.value)} placeholder="Steam Account ID / SteamID64" required/><button className="primary-button" disabled={busy || !steam.trim()}><UserPlus size={16}/>{adminText(t,"افزودن کاربر","Add user")}</button></form></div>
    {!!error && <ErrorNotice error={error} t={t}/>}<SuccessNotice text={notice}/><AdminReadState error={read.error} busy={read.busy} hasData={!!read.data} t={t}/>
    {read.data && <><div className="admin-table-scroll"><table className="admin-data-table admin-users"><thead><tr><th>{t.player}</th><th>{adminText(t,"آیدی استیم","Steam account")}</th><th>{adminText(t,"عضویت","Joined")}</th><th>{adminText(t,"آخرین دریافت","Last sync")}</th><th>{adminText(t,"دسترسی","Access")}</th><th>{adminText(t,"عملیات","Actions")}</th></tr></thead><tbody>{read.data.users.map(user=><tr key={user.id}><td><button className="admin-user-link" onClick={()=>setInspect(user)}><Avatar session={{mode:"player",username:user.handle,displayName:user.displayName,avatarUrl:user.avatarUrl}}/><span><strong>{user.displayName}</strong><small><bdi>{user.handle}</bdi></small></span><ArrowUpRight size={16}/></button></td><td><CopyValue value={String(user.steamAccountId)} t={t}/></td><td>{adminDate(user.createdAt,t)}</td><td>{adminDate(user.lastManualSyncAt,t)}</td><td><span className="account-access">{user.isSuperAdmin && <ShieldCheck size={14}/>} {user.isSuperAdmin ? "Super Admin" : user.isAdmin ? "Admin" : adminText(t,"کاربر","Player")}</span></td><td><div className="admin-row-actions"><button className="secondary-button" onClick={()=>setAction({user,kind:"password"})}><KeyRound size={15}/>{adminText(t,"رمز عبور","Password")}</button><button className="secondary-button" onClick={()=>setAction({user,kind:"reprocess"})}><RefreshCw size={15}/>{adminText(t,"بازخوانی مچ‌ها","Refresh matches")}</button></div></td></tr>)}</tbody></table></div>
    {!read.data.users.length && <p className="empty-message">{t.noData}</p>}<div className="pagination"><button disabled={!offset || read.busy} onClick={()=>setOffset(value=>Math.max(0,value-25))}>{t.previous}</button><span>{adminNumber(read.data.total ? offset+1 : 0,t)} – {adminNumber(Math.min(offset+25,read.data.total),t)} / {adminNumber(read.data.total,t)}</span><button disabled={offset+25>=read.data.total || read.busy} onClick={()=>setOffset(value=>value+25)}>{t.next}</button></div></>}
    </section>{inspect && <AdminUserProfile user={inspect} t={t} onClose={()=>setInspect(null)}/>}{action && <UserAction key={`${action.user.id}:${action.kind}`} {...action} t={t} onClose={()=>setAction(null)} onSaved={read.refresh}/>}</div>;
}
function AdminUserProfile({ user,t,onClose }: {user:AdminUser;t:Messages;onClose:()=>void}) {
  const read = useAccountRead<{profile:AccountProfile}>(`/api/admin/users/${encodeURIComponent(user.id)}`,true);
  const p = read.data?.profile;
  return <Modal title={adminText(t,"پروفایل کاربر","User profile")} onClose={onClose} closeLabel={t.close} className="admin-profile-modal"><div className="account-identity"><Avatar session={{mode:"player",username:user.handle,displayName:user.displayName,avatarUrl:user.avatarUrl}}/><div><h2>{user.displayName}</h2><bdi>{user.handle}</bdi></div></div><AdminReadState error={read.error} busy={read.busy} hasData={!!p} t={t}/>{p && <>
    <dl className="account-facts"><div><dt>Steam ID</dt><dd><CopyValue value={p.user.steamId} t={t}/></dd></div><div><dt>{adminText(t,"آیدی اکانت استیم","Steam account ID")}</dt><dd><CopyValue value={String(p.user.steamAccountId)} t={t}/></dd></div>{[[adminText(t,"عضویت","Joined"),p.user.createdAt],[adminText(t,"آخرین ورود","Last login"),p.user.lastLoginAt],[adminText(t,"آخرین دریافت مچ","Last sync"),p.user.lastManualSyncAt],[adminText(t,"تکمیل ثبت‌نام","Setup completed"),p.user.onboardingCompletedAt]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{adminDate(value,t)}</dd></div>)}</dl>
    <SecurityStatus label={adminText(t,"رمز عبور","Password")} value={p.user.hasPassword} t={t}/><SecurityStatus label={adminText(t,"ایمیل تأییدشده","Verified email")} value={p.user.hasVerifiedEmail} t={t}/><SecurityStatus label={adminText(t,"کدهای بازیابی","Recovery codes")} value={p.user.hasSavedRecoveryCodes} t={t}/>
    <div className="account-stats">{[[t.totalMatches,p.stats.total],[t.wins,p.stats.wins],[t.losses,p.stats.losses],[t.winRate,`${p.stats.winRate.toFixed(1)}%`],[t.analysisDone,p.stats.analyzed]].map(([label,value])=><div className="panel" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><ProfileRecent profile={p} t={t}/></>}
  </Modal>;
}
function UserAction({ user,kind,t,onClose,onSaved }: {user:AdminUser;kind:"password"|"reprocess";t:Messages;onClose:()=>void;onSaved:()=>void}) {
  const [hasPassword,setHasPassword] = useState(user.hasPassword);
  const [password,setPassword] = useState(""), [confirm,setConfirm] = useState(""), [count,setCount] = useState(3), [ack,setAck] = useState(false);
  const [busy,setBusy] = useState(false), [error,setError] = useState<unknown>(null), [notice,setNotice] = useState("");
  const [outcome,setOutcome] = useState<{refreshed:{dotaMatchId:string}[];failed:{dotaMatchId:string;code:string}[]}|null>(null);
  const valid = password.length>=8 && new TextEncoder().encode(password).length<=72 && password === confirm;
  async function submit(remove = false) {
    setBusy(true); setError(null); setNotice("");
    try {
      const result = await apiRequest<{refreshed:{dotaMatchId:string}[];failed:{dotaMatchId:string;code:string}[]}>(`/api/admin/users/${encodeURIComponent(user.id)}/${kind === "password" ? "password" : "matches/reprocess"}`,{
        method:kind === "reprocess" ? "POST" : remove ? "DELETE" : "PUT",
        ...(remove ? {} : {body:JSON.stringify(kind === "password" ? {password,confirmPassword:confirm} : {count})}),
      }, kind === "reprocess" ? 180000 : 12000);
      setNotice(mutationResult(t)); if (kind === "reprocess") setOutcome(result);
      if (kind === "password") setHasPassword(!remove);
      setPassword(""); setConfirm(""); setAck(false); onSaved();
    } catch(failure) { setError(failure); } finally { setBusy(false); }
  }
  return <Modal title={`${kind === "password" ? adminText(t,"مدیریت رمز","Manage password") : adminText(t,"بازخوانی مچ‌ها","Refresh matches")} · ${user.displayName}`} onClose={()=>{if(!busy)onClose();}} closeLabel={t.close} className="admin-action-modal"><form className="admin-form" onSubmit={event=>{event.preventDefault();void submit();}}>
    {kind === "password" ? <><p className="muted">{adminText(t,"رمز جدید باید بین ۸ تا ۷۲ نویسه باشد. نشست‌های قبلی این حساب باطل می‌شوند.","Use 8–72 characters. Existing sessions for this account will be revoked.")}</p><label>{adminText(t,"رمز جدید","New password")}<PasswordField t={t} autoComplete="new-password" value={password} onChange={event=>setPassword(event.target.value)} maxLength={72}/></label><label>{adminText(t,"تکرار رمز","Confirm password")}<PasswordField t={t} autoComplete="new-password" value={confirm} onChange={event=>setConfirm(event.target.value)} maxLength={72}/></label></> : <><p className="muted">{adminText(t,"اطلاعات مچ‌های اخیر از OpenDota بازخوانی می‌شود؛ این کار پردازش دوبارهٔ فایل ریپلی نیست.","Refresh recent match data from OpenDota. This does not parse replay files again.")}</p><label>{adminText(t,"تعداد مچ‌ها","Number of matches")}<input type="number" min={1} max={20} value={count} onChange={event=>setCount(Number(event.target.value))}/></label></>}
    {!!error && <ErrorNotice error={error} t={t}/>}<SuccessNotice text={notice}/>{outcome && <div className="admin-event-list"><p>{adminText(t,"به‌روزشدند","Refreshed")}: {outcome.refreshed.length} · {adminText(t,"ناموفق","Failed")}: {outcome.failed.length}</p>{outcome.failed.map(item=><div key={item.dotaMatchId}><CopyValue value={item.dotaMatchId} t={t}/><code>{item.code}</code></div>)}</div>}
    <button className="primary-button" disabled={busy || (kind === "password" ? !valid : !Number.isInteger(count) || count<1 || count>20)}>{busy ? t.checking : t.save}</button>
    {kind === "password" && hasPassword && <div className="admin-danger-zone"><label className="admin-check"><input type="checkbox" checked={ack} onChange={event=>setAck(event.target.checked)}/>{adminText(t,"حذف رمز و غیرفعال‌شدن ورود با رمز را تأیید می‌کنم.","I confirm removing the password and disabling password sign-in.")}</label><button type="button" className="danger-button" disabled={busy || !ack} onClick={()=>void submit(true)}>{adminText(t,"حذف رمز","Remove password")}</button></div>}
  </form></Modal>;
}
