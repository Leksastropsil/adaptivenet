import fetchCookie from "fetch-cookie";
import { CookieJar } from "tough-cookie";
import { LK21Constants } from "../models/types";

// 1. Cookie Jar Storage (Global for serverless instance lifetime)
// Note: In strict serverless (Edge), this resets per invocation unless warm.
// fetch-cookie wraps the native global fetch (Node 18+)
const jar = new CookieJar();
const fetchWithCookies = fetchCookie(globalThis.fetch, jar);

// 2. Browser Headers
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9,id;q=0.8",
  "Sec-Ch-Ua":
    '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

// 3. Retry Logic Helper
async function fetchWithRetry(
  url: string,
  options: any,
  retries = 3,
): Promise<Response> {
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetchWithCookies(url, options);
      if (res.status === 403 || res.status === 503) {
        console.warn(
          `[Stealth] Blocked ${res.status} on ${url}. Retrying ${i + 1}/${retries}...`,
        );
        // Random delay 1-2s
        await new Promise((r) => setTimeout(r, 1000 + Math.random() * 1000));
        continue;
      }
      return res;
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw (
    lastError || new Error(`Failed to fetch ${url} after ${retries} retries`)
  );
}

export async function fetchHtml(
  url: string,
  params?: Record<string, string>,
): Promise<string> {
  const fetchUrl = params ? `${url}?${new URLSearchParams(params)}` : url;

  // Check for proxy env
  const proxy = process.env.PROXY_URL;

  // Prepare options
  const fetchOptions: any = {
    method: "GET",
    headers: {
      ...BROWSER_HEADERS,
      Referer: LK21Constants.BASE_URL,
    },
    // Removed 'proxy' and 'tls' as they are Bun-specific and not supported by standard fetch
  };

  // If using a proxy in Node, we would typically need 'https-proxy-agent',
  // but standard fetch doesn't support 'proxy' option directly like Bun.
  // We will ignore proxy for now to be runtime agnostic, or user needs to use global agent.
  // For Vercel/Node, standard fetch is usually sufficient.

  const res = await fetchWithRetry(fetchUrl, fetchOptions);

  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  return res.text();
}

export async function postForm(
  url: string,
  data: Record<string, string>,
  extraHeaders: Record<string, string>,
): Promise<any> {
  const formData = new URLSearchParams();
  for (const key in data) {
    formData.append(key, data[key]);
  }

  const res = await fetchWithRetry(url, {
    method: "POST",
    headers: {
      ...BROWSER_HEADERS,
      ...extraHeaders, // Allow overriding specific headers (Referer, Origin)
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin", // or cross-site depending on flow
    },
    body: formData,
  });

  if (!res.ok) throw new Error(`Post failed: ${res.status}`);
  return res.json();
}
