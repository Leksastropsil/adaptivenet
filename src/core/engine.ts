import { CookieJar } from "tough-cookie";
import fetchCookie from "fetch-cookie";
import { IStore } from "../types/storage";

export class CoreEngine {
  private tunnelUrl: string;
  private fetchFn: Function;
  private store: IStore | null;

  constructor(tunnelUrl: string, store?: IStore) {
    this.tunnelUrl = tunnelUrl;
    this.store = store || null;
    const jar = new CookieJar();
    this.fetchFn = fetchCookie(globalThis.fetch, jar);
  }

  /**
   * Helper: Save Cookie/UA to Cache
   */
  private async saveCookie(domain: string, headers: any) {
    if (!this.store || !domain) return;
    try {
      const key = `COOKIE:${domain}`;
      // TTL 2 hours (7200 seconds)
      await this.store.put(key, JSON.stringify(headers), 7200);
      // console.log(`[SmartCache] Saved cookies for ${domain}`);
    } catch (e) {
      console.warn(`[SmartCache] Failed to save cookie for ${domain}`, e);
    }
  }

  /**
   * Helper: Get Cookie/UA from Cache
   */
  private async getCookie(
    domain: string,
  ): Promise<Record<string, string> | null> {
    if (!this.store || !domain) return null;
    try {
      const key = `COOKIE:${domain}`;
      const data = await this.store.get(key);
      if (!data) return null;
      return JSON.parse(data) as Record<string, string>;
    } catch {
      return null;
    }
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
    } as Record<string, string>;

    const fetchOptions = {
      ...options,
      headers,
      signal: AbortSignal.timeout(20000), // 20s timeout
    };

    // --- STEP 1: CHECK CACHE & TRY DIRECT FETCH (GOD MODE) ---
    let targetDomain = "";
    try {
      targetDomain = new URL(targetUrl).hostname;
    } catch {}

    if (this.store && targetDomain) {
      const cachedHeaders = await this.getCookie(targetDomain);
      if (cachedHeaders) {
        // console.log(`[SmartCache] Hit for ${targetDomain}, trying Direct Fetch...`);
        try {
          const directHeaders = { ...headers, ...cachedHeaders };
          const directRes = await globalThis.fetch(targetUrl, {
            ...options,
            headers: directHeaders,
            redirect: "follow", // Allow redirects for direct fetch
          });

          if (directRes.ok) {
            // console.log(`[SmartCache] Direct Fetch Success!`);
            return directRes;
          }
          // 403 / 401 ? -> Fallback
        } catch (e) {
          // Direct fetch failed, fallback to tunnel
        }
      }
    }

    // --- STEP 3: FALLBACK TO TUNNEL ---
    let lastError;
    for (let i = 0; i <= retries; i++) {
      try {
        const res = await this.fetchFn(proxyUrl.toString(), fetchOptions);

        // --- HYBRID RESPONSE HANDLER ---
        const contentType = res.headers.get("content-type") || "";

        // 1. STREAM PUMPING (Zero Latency for Video)
        if (
          contentType.includes("video/mp2t") ||
          contentType.includes("application/octet-stream")
        ) {
          return new Response(res.body, {
            status: res.status,
            statusText: res.statusText,
            headers: res.headers,
          });
        }

        // 2. JSON WRAPPER (For Playlists / Text)
        if (contentType.includes("application/json")) {
          // We clone to safeguard in case it's not our wrapper
          const clone = res.clone();
          try {
            const data: any = await res.json();

            // Check if it matches our wrapper signature
            if (
              data &&
              typeof data === "object" &&
              "content" in data &&
              "headers" in data
            ) {
              const { content, headers, isBinary, capturedHeaders } = data;

              // --- STEP 4: UPDATE CACHE ---
              if (capturedHeaders && targetDomain) {
                await this.saveCookie(targetDomain, capturedHeaders);
              }

              let body: BodyInit;
              if (isBinary) {
                // Decode Base64
                const binaryString = atob(content);
                const len = binaryString.length;
                const bytes = new Uint8Array(len);
                for (let k = 0; k < len; k++) {
                  bytes[k] = binaryString.charCodeAt(k);
                }
                body = bytes;
              } else {
                body = content;
              }

              return new Response(body, {
                status: res.status,
                statusText: res.statusText,
                headers: new Headers(headers),
              });
            }
            // If not our wrapper, return the clone (it was just a regular JSON response)
            return clone; // NOTE: `clone` body was already consumed by res.json() call?
            // Wait, res.json() consumes `res`. `clone` is fresh.
            // Actually `await res.json()` consumes `res`. `clone` is a copy made BEFORE `res` was consumed.
            // BUT, if I return `clone` here, it is a fresh stream.
            // However, logic above `const data = await res.json()` consumes `res`.
            // So I should return `clone` which is unconsumed. Correct.
          } catch {
            // Parsing failed, return original (clone)
            return clone;
          }
        }

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

  /**
   * Proxy Stream (M3U8 / TS / Video)
   * Returns raw Response to be piped back to client
   */
  public async proxyStream(
    targetUrl: string,
    headers: Record<string, string> = {},
    rewriteOps?: { baseUrl: string; encodedReferer: string },
  ): Promise<Response> {
    const res = await this.fetch(targetUrl, {
      method: "GET",
      headers,
    });

    // REWRITER LOGIC
    const contentType = res.headers.get("content-type") || "";
    if (
      rewriteOps &&
      (contentType.includes("application/vnd.apple.mpegurl") ||
        contentType.includes("application/x-mpegURL") ||
        contentType.includes("audio/mpegurl") ||
        contentType.includes("video/mp2t")) // Some servers send M3U8 as mp2t incorrectly
    ) {
      const originalBody = await res.text();
      // Regex: Find all absolute URLs (http/https)
      const regex = /(https?:\/\/[^\s"']+)/g;

      const newBody = originalBody.replace(regex, (match) => {
        return `${rewriteOps.baseUrl}/proxy?url=${encodeURIComponent(match)}&referer=${rewriteOps.encodedReferer}`;
      });

      return new Response(newBody, {
        status: res.status,
        headers: res.headers,
      });
    }

    return res;
  }
}
