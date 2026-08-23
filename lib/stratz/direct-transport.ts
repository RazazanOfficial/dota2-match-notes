import { request as httpsRequest } from "node:https";
import { StratzError } from "./errors";

const DIRECT_CONNECT_TIMEOUT_MS = 5_000;

function headersToRecord(headers: Headers) {
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
      headers: headersToRecord(requestHeaders),
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
    request.setTimeout(DIRECT_CONNECT_TIMEOUT_MS, () => {
      request.destroy(new Error(`Direct STRATZ connection to ${address} timed out`));
    });
    request.once("error", reject);
    if (body) request.write(body);
    request.end();
  });
}

export async function fetchWithDirectIp(
  endpoint: string,
  init: RequestInit,
  directIp: string,
  maxResponseBytes: number,
) {
  const url = new URL(endpoint);
  return requestAddress(url, directIp, init, maxResponseBytes);
}
