import {describe,expect,it} from "vitest";
import {MAX_METADATA_ATTEMPTS,MAX_NETWORK_ATTEMPTS,RETRY_WINDOW_MS,retryDecision} from "../scripts/replay-parser/replay-job-policy.mjs";
const now=Date.parse("2026-10-24T12:00:00Z");
const job={attempts:1,request_started_at:new Date(now),retry_deadline_at:new Date(now+20*86400000)};
describe("bounded automatic replay retries",()=>{
  it("stops the reported 111-check situation rather than extending it for twenty days",()=>{
    expect(retryDecision({code:"replay_metadata_rate_limited"},{...job,attempts:111},now)).toMatchObject({status:"failed",code:"replay_metadata_attempts_exhausted",delay:0});
  });
  it.each(["replay_metadata_pending","replay_metadata_rate_limited","replay_metadata_unavailable"])("bounds %s by count and progressively increases spacing",code=>{
    const first=retryDecision({code},job,now,()=>0),later=retryDecision({code},{...job,attempts:5},now,()=>0);
    expect(first.delay).toBe(600);expect(later.delay).toBeGreaterThan(first.delay);
    expect(retryDecision({code},{...job,attempts:MAX_METADATA_ATTEMPTS},now)).toMatchObject({status:"failed"});
  });
  it("respects provider Retry-After even when it exceeds the local first delay",()=>{
    expect(retryDecision({code:"replay_metadata_rate_limited",retryAfter:1800},job,now,()=>0).delay).toBe(1800);
  });
  it("bounds network failures and never retries permanent authorization failures",()=>{
    expect(retryDecision({code:"replay_connect_timeout"},{...job,attempts:MAX_NETWORK_ATTEMPTS},now)).toMatchObject({status:"failed",code:"replay_attempts_exhausted"});
    expect(retryDecision({code:"replay_proxy_auth_failed",retryable:false},job,now)).toMatchObject({status:"failed",code:"replay_proxy_auth_failed"});
  });
  it("also bounds old database jobs whose stored deadline was twenty days",()=>{
    expect(retryDecision({code:"replay_metadata_pending"},job,now+RETRY_WINDOW_MS)).toMatchObject({status:"failed",code:"replay_retry_exhausted"});
  });
});
