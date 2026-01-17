import { CookieJar } from "tough-cookie";
import fetchCookie from "fetch-cookie";

export class CoreEngine {
  private tunnelUrl: string;
  private fetchFn: Function;

  constructor(tunnelUrl: string) {
    this.tunnelUrl = tunnelUrl;
    const jar = new CookieJar();
    this.fetchFn = fetchCookie(globalThis.fetch, jar);
  }

  /**
   * Raw Fetch Wrapper with Retry & Tunnel Routing
   */
  public async fetch(
    targetUrl: string,
    options: RequestInit = {},
    retries = 2,
  ): Promise<Response> {
    const proxyUrl = new URL(this.tunnelUrl);
    proxyUrl.searchParams.append("target", targetUrl);

    // Default headers
    const headers = {
      ...options.headers,
    };

    const fetchOptions = {
      ...options,
      headers,
      signal: AbortSignal.timeout(20000), // 20s timeout
    };

    let lastError;
    for (let i = 0; i <= retries; i++) {
      try {
        const res = await this.fetchFn(proxyUrl.toString(), fetchOptions);
        if (res.status >= 500) throw new Error(`Tunnel Error: ${res.status}`);
        return res;
      } catch (e: any) {
        lastError = e;
        if (i < retries) await new Promise((r) => setTimeout(r, 1000));
      }
    }
    throw lastError || new Error("Fetch failed after retries");
  }

  /**
   * Helper to get HTML string directly
   */
  public async fetchHtml(
    url: string,
    params?: Record<string, string>,
    headers?: Record<string, string>,
  ): Promise<string> {
    // Construct Query Params
    let fetchUrl = url;
    if (params && Object.keys(params).length > 0) {
      const qs = new URLSearchParams(params).toString();
      fetchUrl += (url.includes("?") ? "&" : "?") + qs;
    }

    const res = await this.fetch(fetchUrl, { method: "GET", headers });

    if (!res.ok) {
      throw new Error(`Failed to fetch HTML: ${res.status}`);
    }

    return await res.text();
  }
}
