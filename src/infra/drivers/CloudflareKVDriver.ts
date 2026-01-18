import { IStore } from "../../types/storage";

export class CloudflareKVDriver implements IStore {
  constructor(private kv: KVNamespace | undefined) {}

  async getTunnelUrl(): Promise<string | null> {
    if (!this.kv) return null;
    return await this.kv.get("CURRENT_TUNNEL");
  }

  async setTunnelUrl(url: string): Promise<void> {
    if (!this.kv) return;
    await this.kv.put("CURRENT_TUNNEL", url);
  }

  async get(key: string): Promise<string | null> {
    if (!this.kv) return null;
    return await this.kv.get(key);
  }

  async put(key: string, value: string, ttl?: number): Promise<void> {
    if (!this.kv) return;
    const options = ttl ? { expirationTtl: ttl } : {};
    await this.kv.put(key, value, options);
  }
}
