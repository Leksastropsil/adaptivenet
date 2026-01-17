/// <reference types="@cloudflare/workers-types" />
import { Hono } from "hono";
import { cors } from "hono/cors";
import fetchCookie from "fetch-cookie";
import { CookieJar } from "tough-cookie";
import * as cheerio from "cheerio";

// -----------------------------------------------------------------------------
// TYPES & CONSTANTS
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// TYPES & CONSTANTS
// -----------------------------------------------------------------------------

type Bindings = {
  LK21_STORE: KVNamespace;
  ADMIN_SECRET: string;
  USER_AGENT: string;
  // Config Vars
  BASE_URL: string;
  PLAYER_IFRAME_HOST: string;
  CLOUD_HOST: string;
};

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
// ENGINE (Stateless per request)
// -----------------------------------------------------------------------------

class LK21Engine {
  private fetchFn: Function;
  private tunnelUrl: string;
  private config: Bindings;

  constructor(tunnelUrl: string, config: Bindings) {
    const jar = new CookieJar();
    this.fetchFn = fetchCookie(globalThis.fetch, jar);
    this.tunnelUrl = tunnelUrl;
    this.config = config;
  }

  private async fetchWithRetry(
    targetUrl: string,
    options: any,
    retries = 2,
  ): Promise<Response> {
    const proxyUrl = new URL(this.tunnelUrl);
    proxyUrl.searchParams.append("target", targetUrl);

    const timeoutSignal = AbortSignal.timeout(15000);
    const finalOptions = {
      ...options,
      signal: timeoutSignal,
    };

    let lastError;
    for (let i = 0; i <= retries; i++) {
      try {
        const res = await this.fetchFn(proxyUrl.toString(), finalOptions);
        if (res.status >= 500) {
          if (i < retries) {
            await new Promise((r) => setTimeout(r, 1000));
            continue;
          }
        }
        return res;
      } catch (e) {
        lastError = e;
        if (i < retries) await new Promise((r) => setTimeout(r, 1000));
      }
    }
    throw (
      lastError || new Error(`Failed to fetch via tunnel ${this.tunnelUrl}`)
    );
  }

  private async fetchHtml(
    url: string,
    params?: Record<string, string>,
    customHeaders?: Record<string, string>,
  ): Promise<string> {
    const fetchUrl = params ? `${url}${new URLSearchParams(params)}` : url;
    const res = await this.fetchWithRetry(fetchUrl, {
      method: "GET",
      headers: customHeaders, // Pass custom headers (like Referer)
    });
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    return res.text();
  }

  // --- Public Methods ---

