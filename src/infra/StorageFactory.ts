import { IStore } from "../types/storage";
import { CloudflareKVDriver } from "./drivers/CloudflareKVDriver";
import { UpstashRedisDriver } from "./drivers/UpstashRedisDriver";
import { FileSystemDriver } from "./drivers/FileSystemDriver";

export class StorageFactory {
  // 1. Special Factory for Cloudflare
  public static createCloudflareStorage(kv: KVNamespace): IStore {
    return new CloudflareKVDriver(kv);
  }

  // 2. Standard Factory for Node/Bun/Vercel
  public static createStandardStorage(
    env: Record<string, string | undefined>,
  ): IStore {
    // 2. Select driver based on env (for self-hosted/Docker/Vercel)
    // Default to 'fs' (FileSystem) for simple local persistence
    const driverType = (env.STORAGE_DRIVER || "fs").toLowerCase();

    console.log(`[StorageFactory] Initializing driver: ${driverType}`);

    switch (driverType) {
      case "redis":
      case "upstash":
        if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
          console.warn(
            "⚠️ Missing UPSTASH_REDIS_REST_URL/TOKEN. Falling back to FileSystem.",
          );
          return new FileSystemDriver();
        }
        return new UpstashRedisDriver(
          env.UPSTASH_REDIS_REST_URL,
          env.UPSTASH_REDIS_REST_TOKEN,
        );

      case "fs":
      case "filesystem":
      default:
        return new FileSystemDriver();
    }
  }
}
