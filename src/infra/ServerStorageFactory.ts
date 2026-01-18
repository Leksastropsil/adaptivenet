import { IStore } from "../types/storage";
import { UpstashRedisDriver } from "./drivers/UpstashRedisDriver";
import { FileSystemDriver } from "./drivers/FileSystemDriver";

export class ServerStorageFactory {
  public static create(env: Record<string, string | undefined>): IStore {
    // Default to 'fs' (FileSystem) for simple local persistence
    const driverType = (env.STORAGE_DRIVER || "fs").toLowerCase();

    console.log(`[ServerStorageFactory] Initializing driver: ${driverType}`);

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