  public async getFilters(): Promise<FilterResponse> {
    const html = await this.fetchHtml(this.config.BASE_URL);
    const $ = cheerio.load(html);
    const extract = (sel: string, pre: string = "") => {
      const res: { title: string; parameter: string }[] = [];
      $(sel)
        .find("option")
        .each((_, el) => {
          const val = $(el).attr("value");
          const txt = $(el).text().trim();
          if (val && val !== "0" && txt) {
            res.push({
              title: txt,
              parameter: pre ? `${pre}/${val}` : val.replace(/^\//, ""),
            });
          }
        });
      return res;
    };
    return {
      genres: extract('select[name="genre1"]', "genre"),
      countries: extract('select[name="country"]', "country"),
      years: extract('select[name="tahun"]', "year"),
      orders: extract("select.orderby"),
    };
  }

  public async scrapeCatalog(
    page: number = 1,
    category: string = "top-movie-today",
  ): Promise<MovieResult[]> {
    const url =
      page > 1
        ? `${this.config.BASE_URL}/${category}/page/${page}`
        : `${this.config.BASE_URL}/${category}`;
    try {
      const html = await this.fetchHtml(url);
      const $ = cheerio.load(html);

      const pageTitle = $("title").text().trim() || "No Title";
      const bodySnippet = $("body")
        .text()
        .replace(/\s+/g, " ")
        .substring(0, 200);

      const results: MovieResult[] = [];
      $(".gallery-grid article").each((_, el) => {
        const $el = $(el);
        const title = $el.find(".poster-title").text().trim();
        const href = $el.find("a").first().attr("href") || "";
        if (!title || !href) return;
        const slug = href.replace(/\/$/, "").split("/").pop() || "";
        results.push({
          title,
          slug,
          poster: $el.find("img").attr("src") || null,
          rating: $el.find('[itemprop="ratingValue"]').text().trim() || null,
          quality: $el.find(".label").text().trim() || null,
          url: href.startsWith("http")
            ? href
            : `${this.config.BASE_URL}/${href}`,
        });
      });

      if (results.length === 0) {
        return [
          {
            title: `DEBUG: ${pageTitle}`,
            slug: "debug-error",
            poster: "https://img.icons8.com/color/480/error--v1.png",
            quality: "ERROR",
            rating: "0",
            url: `Content Snippet: ${bodySnippet}`,
          },
        ];
      }

      return results;
    } catch (e: any) {
      console.error(e);
      return [
        {
          title: `DEBUG: Exception Occurred`,
          slug: "debug-exception",
          poster: "https://img.icons8.com/color/480/error--v1.png",
          quality: "CRASH",
          rating: "0",
          url: `Error: ${e.message}`,
        },
      ];
    }
  }

  public async searchMovies(query: string): Promise<MovieResult[]> {
    const url = `${this.config.BASE_URL}/search`;
    try {
      const html = await this.fetchHtml(url, { s: query });
      const $ = cheerio.load(html);
      const results: MovieResult[] = [];
      const items = $(".search-item article").length
        ? $(".search-item article")
        : $("article.post");
      items.each((_, el) => {
        const $el = $(el);
        const link = $el.find("h2 a").first().length
          ? $el.find("h2 a").first()
          : $el.find(".entry-title a").first();
        if (link.length) {
          const href = link.attr("href") || "";
          results.push({
            title: link.text().trim(),
            slug: href.replace(/\/$/, "").split("/").pop() || "",
            poster: $el.find("img").attr("src") || null,
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

  public async extractStream(slug: string): Promise<any> {
    const pageUrl = `${this.config.BASE_URL}/${slug}`;
    const html = await this.fetchHtml(pageUrl);
    const $ = cheerio.load(html);
    const title = $("title").text().split("|")[0].trim();

    const poster = $(".g-item").first().find("img").attr("src") || null;

    let iframeSrc: string | null = null;

    // 1. Find Iframe Source
    $("#player-list li a").each((_, el) => {
      const href = $(el).attr("data-url") || $(el).attr("href");
      if (href?.includes(this.config.PLAYER_IFRAME_HOST)) {
        iframeSrc = href;
        return false;
      }
    });

    if (!iframeSrc) {
      const src = $("iframe#main-player").attr("src");
      if (src?.includes(this.config.PLAYER_IFRAME_HOST)) iframeSrc = src;
    }

    if (!iframeSrc) throw new Error("Server P2P not found");

    // 2. Extract ID using Regex
    // Patterns: "/p2p/<ID>", "?id=<ID>"
    // Fix: Explicitly stop at ? or & to avoid trailing '?'
    let fileId: string | null = null;
    const regexP2P = /\/p2p\/([^?&]+)/;
    const regexId = /[?&]id=([^?&]+)/;

    const matchP2P = iframeSrc.match(regexP2P);
    if (matchP2P && matchP2P[1]) {
      fileId = matchP2P[1];
    } else {
      const matchId = iframeSrc.match(regexId);
      if (matchId && matchId[1]) {
        fileId = matchId[1];
      }
    }

    if (!fileId) throw new Error(`Could not extract ID from: ${iframeSrc}`);

    // Force Clean Sanitization (Super Aggressive)
    fileId = fileId.split("?")[0].split("&")[0];

    // 3. Construct API URL
    const apiUrl = `https://${this.config.CLOUD_HOST}/api2.php?id=${fileId}`;

    // 4. Deep Fetch API
    try {
      const jsonString = await this.fetchHtml(
        apiUrl,
        {},
        {
          Referer: pageUrl,
          Origin: `https://${this.config.CLOUD_HOST}`,
          "X-Requested-With": "XMLHttpRequest",
        },
      );

      try {
        const data = JSON.parse(jsonString);
        return {
          title,
          slug,
          poster, // Include poster again
          data, // Result from api2.php
        };
      } catch (e) {
        throw new Error("Response is not valid JSON");
      }
    } catch (e: any) {
      throw new Error(`Deep fetch failed: ${e.message}`);
    }
  }
}

// -----------------------------------------------------------------------------
// HONO APP & ROUTING (Cloudflare Workers)
// -----------------------------------------------------------------------------

const app = new Hono<{ Bindings: Bindings }>().basePath("/");

// Middleware
app.use("*", cors({ origin: (origin) => origin }));

// Helper: Get Tunnel (Async KV)
const getTunnel = async (c: any): Promise<string> => {
  const tunnel = await c.env.LK21_STORE.get("CURRENT_TUNNEL");
  if (!tunnel) {
    throw new Error("Server sedang offline (Menunggu Laptop connect)");
  }
  return tunnel;
};

// --- ROUTES ---

app.get("/", (c) => c.text("LK21 API is Running (KV Mode)."));

// 1. REGISTER Endpoint (Called by Client Magic)
app.post("/register", async (c) => {
  const body = await c.req.json();
  const { tunnelUrl, secret } = body;

  if (secret !== c.env.ADMIN_SECRET) {
    return c.json({ status: "Error", message: "Unauthorized Secret" }, 401);
  }

  await c.env.LK21_STORE.put("CURRENT_TUNNEL", tunnelUrl);

  return c.json({
    status: "Registered",
    message: "Tunnel updated successfully",
    tunnel: tunnelUrl,
  });
});

app.get("/filters", async (c) => {
  try {
    const tunnel = await getTunnel(c);
    const engine = new LK21Engine(tunnel, c.env);
    const data = await engine.getFilters();
    return c.json(data);
  } catch (e: any) {
    return c.json({ detail: e.message }, 500);
  }
});

app.get("/movies", async (c) => {
  const category = c.req.query("category") || "top-movie-today";
  const page = parseInt(c.req.query("page") || "1");
  try {
    const tunnel = await getTunnel(c);
    const engine = new LK21Engine(tunnel, c.env);
    const data = await engine.scrapeCatalog(page, category);
    return c.json(data);
  } catch (e: any) {
    return c.json({ detail: e.message }, 500);
  }
});

app.get("/search", async (c) => {
  const q = c.req.query("q");
  if (!q) return c.json({ detail: "Query parameter 'q' is required" }, 400);
  try {
    const tunnel = await getTunnel(c);
    const engine = new LK21Engine(tunnel, c.env);
    const data = await engine.searchMovies(q);
    return c.json(data);
  } catch (e: any) {
    return c.json({ detail: e.message }, 500);
  }
});

app.get("/watch/:slug", async (c) => {
  const slug = c.req.param("slug");
  try {
    const tunnel = await getTunnel(c);
    const engine = new LK21Engine(tunnel, c.env);
    const data = await engine.extractStream(slug);
    return c.json(data);
  } catch (e: any) {
    return c.json({ detail: e.message }, 500);
  }
});

export default app;
