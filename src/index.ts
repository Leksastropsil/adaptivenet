import { createApp } from "./app";
import { CloudflareStorageFactory } from "./infra/CloudflareStorageFactory";

type Bindings = {
  LK21_STORE: KVNamespace;
  ADMIN_SECRET: string;
};

// Cloudflare Worker Entry Point
export default {
  fetch: async (request: Request, env: Bindings, ctx: ExecutionContext) => {
    // 1. Initialize Storage Adapter via Factory
    const storage = CloudflareStorageFactory.create(env.LK21_STORE);

    // 2. Create App with Injected Storage
    const app = createApp(storage);

    // 3. Delegate to Hono
    return app.fetch(request, env, ctx);
  },
};
