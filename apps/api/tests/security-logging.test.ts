import { describe, expect, it, vi } from "vitest";
import { logFailure } from "../src/http/log";
describe("secret-free operational errors",()=>{
 it("omits raw errors, SQL parameters, stack traces and credentials",()=>{
  const logger=vi.spyOn(console,"error").mockImplementation(()=>{});
  try {
   const error=new Error("postgres://user:password@host; token=private-token");
   Object.assign(error,{params:["password-hash"],query:"sensitive SQL",key:"provider-secret"});
   logFailure("Replay failure",{matchId:9008411473,error});
   const text=JSON.stringify(logger.mock.calls);
   expect(text).toContain("9008411473");expect(text).toContain("Error");
   for(const secret of ["password","private-token","sensitive SQL","provider-secret"])expect(text).not.toContain(secret);
  } finally {logger.mockRestore();}
 });
});
