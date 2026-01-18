import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { executablePath, Browser, Page } from "puppeteer";
import ora from "ora";
import chalk from "chalk";
import { Logger } from "./logger";

// Attempt to load Stealth Plugin (May fail in bundled EXE due to 'for-own' utils issue)
try {
  puppeteer.use(StealthPlugin());
} catch (e) {
  // Silent fallback or warning
  // We can't use Logger here if it implies full system start, but console.log is fine.
  // Actually, let's just log it if we are in debug?
  // For user UX, just a warning.
}

export class BrowserManager {
  private static instance: BrowserManager;
  private browser: Browser | null = null;
  private page: Page | null = null;

  private constructor() {}

  public static getInstance(): BrowserManager {
    if (!BrowserManager.instance) {
      BrowserManager.instance = new BrowserManager();
    }
    return BrowserManager.instance;
  }

  public async init(
    targetUrl: string,
    onBypass: (page: Page) => Promise<void>,
  ) {
    if (this.browser) return;

    const spinner = ora("Initializing Browser (Native Mode)...").start();
    try {
      this.browser = await puppeteer.launch({
        headless: true,
        executablePath: executablePath(),
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-blink-features=AutomationControlled",
          "--disable-web-security",
        ],
      });

      this.page = await this.browser.newPage();
      await this.page.setViewport({ width: 1366, height: 768 });

      spinner.text = `Navigating to ${targetUrl}...`;
      const start = Date.now();
      await this.page.goto(targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      const duration = Date.now() - start;
      if (duration > 5000) {
        // Logger.warn(`🐢 Puppeteer Slow Load: ${duration}ms`);
      }

      spinner.text = "Executing Bypass Logic...";
      await onBypass(this.page);

      spinner.succeed(chalk.green("Browser Ready & Bypassed!"));
    } catch (e: any) {
      Logger.error(`Browser Init Failed: ${e}`);
      spinner.fail(chalk.red(`Browser Init Failed: ${e}`));
      throw e;
    }
  }

  public async getUserAgent(): Promise<string> {
    if (!this.page)
      return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    return await this.page.evaluate(() => navigator.userAgent);
  }

  public async getCookies(): Promise<string> {
    if (!this.page) return "";
    const cookies = await this.page.cookies();
    return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  }

  public async fetch(url: string, headers: Record<string, string>) {
    if (!this.page) throw new Error("Browser not initialized");

    return await this.page.evaluate(
      async (targetUrl, reqHeaders) => {
        try {
          const res = await fetch(targetUrl, { headers: reqHeaders });
          const text = await res.text();
          // Extract headers to simple object
          const resHeaders: Record<string, string> = {};
          res.headers.forEach((val, key) => {
            resHeaders[key] = val;
          });

          return { status: res.status, body: text, headers: resHeaders };
        } catch (err: any) {
          return {
            status: 500,
            body: `Browser Fetch Error: ${err.toString()}`,
            headers: {},
          };
        }
      },
      url,
      headers,
    );
  }

  public async fetchBinary(url: string, headers: Record<string, string>) {
    if (!this.page) throw new Error("Browser not initialized");

    return await this.page.evaluate(
      async (targetUrl, reqHeaders) => {
        try {
          const res = await fetch(targetUrl, { headers: reqHeaders });
          const buffer = await res.arrayBuffer();
          // Convert to Base64
          let binary = "";
          const bytes = new Uint8Array(buffer);
          const len = bytes.byteLength;
          for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64 = btoa(binary);

          const resHeaders: Record<string, string> = {};
          res.headers.forEach((val, key) => {
            resHeaders[key] = val;
          });

          return {
            status: res.status,
            body: base64,
            headers: resHeaders,
            isBinary: true,
          };
        } catch (err: any) {
          return {
            status: 500,
            body: `Browser Binary Fetch Error: ${err.toString()}`,
            headers: {},
            isBinary: false,
          };
        }
      },
      url,
      headers,
    );
  }

  public async restart() {
    if (this.browser) await this.browser.close();
    this.browser = null;
    this.page = null;
  }
}
