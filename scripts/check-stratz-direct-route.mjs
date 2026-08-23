import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

const endpoint = new URL(process.env.STRATZ_API_URL || "https://api.stratz.com/graphql");
const address = (process.env.STRATZ_DIRECT_IP || process.argv[2] || "").trim();
if (isIP(address) !== 4) {
  console.error("Provide STRATZ_DIRECT_IP or pass one IPv4 address as the command argument.");
  process.exit(64);
}

function traceThrough(address) {
  return new Promise((resolve, reject) => {
    const request = httpsRequest({
      protocol: "https:",
      hostname: address,
      port: 443,
      path: "/cdn-cgi/trace",
      method: "GET",
      headers: { Host: endpoint.hostname, "User-Agent": "STRATZ_API" },
      servername: endpoint.hostname,
      rejectUnauthorized: true,
      agent: false,
      timeout: 6_000,
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.once("error", reject);
      response.once("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        const observedIp = body.match(/^ip=(.+)$/m)?.[1]?.trim();
        if (response.statusCode !== 200 || !observedIp) {
          reject(new Error(`Trace failed through ${address}: HTTP ${response.statusCode || 0}`));
          return;
        }
        resolve(observedIp);
      });
    });
    request.once("timeout", () => request.destroy(new Error("Trace request timed out")));
    request.once("error", reject);
    request.end();
  });
}

console.log(`Pinned STRATZ destination IP: ${address}`);
const observedIp = await traceThrough(address);
console.log(`Connected destination: ${address}`);
console.log(`Observed direct egress IP: ${observedIp}`);
