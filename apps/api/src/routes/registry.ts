import * as playerPage from "./players/[identifier]/route";
import * as matchPage from "./journal/matches/[matchId]/page/route";
import * as r0 from "./admin/monthly-references/route";
import * as r1 from "./admin/overview/route";
import * as r2 from "./admin/releases/[releaseId]/route";
import * as r3 from "./admin/releases/route";
import * as r4 from "./admin/replay-archive/route";
import * as r5 from "./admin/replay-monitor/route";
import * as r6 from "./admin/service-monitor/route";
import * as r7 from "./admin/stratz-diagnostics/route";
import * as r8 from "./admin/users/[userId]/matches/reprocess/route";
import * as r9 from "./admin/users/[userId]/password/route";
import * as r10 from "./admin/users/route";
import * as r11 from "./auth/logout/route";
import * as r12 from "./auth/password/login/route";
import * as r13 from "./auth/password/me/route";
import * as r14 from "./auth/session/route";
import * as r15 from "./auth/steam/callback/route";
import * as r16 from "./auth/steam/route";
import * as r17 from "./health/route";
import * as r18 from "./hero-pool/me/route";
import * as r19 from "./internal/images/tick/route";
import * as r20 from "./internal/opendota-parse/tick/route";
import * as r21 from "./internal/performance-reference/tick/route";
import * as r22 from "./internal/stratz/tick/route";
import * as r23 from "./internal/sync/tick/route";
import * as r24 from "./journal/days/[date]/route";
import * as r25 from "./journal/me/route";
import * as r26 from "./journal/users/[handle]/route";
import * as r27 from "./matches/[matchId]/analysis/route";
import * as r28 from "./matches/[matchId]/images/route";
import * as r29 from "./matches/[matchId]/opendota/route";
import * as r30 from "./matches/[matchId]/replay/route";
import * as r31 from "./releases/[releaseId]/read/route";
import * as r32 from "./releases/route";
import * as r33 from "./replays/[matchId]/analysis/route";
import * as r34 from "./replays/[matchId]/file/route";
import * as r35 from "./replays/[matchId]/route";
import * as r36 from "./replays/lookup/route";
import * as r37 from "./sync/me/route";
import * as r38 from "./users/search/route";
import * as desktopStart from "./auth/desktop/start/route";
import * as desktopExchange from "./auth/desktop/exchange/route";
import * as desktopMatches from "./matches/me/route";
import * as signupPassword from "./auth/signup/password/route";
import * as emailStart from "./auth/email/start/route";
import * as emailVerify from "./auth/email/verify/route";
import * as recoveryRequest from "./auth/recovery/request/route";
import * as recoveryReset from "./auth/recovery/reset/route";
import * as signupComplete from "./auth/signup/complete/route";
import * as signupCodesReissue from "./auth/signup/codes/reissue/route";
import * as signupCodesSaved from "./auth/signup/codes/saved/route";

