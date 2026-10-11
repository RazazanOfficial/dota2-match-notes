import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { isIP } from "node:net";
import { StratzError } from "./errors";

const HEADER_LIMIT = 32 * 1024;

export async function checkStratzCurlAvailable() {
  const { stdout } = await promisify(execFile)("curl", ["--disable", "--version"], {
    timeout: 3000, maxBuffer: HEADER_LIMIT, windowsHide: true,
  });
  if (!/^curl \d/.test(stdout) || !/Protocols:.*\bhttps\b/.test(stdout)) throw new Error("STRATZ curl HTTPS transport unavailable");
}

export function parseCurlResponse(buffer: Buffer, maxResponseBytes: number): Response {
  let offset = 0;
  let status = 0;
  const headers = new Headers();
  for (let blocks = 0; blocks < 5; blocks++) {
    const end = buffer.indexOf("\r\n\r\n", offset);
    if (end < 0 || end + 4 > HEADER_LIMIT) throw new Error("Invalid STRATZ HTTP headers");
    const lines = buffer.subarray(offset, end).toString("latin1").split("\r\n");
    const match = lines[0].match(/^HTTP\/\d(?:\.\d)? (\d{3})(?: |$)/);
    if (!match) throw new Error("Invalid STRATZ HTTP status");
    status = Number(match[1]);
    offset = end + 4;
    if (status < 200) continue;
    for (const line of lines.slice(1)) {
      const at = line.indexOf(":");
      if (at > 0) headers.append(line.slice(0, at), line.slice(at + 1).trim());
    }
    break;
  }
  if (status < 200 || status > 599) throw new Error("Invalid STRATZ HTTP status");
  const body = buffer.subarray(offset);
  if (body.length > maxResponseBytes) throw new StratzError(502, "stratz_response_too_large", "حجم پاسخ STRATZ بیش از حد مجاز است");
  // --compressed has already decoded the body; wire length/encoding no longer apply.
  headers.delete("content-encoding");
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  return new Response([204, 205, 304].includes(status) ? null : new Uint8Array(body), { status, headers });
}

export async function fetchWithCurlDirectIp(endpoint: string, init: RequestInit, directIp: string, maxResponseBytes: number) {
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || isIP(directIp) !== 4 || typeof init.body !== "string" || init.method !== "POST") throw new Error("Invalid STRATZ curl request");
  if (init.signal?.aborted) throw new DOMException("Request aborted", "AbortError");
  const headers = new Headers(init.headers);
  headers.delete("host");
  headers.delete("content-length");
  headers.set("Accept-Encoding", "gzip");
  // Credentials and query go through a private pipe, never argv, a shell or a file.
  const config = [
    `url = ${JSON.stringify(url.toString())}`,
    `resolve = ${JSON.stringify(`${url.hostname}:${url.port || 443}:${directIp}`)}`,
    ...Array.from(headers, ([name, value]) => `header = ${JSON.stringify(`${name}: ${value}`)}`),
    `data-binary = ${JSON.stringify(init.body)}`,
  ].join("\n") + "\n";
  return new Promise<Response>((resolve, reject) => {
    const started = Date.now();
    const child = spawn("curl", ["--disable", "--config", "-", "--http1.1", "--noproxy", "*", "--ipv4", "--proto", "=https", "--compressed", "--connect-timeout", "5", "--max-time", "30", "--silent", "--show-error", "--dump-header", "-"], {
      stdio: ["pipe", "pipe", "pipe"], windowsHide: true,
      env: { ...process.env, STRATZ_API_TOKEN: "" },
    });
    const chunks: Buffer[] = [];
    let receivedBytes = 0;
    let failure: Error | undefined;
    let spawnFailed = false;
    const abort = () => { failure ||= new DOMException("Request aborted", "AbortError"); child.kill("SIGKILL"); };
    const timer = setTimeout(abort, 31_000);
    init.signal?.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (chunk: Buffer) => {
      receivedBytes += chunk.length;
      if (receivedBytes > maxResponseBytes + HEADER_LIMIT) {
        failure ||= new StratzError(502, "stratz_response_too_large", "حجم پاسخ STRATZ بیش از حد مجاز است");
        child.kill("SIGKILL");
      } else if (!failure) chunks.push(chunk);
    });
    // Drain but never print provider/curl stderr: it can contain sensitive request context.
    child.stderr.resume();
    child.stdin.on("error", () => {});
    child.once("error", () => { spawnFailed = true; });
    child.once("close", code => {
      clearTimeout(timer);
      init.signal?.removeEventListener("abort", abort);
      const details = { transport: "curl" as const, elapsedMs: Date.now() - started, receivedBytes,
        ...(typeof code === "number" ? { curlExitCode: code } : {}) };
      if (failure) { reject(failure); return; }
      if (spawnFailed) { reject(new StratzError(503, "stratz_transport_unavailable", "ابزار اتصال STRATZ روی سرور در دسترس نیست", undefined, details)); return; }
      if (code !== 0) {
        reject(new StratzError(code === 28 ? 504 : 502, code === 28 ? "stratz_timeout" : "stratz_unavailable", "دریافت پاسخ کامل STRATZ انجام نشد", undefined, details));
        return;
      }
      try { resolve(parseCurlResponse(Buffer.concat(chunks), maxResponseBytes)); }
      catch (error) { reject(error); }
    });
    child.stdin.end(config);
    // An abort between the initial guard and subscription must also stop the subprocess.
    if (init.signal?.aborted) abort();
  });
}
