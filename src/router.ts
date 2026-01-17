import {
  getFilters,
  scrapeCatalog,
  searchMovies,
  extractStream,
} from "./services/lk21";

type Handler = (req: Request) => Promise<Response>;

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
  "/filters": async () => {
    const data = await getFilters();
    return jsonResponse(data, 200, true);
  },
  "/movies": async (req) => {
    const url = new URL(req.url);
    const category = url.searchParams.get("category") || "top-movie-today";
    const page = parseInt(url.searchParams.get("page") || "1");
    const data = await scrapeCatalog(page, category);
    return jsonResponse(data, 200, true);
  },
  "/search": async (req) => {
    const url = new URL(req.url);
    const q = url.searchParams.get("q");
    if (!q) return errorResponse("Query parameter 'q' is required", 400);
    const data = await searchMovies(q);
    return jsonResponse(data, 200, true);
  },
};

export async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const pathname = url.pathname;

  // 1. Static Routes O(1)
  const staticHandler = staticRoutes[pathname];
  if (staticHandler) {
    try {
      return await staticHandler(req);
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
        const data = await extractStream(slug);
        return jsonResponse(data, 200, false); // Explicitly NO CACHE
      } catch (e: any) {
        return errorResponse(e.message || "Stream extraction failed", 500);
      }
    }
  }

  return errorResponse("Not Found", 404);
}
