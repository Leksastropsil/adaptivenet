import {
  getFilters,
  scrapeCatalog,
  searchMovies,
  extractStream,
} from "./services/lk21";
import { LK21Config } from "./models/types";

type Handler = (req: Request, config: LK21Config) => Promise<Response>;

const CACHE_PUBLIC = "public, s-maxage=480, stale-while-revalidate=60";
const CACHE_PRIVATE = "private, no-cache, no-store, must-revalidate";

const jsonResponse = (data: any, status = 200, useCache = false) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": useCache ? CACHE_PUBLIC : CACHE_PRIVATE,
    },
  });

const errorResponse = (msg: string, status = 500) =>
  new Response(JSON.stringify({ detail: msg }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": CACHE_PRIVATE,
    },
  });

const staticRoutes: Record<string, Handler> = {
  "/filters": async (req, config) => {
    const data = await getFilters(config);
    return jsonResponse(data, 200, true);
  },
  "/movies": async (req, config) => {
    const url = new URL(req.url);
    const category = url.searchParams.get("category") || "top-movie-today";
    const page = parseInt(url.searchParams.get("page") || "1");
    const data = await scrapeCatalog(config, page, category);
    return jsonResponse(data, 200, true);
  },
  "/search": async (req, config) => {
    const url = new URL(req.url);
    const q = url.searchParams.get("q");
    if (!q) return errorResponse("Query parameter 'q' is required", 400);
    const data = await searchMovies(config, q);
    return jsonResponse(data, 200, true);
  },
};

export async function handleRequest(req: Request, env: any): Promise<Response> {
  const url = new URL(req.url);
  const pathname = url.pathname;

  // Cast env to config (assuming vars are present)
  // Fallback to default if somehow missing (safety net)
  const config: LK21Config = {
    BASE_URL: env.BASE_URL || "https://tv7.lk21official.cc",
    PLAYER_IFRAME_HOST: env.PLAYER_IFRAME_HOST || "playeriframe.sbs",
    CLOUD_HOST: env.CLOUD_HOST || "cloud.hownetwork.xyz",
    USER_AGENT:
      env.USER_AGENT ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36",
  };

  // 1. Static Routes O(1)
  const staticHandler = staticRoutes[pathname];
  if (staticHandler) {
    try {
      return await staticHandler(req, config);
    } catch (e: any) {
      return errorResponse(e.message || "Internal Server Error");
    }
  }

  // 2. Dynamic Routes (manual check for performance)
  // Match /watch/:slug
  if (pathname.startsWith("/watch/")) {
    const slug = pathname.slice(7); // len("/watch/")
    if (slug) {
      try {
        const data = await extractStream(config, slug);
        return jsonResponse(data, 200, false); // Explicitly NO CACHE
      } catch (e: any) {
        return errorResponse(e.message || "Stream extraction failed", 500);
      }
    }
  }

  return errorResponse("Not Found", 404);
}
