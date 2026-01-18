import { handle } from "@hono/node-server/vercel";
import { createApp } from "../src/app";
import { ServerStorageFactory } from "../src/infra/ServerStorageFactory";

export const config = {
  runtime: "nodejs",
};

// 1. Initialize Standard Storage
// process.env in Vercel contains environment variables
const storage = ServerStorageFactory.create(process.env as any);

// 2. Create App
const app = createApp(storage);

// 3. Export Handler
export default handle(app);
