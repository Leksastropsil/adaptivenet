import { spawn } from "node:child_process";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { executablePath, Browser, Page } from "puppeteer";
import chalk from "chalk";
import ora from "ora";
import figlet from "figlet";
import gradient from "gradient-string";

puppeteer.use(StealthPlugin());

// --- KONFIGURASI (Load from .env or defaults) ---
const WORKER_URL =
  process.env.WORKER_URL ||
  "https://lk21-api.leksaandanaoktaviansaa.workers.dev";
const TARGET_URL = process.env.TARGET_URL || "https://tv7.lk21official.cc";
const LOCAL_PORT = parseInt(process.env.LOCAL_PORT || "3000");
const ADMIN_SECRET = process.env.ADMIN_SECRET || "rahasia123";

// --- GLOBAL STATE ---
let browser: Browser | null = null;
let page: Page | null = null;
let isInitializing = false;

// --- UI HELPERS ---
const log = console.log;
const spacer = () => log("");

function showBanner() {
  console.clear();
  const title = figlet.textSync("LK21 MAGIC", { font: "Standard" });
  const subtitle = figlet.textSync("CLIENT", { font: "Small" });
  log(gradient.pastel.multiline(title));
  log(gradient.vice.multiline(subtitle));
  log(chalk.dim("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  log(chalk.cyan("🤖 Residential Proxy Node"));
  log(chalk.blue(`📌 Target: ${chalk.bold(TARGET_URL)}`));
  log(chalk.green(`🔌 Worker: ${chalk.bold(WORKER_URL)}`));
  log(chalk.dim("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  spacer();
}

// 1. INIT BROWSER (Keep Alive)
async function initBrowser() {
  if (isInitializing) return;
  isInitializing = true;
  const spinner = ora("Initializing Browser (Native Mode)...").start();

  try {
    if (browser) await browser.close();

    browser = await puppeteer.launch({
      headless: true,
      executablePath: executablePath(),
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-web-security",
        "--disable-features=IsolateOrigins,site-per-process",
        "--disable-site-isolation-trials",
      ],
    });

    page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });

    spinner.text = `Navigating to ${TARGET_URL}...`;

    // Buka halaman utama untuk mancing Cloudflare/Cookie
    await page.goto(TARGET_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    spinner.text = "Bypassing Cloudflare Protection...";

    // Tunggu challenge lewat
    try {
      await page.waitForSelector('input[name="s"]', { timeout: 30000 });
      spinner.succeed(chalk.green("Cloudflare bypassed! Ready to scrape."));
    } catch {
      spinner.warn(
        chalk.yellow(
          "Search input not found, but continuing (Check manually if blocked).",
        ),
      );
    }
  } catch (e) {
    spinner.fail(chalk.red(`Init failed: ${e}`));
    browser = null;
    page = null;
  } finally {
    isInitializing = false;
  }
}

// 2. NATIVE FETCH INTERCEPTOR
async function nativeFetch(
  targetUrl: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: string }> {
  if (!page || !browser) {
    await initBrowser();
  }
  if (!page) throw new Error("Browser failed to start");

  return await page.evaluate(
    async (url, headers) => {
      try {
        const res = await fetch(url, {
          headers: {
            ...headers,
            Referer: headers["Referer"] || "https://tv7.lk21official.cc/",
          },
        });
        const text = await res.text();
        return { status: res.status, body: text };
      } catch (err: any) {
        return { status: 500, body: `Browser Fetch Error: ${err.toString()}` };
      }
    },
    targetUrl,
    headers,
  );
}

// 3. SERVER BRIDGE
async function startServer() {
  Bun.serve({
    port: LOCAL_PORT,
    async fetch(req) {
      const url = new URL(req.url);
      const target = url.searchParams.get("target");

      if (!target) return new Response("Missing 'target'", { status: 400 });

      const start = performance.now();
      const reqId = Math.random().toString(36).substring(7);

      try {
        const reqHeaders: Record<string, string> = {};
        if (req.headers.get("Referer"))
          reqHeaders["Referer"] = req.headers.get("Referer")!;

        let result = await nativeFetch(target, reqHeaders);

        // Auto-Healing
        if (result.status === 500 && result.body.includes("Session closed")) {
          console.log(
            chalk.yellow(`[${reqId}] 🔄 Session died. Restarting browser...`),
          );
          await initBrowser();
          result = await nativeFetch(target, reqHeaders);
        }

        const duration = Math.round(performance.now() - start);
        const statusColor = result.status >= 400 ? chalk.red : chalk.green;

        console.log(
          `${chalk.dim(`[${reqId}]`)} ${statusColor(result.status)} ${chalk.gray(`${duration}ms`)} ${target.substring(0, 60)}...`,
        );

        return new Response(result.body, {
          status: result.status,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Content-Type": "text/html; charset=utf-8",
          },
        });
      } catch (e) {
        console.error(chalk.red(`[${reqId}] Critical Error: ${e}`));
        return new Response(`Proxy Error: ${e}`, { status: 500 });
      }
    },
  });
}

// 4. TUNNEL AUTOMATOR
async function startTunnel() {
  const spinner = ora("Opening Cloudflared Tunnel...").start();

  const tunnel = spawn(
    "cloudflared",
    ["tunnel", "--url", `http://localhost:${LOCAL_PORT}`],
    { shell: true },
  );

  tunnel.stderr.on("data", async (data) => {
    const logStr = data.toString();
    const match = logStr.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    if (match) {
      const tunnelUrl = match[0];
      spinner.succeed(chalk.green("Tunnel Configured!"));

      log(chalk.dim("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
      log(
        `${chalk.bold("🚇 Tunnel URL")}: ${chalk.underline.yellow(tunnelUrl)}`,
      );
      log(chalk.dim("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));

      // AUTO REGISTER
      const regSpinner = ora("Registering Tunnel to Worker...").start();
      try {
        const res = await fetch(`${WORKER_URL}/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tunnelUrl: tunnelUrl,
            secret: ADMIN_SECRET,
          }),
        });
        const json: any = await res.json();

        if (res.ok) {
          regSpinner.succeed(chalk.green("Auto-Register Success!"));
          spacer();
          log(gradient.rainbow("🚀  API ONLINE & READY  🚀"));
          spacer();
          log(chalk.cyan(`👉 Endpoint: ${chalk.bold(`${WORKER_URL}/movies`)}`));
          log(chalk.cyan(`👉 Status:   ${chalk.bold("CONNECTED")}`));
          spacer();
          log(chalk.dim("Listening for requests..."));
        } else {
          regSpinner.fail(chalk.red(`Register Failed: ${json.message}`));
        }
      } catch (e) {
        regSpinner.fail(chalk.red(`Network Error: ${e}`));
      }
    }
  });

  tunnel.on("error", (err) => {
    spinner.fail(chalk.red(`Tunnel Error: ${err.message}`));
  });
}

// MAIN
async function main() {
  showBanner();
  await startServer(); // Start Bun Server silently first
  await initBrowser();
  await startTunnel();
}

main();
