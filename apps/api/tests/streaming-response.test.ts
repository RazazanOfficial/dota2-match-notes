import express from "express";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { expressHandler } from "../src/http/express-handler";
describe("replay streaming through Express", () => {
  it("streams a binary response without converting it to JSON", async () => {
    const app=express();
    app.get("/file",expressHandler(async()=>new Response(new Uint8Array([0,1,2,255]), {headers:{"Content-Type":"application/octet-stream","Content-Length":"4","Content-Disposition":"attachment; filename=9008411473.dem.bz2"}}),"https://dota.example"));
    const result=await request(app).get("/file");
    expect(result.status).toBe(200);expect([...result.body]).toEqual([0,1,2,255]);expect(result.headers["content-length"]).toBe("4");
  });
  it("cancels the upstream stream when the client disconnects", async () => {
    let cancelled=false;let aborted=false;
    const app=express();
    app.get("/file",expressHandler(async incoming=>{
      incoming.signal.addEventListener("abort",()=>{aborted=true;});
      let stopped=false;
      const stream=new ReadableStream({async pull(controller){
        await new Promise(resolve=>setTimeout(resolve,5));
        if(!stopped)controller.enqueue(new Uint8Array(8192));
      },cancel(){stopped=true;cancelled=true;}});
      return new Response(stream,{headers:{"Content-Type":"application/octet-stream"}});
    },"https://dota.example"));
    const server=app.listen(0,"127.0.0.1");
    try {
      await new Promise<void>(resolve=>server.once("listening",resolve));
      const address=server.address();if(!address||typeof address==="string")throw new Error("Missing address");
      const response=await fetch(`http://127.0.0.1:${address.port}/file`);const reader=response.body!.getReader();
      await reader.read();await reader.cancel();
      for(let i=0;i<100&&!cancelled;i++)await new Promise(resolve=>setTimeout(resolve,5));
      expect(cancelled).toBe(true);expect(aborted).toBe(true);
    } finally { server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve())); }
  });
});
