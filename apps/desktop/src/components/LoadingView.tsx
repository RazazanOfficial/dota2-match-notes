import type { Messages } from "../i18n";
export function LoadingView({ t, full = false, session = false }: { t: Messages; full?: boolean; session?: boolean }) {
    return <div className={`loading-view ${full ? "loading-full" : ""}`} role="status" aria-live="polite" aria-busy="true">
        <div className="loading-orbit" aria-hidden="true"><i/><i/><span/></div>
        <strong>{session ? t.restoringSession : t.loading}</strong>
    </div>;
}
