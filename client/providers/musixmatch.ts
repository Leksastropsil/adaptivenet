import { Page } from "puppeteer";
import { IClientProvider } from "../core/types";

export class MusixmatchClientProvider implements IClientProvider {
  name = "musixmatch";
  baseUrl = "https://www.musixmatch.com";

  async bypass(page: Page): Promise<void> {
    try {
      // Wait for search box or login
      await page.waitForSelector(".mxm-search-bar", { timeout: 15000 });
    } catch {
      console.log("Warning: Musixmatch Selector not found.");
    }
  }

  enrichHeaders(headers: Record<string, string>): Record<string, string> {
    return {
      ...headers,
      Referer: this.baseUrl,
    };
  }

  isConfigured(): boolean {
    return true;
  }
}
