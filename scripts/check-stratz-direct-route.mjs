import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

const endpoint = new URL(process.env.STRATZ_API_URL || "https://api.stratz.com/graphql");
const rawAddresses = process.env.STRATZ_DIRECT_IPS || process.argv.slice(2).join(",");
const addresses = [...new Set(rawAddresses.split(",").map((value) => value.trim()).filter(Boolean))];
if (!addresses.length || addresses.some((address) => isIP(address) !== 4)) {
  console.error("Provide STRATZ_DIRECT_IPS or pass comma-separated IPv4 addresses as the command argument.");
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

console.log(`Pinned STRATZ destination IPs: ${addresses.join(", ")}`);
const observed = new Set();
for (let index = 0; index < 20; index += 1) {
  const address = addresses[index % addresses.length];
  const observedIp = await traceThrough(address);
  observed.add(observedIp);
  console.log(`${index + 1} connected=${address} observed=${observedIp}`);
}
console.log(`Unique direct egress IPs: ${[...observed].join(", ")}`);
if (observed.size !== 1) process.exitCode = 2;
