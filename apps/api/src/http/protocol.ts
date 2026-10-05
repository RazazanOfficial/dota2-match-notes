import { parse, serialize, type SerializeOptions } from "cookie";

/** Framework-neutral request; Express owns transport and connection lifetime. */
export class HttpRequest extends Request {
  readonly parsedUrl: URL;
  readonly cookies: { get(name: string): { name: string; value: string } | undefined };
  readonly clientIp: string;
  constructor(input: string | URL | Request, init?: RequestInit, clientIp = "unknown") {
    super(input, init);
    this.parsedUrl = new URL(this.url);
    this.clientIp = clientIp;
    const values = parse(this.headers.get("cookie") || "");
    this.cookies = { get: name => values[name] === undefined ? undefined : { name, value: values[name]! } };
  }
}

/** Standard Response with explicit cookies; no Next.js runtime. */
export class HttpResponse extends Response {
  readonly cookies = { set: (name: string, value: string, options: SerializeOptions = {}) => {
    this.headers.append("set-cookie", serialize(name, value, options));
  } };
  static override json(body: unknown, init?: ResponseInit): HttpResponse {
    const response = Response.json(body, init);
    return new HttpResponse(response.body, response);
  }
  static override redirect(url: string | URL, status = 307): HttpResponse {
    return new HttpResponse(null, { status, headers: { location: String(url) } });
  }
}
export type HttpHandler = (request: HttpRequest, context: { params: Promise<Record<string, string>> }) => Response | Promise<Response>;
