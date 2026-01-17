import { Hono } from "hono";
import { handle } from "hono/vercel";
import {
  getFilters,
  scrapeCatalog,
  searchMovies,
  extractStream,
} from "../src/services/lk21";

const app = new Hono().basePath("/");

// 1. Catalog & Discovery
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

// 2. Streaming
app.get("/watch/:slug", async (c) => {
  const slug = c.req.param("slug");
  try {
    const data = await extractStream(slug);
    return c.json(data);
  } catch (e: any) {
    return c.json({ detail: e.message }, 500);
  }
});

// 3. Cache Middleware (Manual for Hono-Vercel if needed, but Hono-Vercel might handle headers)
// We'll set headers manually in routes or middleware if strict caching needed,
// for now relying on default behavior or adding middleware.
// User requirement: "Smart Caching" from previous prompt.
// Adding strict caching middleware.

app.use("*", async (c, next) => {
  await next();
  // Apply cache policy based on path
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

export const config = {
  runtime: "nodejs",
};

export default handle(app);
