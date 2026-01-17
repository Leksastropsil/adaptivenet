import { Page } from "puppeteer";
import { IClientProvider } from "../core/types";
import chalk from "chalk";

export class LK21ClientProvider implements IClientProvider {
  name = "lk21";
  baseUrl = process.env.TARGET_URL || "https://tv7.lk21official.cc";

  async bypass(page: Page): Promise<void> {
    try {
      // LK21 Cloudflare Bypass: Just wait for 'input[name="s"]'
      await page.waitForSelector('input[name="s"]', { timeout: 30000 });
    } catch {
      console.log(
        chalk.yellow(
          "Warning: Search input not found (Possible Cloudflare Block)",
        ),
      );
    }
  }

  enrichHeaders(headers: Record<string, string>): Record<string, string> {
    return {
      ...headers,
      Referer: headers["Referer"] || this.baseUrl,
    };
  }

  isConfigured(): boolean {
    // Check if critical env vars are set
    return !!this.baseUrl;
  }
}
