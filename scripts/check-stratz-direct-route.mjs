import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

const endpoint = new URL(process.env.STRATZ_API_URL || "https://api.stratz.com/graphql");
const dnsOverHttpsUrl = new URL(
  process.env.STRATZ_DNS_OVER_HTTPS_URL || "https://dns.google/resolve",
);

dnsOverHttpsUrl.searchParams.set("name", endpoint.hostname);
dnsOverHttpsUrl.searchParams.set("type", "A");
dnsOverHttpsUrl.searchParams.set("edns_client_subnet", "0.0.0.0/0");

const dnsResponse = await fetch(dnsOverHttpsUrl, {
  headers: { Accept: "application/dns-json", "User-Agent": "Dota2Notes/1.0" },
});
if (!dnsResponse.ok) throw new Error(`DNS-over-HTTPS returned HTTP ${dnsResponse.status}`);
const dnsJson = await dnsResponse.json();
const addresses = [...new Set((dnsJson.Answer || [])
  .filter((answer) => answer?.type === 1 && isIP(String(answer.data || "")) === 4)
  .map((answer) => String(answer.data)))];
if (!addresses.length) throw new Error("No public IPv4 address was returned for STRATZ");

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
      timeout: 15_000,
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

console.log(`Resolved ${endpoint.hostname} directly to: ${addresses.join(", ")}`);
const observed = new Set();
for (let index = 0; index < 20; index += 1) {
  const address = addresses[index % addresses.length];
  const observedIp = await traceThrough(address);
  observed.add(observedIp);
  console.log(`${index + 1} connected=${address} observed=${observedIp}`);
}
console.log(`Unique direct egress IPs: ${[...observed].join(", ")}`);
if (observed.size !== 1) process.exitCode = 2;
