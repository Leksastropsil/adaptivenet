import { Hono } from "hono";
import { handle } from "hono/vercel";
import fetchCookie from "fetch-cookie";
import { CookieJar } from "tough-cookie";
import * as cheerio from "cheerio";

// -----------------------------------------------------------------------------
// TYPES & CONSTANTS
// -----------------------------------------------------------------------------

enum LK21Constants {
  BASE_URL = "https://tv7.lk21official.cc",
  PLAYER_IFRAME_HOST = "playeriframe.sbs",
  CLOUD_HOST = "cloud.hownetwork.xyz",
  USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36",
}

interface FilterOption {
  title: string;
  parameter: string;
}

interface FilterResponse {
  genres: FilterOption[];
  countries: FilterOption[];
  years: FilterOption[];
  orders: FilterOption[];
}

interface MovieResult {
  title: string;
  slug: string;
  poster: string | null;
  rating: string | null;
  quality: string | null;
  url: string;
}

interface StreamItem {
  label: string;
  type: string;
  url: string;
}

interface WatchResponse {
  title: string;
  slug: string;
  streams: StreamItem[];
}

// -----------------------------------------------------------------------------
// HTTP CLIENT (Stealth / Runtime Agnostic)
// -----------------------------------------------------------------------------

// 1. Cookie Jar Storage (Global for serverless instance lifetime)
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

async function fetchHtml(
  url: string,
  params?: Record<string, string>,
): Promise<string> {
  const fetchUrl = params ? `${url}?${new URLSearchParams(params)}` : url;

  // Prepare options
  const fetchOptions: any = {
    method: "GET",
    headers: {
      ...BROWSER_HEADERS,
      Referer: LK21Constants.BASE_URL,
    },
  };

  const res = await fetchWithRetry(fetchUrl, fetchOptions);

  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  return res.text();
}

async function postForm(
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
      ...extraHeaders,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
    },
    body: formData,
  });

  if (!res.ok) throw new Error(`Post failed: ${res.status}`);
  return res.json();
}

// -----------------------------------------------------------------------------
// CORE SERVICE LOGIC
// -----------------------------------------------------------------------------

async function getFilters(): Promise<FilterResponse> {
  const html = await fetchHtml(LK21Constants.BASE_URL);
  const $ = cheerio.load(html);

  const extract = (
    selector: string,
    prefix: string = "",
  ): { title: string; parameter: string }[] => {
    const results: { title: string; parameter: string }[] = [];
    $(selector)
      .find("option")
      .each((_, el) => {
        const val = $(el).attr("value");
        const txt = $(el).text().trim();
        if (val && val !== "0" && txt) {
          results.push({
            title: txt,
            parameter: prefix ? `${prefix}/${val}` : val.replace(/^\//, ""),
          });
        }
      });
    return results;
  };

  return {
    genres: extract('select[name="genre1"]', "genre"),
    countries: extract('select[name="country"]', "country"),
    years: extract('select[name="tahun"]', "year"),
    orders: extract("select.orderby"),
  };
}

async function scrapeCatalog(
  page: number = 1,
  category: string = "top-movie-today",
): Promise<MovieResult[]> {
  const url =
    page > 1
      ? `${LK21Constants.BASE_URL}/${category}/page/${page}`
      : `${LK21Constants.BASE_URL}/${category}`;

  try {
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);
    const results: MovieResult[] = [];

    $(".gallery-grid article").each((_, el) => {
      const $el = $(el);
      const titleEl = $el.find(".poster-title");
      const linkEl = $el.find("a").first();

      if (!titleEl.length || !linkEl.length) return;

      const title = titleEl.text().trim();
      const href = linkEl.attr("href") || "";
      const slug = href.replace(/\/$/, "").split("/").pop() || "";
      const poster = $el.find("img").attr("src") || null;
      const rating = $el.find('[itemprop="ratingValue"]').text().trim() || null;
      const quality = $el.find(".label").text().trim() || null;

      results.push({
        title,
        slug,
        poster,
        rating,
        quality,
        url: href.startsWith("http")
          ? href
          : `${LK21Constants.BASE_URL}/${href}`,
      });
    });

    return results;
  } catch {
    return [];
  }
}

