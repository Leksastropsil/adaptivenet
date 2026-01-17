import { spawn } from "node:child_process";
import { BrowserManager } from "./browser";
import { IClientProvider } from "./types";
import chalk from "chalk";
import ora from "ora";
import gradient from "gradient-string";

export class ProxyNode {
  private provider: IClientProvider;
  private port: number;
  private workerUrl: string;
  private secret: string;

  constructor(provider: IClientProvider) {
    this.provider = provider;
    this.port = parseInt(process.env.LOCAL_PORT || "3000");
    this.workerUrl = process.env.WORKER_URL || "http://localhost:8787";
    this.secret = process.env.ADMIN_SECRET || "rahasia123";
  }

  public async start() {
    // 1. Start Browser
    await BrowserManager.getInstance().init(
      this.provider.baseUrl,
      this.provider.bypass,
    );

    // 2. Start Bun Server
    this.startServer();

    // 3. Start Tunnel
    await this.startTunnel();
  }

  private startServer() {
    Bun.serve({
      port: this.port,
      fetch: async (req) => {
        const url = new URL(req.url);
        const target = url.searchParams.get("target");
        if (!target) return new Response("Missing target", { status: 400 });

        // Enrich Headers (Provider Specific)
        const reqHeaders: Record<string, string> = {};
        req.headers.forEach((v, k) => {
          reqHeaders[k] = v;
        });
        const finalHeaders = this.provider.enrichHeaders(reqHeaders);

        const start = performance.now();

        // Execute Fetch via Browser
        const result = await BrowserManager.getInstance().fetch(
          target,
          finalHeaders,
        );

        // Auto-Healing Logic
        if (result.status === 500 && result.body.includes("Session closed")) {
          console.log(chalk.yellow("Session died. Restarting..."));
          await BrowserManager.getInstance().restart();
          await BrowserManager.getInstance().init(
            this.provider.baseUrl,
            this.provider.bypass,
          );
        }

        const duration = Math.round(performance.now() - start);
        const color = result.status >= 400 ? chalk.red : chalk.green;
        console.log(
          chalk.dim(`[Proxy]`) +
            ` ${color(result.status)} ${duration}ms ${target.substring(0, 50)}...`,
        );

        return new Response(result.body, {
          status: result.status,
          headers: { "Content-Type": "text/html" },
        });
      },
    });
  }

  private async startTunnel() {
    const spinner = ora("Opening Cloudflared Tunnel...").start();

    // Resolve Binary Path (Windows Support)
    let binPath = "cloudflared"; // Default global

    const fs = await import("fs");
    const path = await import("path");

    const localBin = path.resolve(
      process.cwd(),
      "client",
      process.platform === "win32" ? "cloudflared.exe" : "cloudflared",
    );
    const rootBin = path.resolve(
      process.cwd(),
      process.platform === "win32" ? "cloudflared.exe" : "cloudflared",
    );

    // Check if local binary exists
    if (fs.existsSync(localBin)) {
      binPath = `"${localBin}"`; // Quote for shell safety
    } else if (fs.existsSync(rootBin)) {
      binPath = `"${rootBin}"`;
    }

    const tunnel = spawn(
      binPath,
      ["tunnel", "--url", `http://localhost:${this.port}`],
      { shell: true },
    );

    let lastUpdate = 0;

    tunnel.stderr.on("data", async (data) => {
      const logStr = data.toString();

      // Immediate Match for Tunnel URL (Critical)
      const match = logStr.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
      if (match) {
        const tunnelUrl = match[0];
        spinner.succeed(chalk.green("Tunnel Configured!"));
        console.log(chalk.yellow(`\n🚇 Tunnel: ${tunnelUrl}\n`));
        await this.registerToWorker(tunnelUrl);
        return;
      }

      // Throttle Visual Updates (to prevent flickering)
      const now = Date.now();
      if (now - lastUpdate > 500) {
        const cleanLog = logStr.replace(/\n/g, "").trim().substring(0, 50);
        if (cleanLog.length > 5) {
          // Filter out noise
          spinner.text = `Tunnel: ${cleanLog}...`;
          lastUpdate = now;
        }
      }
    });
  }

  private async registerToWorker(tunnelUrl: string) {
    const spinner = ora("Registering to Worker...").start();
    try {
      const res = await fetch(`${this.workerUrl}/register`, {
        method: "POST",
        body: JSON.stringify({ tunnelUrl, secret: this.secret }),
      });
      if (res.ok) {
        spinner.succeed("Registered Successfully!");
        console.log(gradient.rainbow(`\n🚀 Connected to ${this.workerUrl}\n`));
      } else {
        spinner.fail("Registration Failed");
      }
    } catch (e) {
      spinner.fail(`Network Error: ${e}`);
    }
  }
}
