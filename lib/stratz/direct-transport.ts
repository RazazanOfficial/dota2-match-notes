import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { StratzError } from "./errors";

interface DnsJsonAnswer {
  data?: unknown;
  type?: unknown;
  TTL?: unknown;
}

interface DnsJsonResponse {
  Status?: unknown;
  Answer?: unknown;
}

interface CachedAddresses {
  addresses: string[];
  expiresAt: number;
}

const dnsCache = new Map<string, CachedAddresses>();
const MIN_DNS_TTL_SECONDS = 30;
const MAX_DNS_TTL_SECONDS = 300;

function isPublicIpv4(address: string) {
  if (isIP(address) !== 4) return false;
  const [a, b] = address.split(".").map(Number);
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 0) return false;
  if (a === 192 && b === 168) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a >= 224) return false;
  return true;
}

export function parseDnsJson(input: unknown) {
  if (!input || typeof input !== "object") return { addresses: [], ttlSeconds: MIN_DNS_TTL_SECONDS };
  const response = input as DnsJsonResponse;
  if (response.Status !== 0 || !Array.isArray(response.Answer)) {
    return { addresses: [], ttlSeconds: MIN_DNS_TTL_SECONDS };
  }

  const answers = response.Answer as DnsJsonAnswer[];
  const addresses = [...new Set(answers
    .filter((answer) => answer?.type === 1 && typeof answer.data === "string")
    .map((answer) => String(answer.data).trim())
    .filter(isPublicIpv4))];
  const ttls = answers
    .filter((answer) => answer?.type === 1 && typeof answer.TTL === "number")
    .map((answer) => Number(answer.TTL))
    .filter((ttl) => Number.isFinite(ttl) && ttl > 0);
  const ttlSeconds = Math.max(
    MIN_DNS_TTL_SECONDS,
    Math.min(MAX_DNS_TTL_SECONDS, ttls.length ? Math.min(...ttls) : MIN_DNS_TTL_SECONDS),
  );
  return { addresses, ttlSeconds };
}

async function resolveWithDnsOverHttps(
  hostname: string,
  dnsOverHttpsUrl: string,
  signal: AbortSignal,
) {
  const cacheKey = `${dnsOverHttpsUrl}|${hostname}`;
  const cached = dnsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.addresses;

  const url = new URL(dnsOverHttpsUrl);
  url.searchParams.set("name", hostname);
  url.searchParams.set("type", "A");
  url.searchParams.set("edns_client_subnet", "0.0.0.0/0");
  const response = await fetch(url, {
    headers: {
      Accept: "application/dns-json",
      "User-Agent": "Dota2Notes/1.0",
    },
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    throw new StratzError(502, "stratz_dns_unavailable", "نام سرور STRATZ از مسیر مستقیم پیدا نشد");
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new StratzError(502, "stratz_dns_unavailable", "پاسخ DNS مستقیم معتبر نبود");
  }
  const { addresses, ttlSeconds } = parseDnsJson(raw);
  if (!addresses.length) {
    throw new StratzError(502, "stratz_dns_unavailable", "DNS مستقیم هیچ IP عمومی برای STRATZ برنگرداند");
  }
  dnsCache.set(cacheKey, {
    addresses,
    expiresAt: Date.now() + ttlSeconds * 1_000,
  });
  return addresses;
}

function headersFromIncoming(headers: Headers) {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

function requestAddress(
  url: URL,
  address: string,
  init: RequestInit,
  maxResponseBytes: number,
) {
  return new Promise<Response>((resolve, reject) => {
    const body = typeof init.body === "string" ? Buffer.from(init.body) : undefined;
    const requestHeaders = new Headers(init.headers);
    requestHeaders.set("Host", url.host);
    if (body) requestHeaders.set("Content-Length", String(body.byteLength));

    const request = httpsRequest({
      protocol: "https:",
      hostname: address,
      port: url.port ? Number(url.port) : 443,
      path: `${url.pathname}${url.search}`,
      method: init.method || "GET",
      headers: headersFromIncoming(requestHeaders),
      servername: url.hostname,
      rejectUnauthorized: true,
      agent: false,
      signal: init.signal || undefined,
    }, (incoming) => {
      const chunks: Buffer[] = [];
      let total = 0;
      incoming.on("data", (chunk: Buffer) => {
        total += chunk.byteLength;
        if (total > maxResponseBytes) {
          incoming.destroy(new StratzError(
            502,
            "stratz_response_too_large",
            "حجم پاسخ STRATZ بیش از حد مجاز است",
          ));
          return;
        }
        chunks.push(chunk);
      });
      incoming.once("error", reject);
      incoming.once("end", () => {
        const responseHeaders = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) {
          if (Array.isArray(value)) value.forEach((entry) => responseHeaders.append(name, entry));
          else if (value !== undefined) responseHeaders.set(name, value);
        }
        resolve(new Response(Buffer.concat(chunks), {
          status: incoming.statusCode || 502,
          statusText: incoming.statusMessage,
          headers: responseHeaders,
        }));
      });
    });
    request.once("error", reject);
    if (body) request.write(body);
    request.end();
  });
}

export async function fetchWithDirectDns(
  endpoint: string,
  init: RequestInit,
  dnsOverHttpsUrl: string,
  maxResponseBytes: number,
) {
  const url = new URL(endpoint);
  const signal = init.signal;
  if (!signal) throw new Error("STRATZ direct transport requires an AbortSignal");
  const addresses = await resolveWithDnsOverHttps(url.hostname, dnsOverHttpsUrl, signal);

  let lastError: unknown;
  for (const address of addresses) {
    try {
      return await requestAddress(url, address, init, maxResponseBytes);
    } catch (error) {
      if (error instanceof StratzError) throw error;
      if (signal.aborted) throw error;
      lastError = error;
    }
  }
  throw lastError || new Error("No direct STRATZ address was reachable");
}
