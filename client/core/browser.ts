import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { executablePath, Browser, Page } from "puppeteer";
import ora from "ora";
import chalk from "chalk";

puppeteer.use(StealthPlugin());

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
      await this.page.goto(targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });

      spinner.text = "Executing Bypass Logic...";
      await onBypass(this.page);

      spinner.succeed(chalk.green("Browser Ready & Bypassed!"));
    } catch (e) {
      spinner.fail(chalk.red(`Browser Init Failed: ${e}`));
      throw e;
    }
  }

  public async fetch(url: string, headers: Record<string, string>) {
    if (!this.page) throw new Error("Browser not initialized");

    return await this.page.evaluate(
      async (targetUrl, reqHeaders) => {
        try {
          const res = await fetch(targetUrl, { headers: reqHeaders });
          const text = await res.text();
          return { status: res.status, body: text };
        } catch (err: any) {
          return {
            status: 500,
            body: `Browser Fetch Error: ${err.toString()}`,
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
