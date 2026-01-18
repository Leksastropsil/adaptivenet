export interface IStore {
  /**
   * Mengambil URL Tunnel yang aktif
   */
  getTunnelUrl(): Promise<string | null>;

  /**
   * Menyimpan URL Tunnel baru
   */
  setTunnelUrl(url: string): Promise<void>;

  /**
   * Generic Cache Get
   */
  get(key: string): Promise<string | null>;

  /**
   * Generic Cache Put with optional TTL (seconds)
   */
  put(key: string, value: string, ttl?: number): Promise<void>;
}
