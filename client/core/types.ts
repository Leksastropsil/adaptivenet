import { Page } from "puppeteer";

export interface IClientProvider {
  /**
   * Provider Name (e.g. "lk21", "idlix")
   */
  name: string;

  /**
   * The target URL (e.g. "https://idlix.net")
   */
  baseUrl: string;

  /**
   * Logic to bypass Cloudflare or Login
   * This runs once when the browser initializes
   */
  bypass(page: Page): Promise<void>;

  /**
   * Request headers middleware
   * Each provider can inject its own Referer or Cookies
   */
  enrichHeaders(headers: Record<string, string>): Record<string, string>;

  /**
   * Validate if configuration exists
   */
  isConfigured(): boolean;
}