export const routes = [
  { path: "/players/:identifier", method: "GET", handler: playerPage.GET },
  { path: "/journal/matches/:matchId/page", method: "GET", handler: matchPage.GET },
  { path: "/admin/monthly-references", method: "GET", handler: r0.GET },
  { path: "/admin/monthly-references", method: "POST", handler: r0.POST },
  { path: "/admin/overview", method: "GET", handler: r1.GET },
  { path: "/admin/releases/:releaseId", method: "PUT", handler: r2.PUT },
  { path: "/admin/releases", method: "GET", handler: r3.GET },
  { path: "/admin/releases", method: "POST", handler: r3.POST },
  { path: "/admin/replay-archive", method: "GET", handler: r4.GET },
  { path: "/admin/replay-archive", method: "POST", handler: r4.POST },
  { path: "/admin/replay-monitor", method: "GET", handler: r5.GET },
  { path: "/admin/service-monitor", method: "GET", handler: r6.GET },
  { path: "/admin/stratz-diagnostics", method: "GET", handler: r7.GET },
  { path: "/admin/users/:userId/matches/reprocess", method: "POST", handler: r8.POST },
  { path: "/admin/users/:userId/password", method: "PUT", handler: r9.PUT },
  { path: "/admin/users/:userId/password", method: "DELETE", handler: r9.DELETE },
  { path: "/admin/users", method: "GET", handler: r10.GET },
  { path: "/admin/users", method: "POST", handler: r10.POST },
  { path: "/auth/logout", method: "POST", handler: r11.POST },
  { path: "/auth/password/login", method: "POST", handler: r12.POST },
  { path: "/auth/password/me", method: "PUT", handler: r13.PUT },
  { path: "/auth/password/me", method: "DELETE", handler: r13.DELETE },
  { path: "/auth/session", method: "GET", handler: r14.GET },
  { path: "/auth/steam/callback", method: "GET", handler: r15.GET },
  { path: "/auth/steam", method: "GET", handler: r16.GET },
  { path: "/auth/desktop/start", method: "GET", handler: desktopStart.GET },
  { path: "/auth/desktop/exchange", method: "POST", handler: desktopExchange.POST },
  { path: "/auth/signup/password", method: "POST", handler: signupPassword.POST },
  { path: "/auth/signup/complete", method: "POST", handler: signupComplete.POST },
  { path: "/auth/signup/codes/reissue", method: "POST", handler: signupCodesReissue.POST },
  { path: "/auth/signup/codes/saved", method: "POST", handler: signupCodesSaved.POST },
  { path: "/auth/email/start", method: "POST", handler: emailStart.POST },
  { path: "/auth/email/verify", method: "POST", handler: emailVerify.POST },
  { path: "/auth/recovery/request", method: "POST", handler: recoveryRequest.POST },
  { path: "/auth/recovery/reset", method: "POST", handler: recoveryReset.POST },
  { path: "/matches/me", method: "GET", handler: desktopMatches.GET },
  { path: "/health", method: "GET", handler: r17.GET },
  { path: "/hero-pool/me", method: "GET", handler: r18.GET },
  { path: "/hero-pool/me", method: "PUT", handler: r18.PUT },
  { path: "/internal/images/tick", method: "POST", handler: r19.POST },
  { path: "/internal/opendota-parse/tick", method: "POST", handler: r20.POST },
  { path: "/internal/performance-reference/tick", method: "POST", handler: r21.POST },
  { path: "/internal/stratz/tick", method: "POST", handler: r22.POST },
  { path: "/internal/sync/tick", method: "POST", handler: r23.POST },
  { path: "/journal/days/:date", method: "PUT", handler: r24.PUT },
  { path: "/journal/me", method: "GET", handler: r25.GET },
  { path: "/journal/users/:handle", method: "GET", handler: r26.GET },
  { path: "/matches/:matchId/analysis", method: "GET", handler: r27.GET },
  { path: "/matches/:matchId/analysis", method: "POST", handler: r27.POST },
  { path: "/matches/:matchId/images", method: "GET", handler: r28.GET },
  { path: "/matches/:matchId/opendota", method: "POST", handler: r29.POST },
  { path: "/matches/:matchId/replay", method: "POST", handler: r30.POST },
  { path: "/releases/:releaseId/read", method: "POST", handler: r31.POST },
  { path: "/releases", method: "GET", handler: r32.GET },
  { path: "/replays/:matchId/analysis", method: "GET", handler: r33.GET },
  { path: "/replays/:matchId/file", method: "GET", handler: r34.GET },
  { path: "/replays/:matchId", method: "GET", handler: r35.GET },
  { path: "/replays/:matchId", method: "POST", handler: r35.POST },
  { path: "/replays/lookup", method: "POST", handler: r36.POST },
  { path: "/sync/me", method: "GET", handler: r37.GET },
  { path: "/sync/me", method: "POST", handler: r37.POST },
  { path: "/users/search", method: "GET", handler: r38.GET },
] as const;
