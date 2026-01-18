import { IStore } from "../../types/storage";
import fs from "fs/promises";
import path from "path";

const FILE_PATH = path.resolve(process.cwd(), "data", "store.json");

export class FileSystemDriver implements IStore {
  private memoryCache: Record<string, any> = {};

  constructor() {
    this.ensureDir();
  }

  private async ensureDir() {
    try {
      const dir = path.dirname(FILE_PATH);
      await fs.mkdir(dir, { recursive: true });
    } catch {}
  }

  private async load(): Promise<Record<string, any>> {
    try {
      const raw = await fs.readFile(FILE_PATH, "utf-8");
      this.memoryCache = JSON.parse(raw);
    } catch {
      this.memoryCache = {};
    }
    return this.memoryCache;
  }

  private async save() {
    try {
      await fs.writeFile(FILE_PATH, JSON.stringify(this.memoryCache, null, 2));
    } catch (e) {
      console.error("[FileSystem] Save Error:", e);
    }
  }

  async getTunnelUrl(): Promise<string | null> {
    await this.load();
    return this.memoryCache["CURRENT_TUNNEL"] || null;
  }

  async setTunnelUrl(url: string): Promise<void> {
    await this.load();
    this.memoryCache["CURRENT_TUNNEL"] = url;
    await this.save();
  }

  async get(key: string): Promise<string | null> {
    await this.load();
    const item = this.memoryCache[key];
    if (!item) return null;

    // Check TTL logic if we stored it structurally, but for simplicity assuming simple KV map
    // If strict TTL needed, we should store { val, exp }
    if (typeof item === "object" && item.val && item.exp) {
      if (Date.now() > item.exp) {
        delete this.memoryCache[key];
        await this.save();
        return null;
      }
      return item.val;
    }
    return item; // Legacy or simple string
  }

  async put(key: string, value: string, ttl?: number): Promise<void> {
    await this.load();
    if (ttl) {
      this.memoryCache[key] = {
        val: value,
        exp: Date.now() + ttl * 1000,
      };
    } else {
      this.memoryCache[key] = value;
    }
    await this.save();
  }
}
