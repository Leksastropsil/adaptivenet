import { serve } from "@hono/node-server";
import { config } from "dotenv";
import { createApp } from "./app";
import { ServerStorageFactory } from "./infra/ServerStorageFactory";

// 1. Load Env
config();

const port = parseInt(process.env.PORT || "3000");

// 2. Initialize Store via Factory
const storage = ServerStorageFactory.create(process.env as any);
const app = createApp(storage);

// 3. Start Server
console.log(`🚀 Server running on port ${port}`);
serve({
  fetch: app.fetch,
  port,
});
