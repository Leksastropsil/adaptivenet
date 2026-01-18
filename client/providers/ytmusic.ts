import { Page } from "puppeteer";
import { IClientProvider } from "../core/types";

export class YoutubeMusicClientProvider implements IClientProvider {
  name = "ytmusic";
  baseUrl = "https://music.youtube.com";

  async bypass(page: Page): Promise<void> {
    // Wait for main content to load
    try {
      await page.waitForSelector("ytmusic-app-layout", { timeout: 15000 });
    } catch {
      console.log("Warning: YTM Selector not found, proceeding...");
    }
  }

  enrichHeaders(headers: Record<string, string>): Record<string, string> {
    return {
      ...headers,
      Referer: this.baseUrl,
      Origin: this.baseUrl,
    };
  }

  isConfigured(): boolean {
    return true;
  }
}