async function searchMovies(query: string): Promise<MovieResult[]> {
  const url = `${LK21Constants.BASE_URL}/search`;
  try {
    const html = await fetchHtml(url, { s: query });
    const $ = cheerio.load(html);
    const results: MovieResult[] = [];

    let items = $(".search-item article");
    if (items.length === 0) {
      items = $("article.post");
    }

    items.each((_, el) => {
      const $el = $(el);
      const linkEl = $el.find("h2 a").first().length
        ? $el.find("h2 a").first()
        : $el.find(".entry-title a").first();

      if (linkEl.length) {
        const title = linkEl.text().trim();
        const href = linkEl.attr("href") || "";
        const slug = href.replace(/\/$/, "").split("/").pop() || "";
        const poster = $el.find("img").attr("src") || null;

        results.push({
          title,
          slug,
          poster,
          rating: null,
          quality: null,
          url: href,
        });
      }
    });

    return results;
  } catch {
    return [];
  }
}

async function extractStream(slug: string): Promise<WatchResponse> {
  const pageUrl = `${LK21Constants.BASE_URL}/${slug}`;
  const html = await fetchHtml(pageUrl);
  const $ = cheerio.load(html);

  const title = $("title").text().split("|")[0].trim();

  let targetIframeUrl: string | null = null;

  $("#player-list li a").each((_, el) => {
    const href = $(el).attr("data-url") || $(el).attr("href");
    if (
      href &&
      href.includes(LK21Constants.PLAYER_IFRAME_HOST) &&
      href.includes("p2p")
    ) {
      targetIframeUrl = href;
      return false;
    }
  });

  if (!targetIframeUrl) {
    const src = $("iframe#main-player").attr("src");
    if (src && src.includes(LK21Constants.PLAYER_IFRAME_HOST)) {
      targetIframeUrl = src;
    }
  }

  if (!targetIframeUrl) {
    throw new Error("Server P2P not found");
  }

  const hash = targetIframeUrl.split("/").pop();
  if (!hash) throw new Error("Could not extract hash ID");

  const apiUrl = `https://${LK21Constants.CLOUD_HOST}/api2.php?id=${hash}`;
  const headers = {
    Referer: `https://${LK21Constants.CLOUD_HOST}/video.php?id=${hash}`,
    Origin: `https://${LK21Constants.CLOUD_HOST}`,
    "X-Requested-With": "XMLHttpRequest",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
  };
  const body = {
    r: `https://${LK21Constants.PLAYER_IFRAME_HOST}/`,
    d: LK21Constants.CLOUD_HOST,
  };

  const data = await postForm(apiUrl, body, headers);

  const streams: StreamItem[] = [];

  const parse = (item: any) => {
    if (item && item.file) {
      streams.push({
        label: item.label || "Auto",
        type: "hls",
        url: item.file,
      });
    }
  };

  if (Array.isArray(data)) {
    data.forEach(parse);
  } else if (data && typeof data === "object") {
    if (Array.isArray(data.sources)) {
      data.sources.forEach(parse);
    } else {
      parse(data);
    }
  }

  if (streams.length === 0) {
    throw new Error("Stream empty");
  }

  return {
    title,
    slug,
    streams,
  };
}

// -----------------------------------------------------------------------------
// HONO APP & ROUTING
// -----------------------------------------------------------------------------

const app = new Hono().basePath("/");

app.get("/filters", async (c) => {
  try {
    const data = await getFilters();
    return c.json(data);
  } catch (e: any) {
    return c.json({ detail: e.message }, 500);
  }
});

app.get("/movies", async (c) => {
  const category = c.req.query("category") || "top-movie-today";
  const page = parseInt(c.req.query("page") || "1");
  try {
    const data = await scrapeCatalog(page, category);
    return c.json(data);
  } catch (e: any) {
    return c.json({ detail: e.message }, 500);
  }
});

app.get("/search", async (c) => {
  const q = c.req.query("q");
  if (!q) return c.json({ detail: "Query parameter 'q' is required" }, 400);
  try {
    const data = await searchMovies(q);
    return c.json(data);
  } catch (e: any) {
    return c.json({ detail: e.message }, 500);
  }
});

app.get("/watch/:slug", async (c) => {
  const slug = c.req.param("slug");
  try {
    const data = await extractStream(slug);
    return c.json(data);
  } catch (e: any) {
    return c.json({ detail: e.message }, 500);
  }
});

// Cache Middleware
app.use("*", async (c, next) => {
  await next();
  const path = c.req.path;
  if (path.startsWith("/watch")) {
    c.header("Cache-Control", "private, no-cache, no-store, must-revalidate");
  } else {
    c.header(
      "Cache-Control",
      "public, s-maxage=480, stale-while-revalidate=60",
    );
  }
});

// Vercel Export
export const config = {
  runtime: "nodejs",
};

export default handle(app);
