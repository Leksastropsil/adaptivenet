import { Hono } from "hono";
import { cors } from "hono/cors";
import { CoreEngine } from "./core/engine";
import { getAdapter } from "./adapters/registry";

type Bindings = {
  LK21_STORE: KVNamespace;
  ADMIN_SECRET: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// Global Middleware
app.use("*", cors());

// --- HELPER ---
const getEngine = async (c: any) => {
  const tunnel = await c.env.LK21_STORE.get("CURRENT_TUNNEL");
  if (!tunnel) throw new Error("System Offline (Tunnel not found)");
  return new CoreEngine(tunnel);
};

// --- SYSTEM ROUTES ---

app.get("/", (c) => c.text("Universal Stream API (Clean Core Architecture)."));

app.post("/register", async (c) => {
  const { tunnelUrl, secret } = await c.req.json();
  if (secret !== c.env.ADMIN_SECRET)
    return c.json({ error: "Unauthorized" }, 401);
  await c.env.LK21_STORE.put("CURRENT_TUNNEL", tunnelUrl);
  return c.json({ status: "OK", tunnel: tunnelUrl });
});

// --- DYNAMIC ADAPTER ROUTES ---

// 1. Latest Movies
app.get("/:provider/movies", async (c) => {
  const provider = c.req.param("provider");
  const page = parseInt(c.req.query("page") || "1");

  try {
    const engine = await getEngine(c);
    const adapter = getAdapter(provider, engine);
    const data = await adapter.getLatest(page);
    return c.json(data);
  } catch (e: any) {
    const status = e.message.includes("not found") ? 404 : 500;
    return c.json({ error: e.message }, status);
  }
});

// 2. Search
app.get("/:provider/search", async (c) => {
  const provider = c.req.param("provider");
  const query = c.req.query("q");

  if (!query) return c.json({ error: "Missing query 'q'" }, 400);

  try {
    const engine = await getEngine(c);
    const adapter = getAdapter(provider, engine);
    const data = await adapter.search(query);
    return c.json(data);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// 3. Watch Stream
app.get("/:provider/watch/:slug", async (c) => {
  const provider = c.req.param("provider");
  const slug = c.req.param("slug");

  try {
    const engine = await getEngine(c);
    const adapter = getAdapter(provider, engine);
    const data = await adapter.getStream(slug);
    return c.json(data);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

export default app;
