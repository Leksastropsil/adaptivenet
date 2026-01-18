import { IStore } from "../../types/storage";

export class UpstashRedisDriver implements IStore {
  private url: string;
  private token: string;

  constructor(url: string, token: string) {
    this.url = url;
    this.token = token;
  }

  private async command(cmd: string, ...args: (string | number)[]) {
    try {
      const res = await fetch(`${this.url}/${cmd}/${args.join("/")}`, {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      });
      const data: any = await res.json();
      if (data.error) throw new Error(data.error);
      return data.result;
    } catch (e) {
      console.error("[Upstash] Error:", e);
      return null;
    }
  }

  async getTunnelUrl(): Promise<string | null> {
    return await this.command("get", "CURRENT_TUNNEL");
  }

  async setTunnelUrl(url: string): Promise<void> {
    await this.command("set", "CURRENT_TUNNEL", url);
  }

  async get(key: string): Promise<string | null> {
    return await this.command("get", key);
  }

  async put(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl) {
      await this.command("set", key, value, "EX", ttl);
    } else {
      await this.command("set", key, value);
    }
  }
}
