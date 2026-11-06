import { describe, expect, it } from "vitest";
import { getNodeRole, requireComputeNode, getTopology, validateDatabaseTopology, isComputeRoute, isInternalPath, validComputeToken } from "../src/runtime/topology";
const token = "a".repeat(43);
describe("node boundaries", () => {
  it("preserves standalone installations", () => { expect(getNodeRole({})).toBe("standalone"); expect(getTopology({}).role).toBe("standalone"); expect(() => requireComputeNode({})).not.toThrow(); });
  it("rejects invalid roles and missing bridge credentials", () => { expect(() => getNodeRole({DOTA_NODE_ROLE:"iran"})).toThrow(); expect(() => getTopology({DOTA_NODE_ROLE:"app"})).toThrow(); expect(() => requireComputeNode({DOTA_NODE_ROLE:"app"})).toThrow(); });
  it("uses only fixed loopback forwarding, with no userinfo or path", () => {
    expect(getTopology({DOTA_NODE_ROLE:"app",DOTA_COMPUTE_TOKEN:token}).computeOrigin).toBe("http://127.0.0.1:14100");
    for(const url of ["https://foreign.test","http://127.0.0.1:14100/path","http://u:secret@127.0.0.1:14100","http://127.0.0.1:14100/?x=1","http://localhost:14100","invalid-private-secret"]) expect(() => getTopology({DOTA_NODE_ROLE:"app",DOTA_COMPUTE_TOKEN:token,DOTA_COMPUTE_ORIGIN:url})).toThrow("DOTA_COMPUTE_ORIGIN");
  });
  it("keeps database access private and rejects the wrong node port without exposing credentials", () => {
    expect(() => validateDatabaseTopology("postgres://u:secret@127.0.0.1:15432/db",{DOTA_NODE_ROLE:"compute"})).not.toThrow();
    expect(() => validateDatabaseTopology("postgres://u:secret@127.0.0.1:5432/db",{DOTA_NODE_ROLE:"app"})).not.toThrow();
    for(const url of ["postgres://u:secret@public.test/db","postgres://u:secret@127.0.0.1:5432/db","invalid-private-secret"]) {
      expect(() => validateDatabaseTopology(url,{DOTA_NODE_ROLE:"compute"})).toThrow();
      try { validateDatabaseTopology(url,{DOTA_NODE_ROLE:"compute"}); throw new Error("test should reject"); } catch(e) { expect(String(e)).not.toContain("private-secret");expect(String(e)).not.toContain("u:secret"); }
    }
  });
  it("authenticates the bridge independently of the user token", () => { expect(validComputeToken(token,token)).toBe(true); expect(validComputeToken("wrong",token)).toBe(false); expect(validComputeToken(undefined,token)).toBe(false); });
});
describe("route ownership", () => {
  it.each(["/api/auth/session","/api/tasks","/api/matches/me","/api/sync/me","/api/replays/9070494281","/api/replays/9070494281/download","/api/journal/matches/uuid/page","/api/admin/overview"])("reads %s locally",p => expect(isComputeRoute("GET",p)).toBe(false));
  it("submits jobs and logs out locally", () => { for(const p of ["/api/sync/me","/api/replays/9070494281","/api/matches/uuid/replay","/api/matches/uuid/analysis","/api/auth/logout"])expect(isComputeRoute("POST",p)).toBe(false); });
  it.each([["POST","/api/auth/email/start"],["POST","/api/v1/replays/lookup"],["GET","/api/auth/steam/callback"],["GET","/api/auth/desktop/start"],["POST","/api/admin/users"],["GET","/api/admin/replay-archive"],["POST","/api/admin/users/uuid/matches/reprocess"],["POST","/api/matches/uuid/opendota"],["PUT","/api/auth/password/me"],["DELETE","/api/admin/users/uuid/password"],["GET","/api/admin/replay-monitor"],["GET","/api/admin/service-monitor"]])("executes %s %s on compute",(m,p)=>expect(isComputeRoute(m,p)).toBe(true));
  it("covers versioning, case and trailing slash aliases",()=>{expect(isComputeRoute("POST","/API/V1/Auth/Email/Start/")).toBe(true);expect(isInternalPath("/API/V1/INTERNAL/sync/tick")).toBe(true);expect(isInternalPath("/api/internal-other")).toBe(false);});
});
