import { spawn, exec } from "node:child_process";
import { promisify } from "util";
const execAsync = promisify(exec);
import { BrowserManager } from "./browser";
import { IClientProvider } from "./types";
import { Logger } from "./logger";
import chalk from "chalk";
import ora from "ora";
import gradient from "gradient-string";

export interface ProxyOptions {
  workerUrl?: string;
  secret?: string;
  port?: number;
}

export class ProxyNode {
  private provider: IClientProvider;
  private port: number;
  private workerUrl: string;
  private secret: string;
  private currentTunnelUrl: string | null = null;

  constructor(provider: IClientProvider, options?: ProxyOptions) {
    this.provider = provider;
    this.port = options?.port || parseInt(process.env.LOCAL_PORT || "3000");
    this.workerUrl =
      options?.workerUrl || process.env.WORKER_URL || "http://localhost:8787";
    this.secret = options?.secret || process.env.ADMIN_SECRET || "rahasia123";
  }

  public async start() {
    // 1. Start Browser
    await BrowserManager.getInstance().init(
      this.provider.baseUrl,
      this.provider.bypass,
    );

    // 2. Start Bun Server
    await this.startServer();

    // 3. Start Tunnel
    await this.startTunnel();
  }

  // Global State for Optimizations
  private cachedCookies: string | null = null;
  private cachedUserAgent: string | null = null;
  private server: any | null = null; // Bun Server instance
  private tunnelProcess: any | null = null; // Child Process

  private async killPort(port: number) {
    console.log(`[Proxy] Checking port ${port}...`);
    if (process.platform === "win32") {
      try {
        // PowerShell command to find and kill the process listening on the port
        await execAsync(
          `powershell -Command "Stop-Process -Id (Get-NetTCPConnection -LocalPort ${port}).OwningProcess -Force"`,
        );
        console.log(`[Proxy] Killed process on port ${port}.`);
      } catch (e: any) {
        // Ignore errors (process not found, etc.)
        // console.log("Kill port error:", e.message);
      }
    } else {
      try {
        await execAsync(`lsof -t -i:${port} | xargs kill -9`);
        console.log(`[Proxy] Killed process on port ${port}.`);
      } catch (e) {}
    }
  }

  private async startServer(retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        this.server = Bun.serve({
          port: this.port,
          idleTimeout: 60, // Prevent timeout during Puppeteer loading
          fetch: async (req) => {
            // ... (existing fetch logic remains same) ...
            const url = new URL(req.url);
            const target = url.searchParams.get("target");
            if (!target) return new Response("Missing target", { status: 400 });

            // 1. Capture Critical Headers
            const getHeader = (key: string) =>
              req.headers.get(key) || req.headers.get(key.toLowerCase());

            // Get Latest UA (Cached or Live)
            const currentUserAgent =
              this.cachedUserAgent ||
              (await BrowserManager.getInstance().getUserAgent());

            const finalHeaders: Record<string, string> = {
              Referer: getHeader("Referer") || this.provider.baseUrl,
              Origin: getHeader("Origin") || this.provider.baseUrl,
              "User-Agent": currentUserAgent,
              ...this.provider.enrichHeaders({}),
            };

            const start = performance.now();
            let result: {
              status: number;
              body: any;
              headers: any;
              isBinary?: boolean;
            };

            // ---------------------------------------------------------------------
            // DECISION LOGIC: PUPPETEER vs NATIVE
            // ---------------------------------------------------------------------
            // We use "Exclusion Logic" - assume everything is Binary/Fast unless it looks like a Page/Playlist
            const usePuppeteer =
              target.includes(".m3u8") ||
              target.includes("api2.php") ||
              target.includes("lk21official"); // Main site navigation

            const canUseNative = !usePuppeteer && this.cachedCookies;

            if (canUseNative) {
              try {
                // Determine if we need to use cached cookies (essential for protected streams)
                const nativeHeaders = {
                  ...finalHeaders,
                  Cookie: this.cachedCookies!,
                };

                const res = await fetch(target, { headers: nativeHeaders });

                if (res.ok) {
                  // ---------------------------------------------------------------
                  // ZERO LATENCY MODE (STREAM PUMPING) ⚡
                  // ---------------------------------------------------------------
                  // We intentionally skip JSON wrapping or Base64 encoding for video
                  // chunks to minimize latency and CPU usage.

                  // Forward Headers
                  const resHeaders: Record<string, string> = {};
                  res.headers.forEach((val, key) => {
                    resHeaders[key] = val;
                  });

                  // Log Success
                  const duration = Math.round(performance.now() - start);
                  console.log(
                    chalk.dim(`[Proxy]`) +
                      ` ${chalk.green(res.status)} ${duration}ms [NATIVE-STREAM ⚡] ${target.substring(0, 40)}...`,
                  );

                  // Return Raw Stream Immediately
                  return new Response(res.body, {
                    status: res.status,
                    headers: resHeaders,
                  });
                } else {
                  throw new Error(`Native Fetch Failed: ${res.status}`);
                }
              } catch (e) {
                // Fallback to Puppeteer below
                // Reset result so it enters the next block
                // @ts-ignore
                result = null;
              }
            }

            // ---------------------------------------------------------------------
            // STRATEGY 2: PUPPETEER (Bypass & Fallback)
            // ---------------------------------------------------------------------

            let capturedHeaders: Record<string, string> | undefined;

            // @ts-ignore
            if (!result) {
              try {
                // Logic: If we "intended" to use Puppeteer (usePuppeteer=true),
                // OR if Native failed (fallback), we come here.

                if (usePuppeteer) {
                  // Standard Fetch (HTML / M3U8)
                  // @ts-ignore
                  result = await BrowserManager.getInstance().fetch(
                    target,
                    finalHeaders,
                  );

                  // Update Cache on Success (Only for non-binary to avoid overhead, usually Auth happens on m3u8)
                  if (result.status === 200) {
                    const cookies =
                      await BrowserManager.getInstance().getCookies();
                    const ua =
                      await BrowserManager.getInstance().getUserAgent();

                    this.cachedCookies = cookies;
                    this.cachedUserAgent = ua;

                    // WORKER-FIRST STRATEGY: Expose headers to Worker
                    capturedHeaders = {
                      Cookie: cookies,
                      "User-Agent": ua,
                    };
                  }
                } else {
                  // Binary Fallback (Slow Mode for Video chunks)
                  result = await BrowserManager.getInstance().fetchBinary(
                    target,
                    finalHeaders,
                  );
                }
              } catch (e) {
                result = {
                  status: 500,
                  body: `Proxy Error: ${e}`,
                  headers: {},
                };
              }
            }

            // Auto-Healing Logic
            if (
              result.status === 500 &&
              typeof result.body === "string" &&
              result.body.includes("Session closed")
            ) {
              console.log(chalk.yellow("Session died. Restarting..."));
              await BrowserManager.getInstance().restart();
              await BrowserManager.getInstance().init(
                this.provider.baseUrl,
                this.provider.bypass,
              );
              // Retry once? (For now, let client retry)
            }

            const duration = Math.round(performance.now() - start);
            const color = result.status >= 400 ? chalk.red : chalk.green;

            let methodLog = "";
            if (result.isBinary && canUseNative && result.status === 200) {
              methodLog = `[NATIVE 🚀]`;
            } else if (usePuppeteer) {
              methodLog = `[PUPPETEER 🐢]`;
            } else {
              methodLog = `[PUPPETEER-FALLBACK ⚠️]`;
            }

            console.log(
              chalk.dim(`[Proxy]`) +
                ` ${color(result.status)} ${duration}ms ${methodLog} ${target.substring(0, 40)}...`,
            );

            // Prepare Response
            const responseData = {
              content: result.body,
              headers: result.headers,
              isBinary: !!result.isBinary,
              capturedHeaders, // <--- Expose to Worker
            };

            // We return JSON to the Worker, containing data + metadata
            return new Response(JSON.stringify(responseData), {
              status: result.status,
              headers: { "Content-Type": "application/json" },
            });
          },
        });

        // If successful, break retry loop
        console.log(chalk.green(`[Proxy] Server started on port ${this.port}`));
        return;
      } catch (e: any) {
        if (e.code === "EADDRINUSE" || e.syscall === "listen") {
          console.warn(
            chalk.yellow(
              `[Proxy] Port ${this.port} is busy. Attempting to force release (Attempt ${i + 1}/${retries})...`,
            ),
          );
          await this.killPort(this.port);
          // Wait longer for OS to release
          await new Promise((r) => setTimeout(r, 1500));
        } else {
          throw e;
        }
      }
    }

    throw new Error(
      `Failed to bind port ${this.port} after ${retries} attempts. Is another instance running?`,
    );
  }

  public async stop() {
    const spinner = ora("Stopping Services...").start();

    if (this.server) {
      this.server.stop();
      this.server = null;
    }

    if (this.tunnelProcess) {
      this.tunnelProcess.kill();
      // On Windows, sometimes tree-kill is needed, but .kill() is a start
      this.tunnelProcess = null;
    }

    await BrowserManager.getInstance().restart(); // Closes browser
    spinner.succeed(chalk.yellow("Services Stopped."));
  }

  private async startTunnel() {
    return new Promise<void>(async (resolve, reject) => {
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

      this.tunnelProcess = spawn(
        binPath,
        ["tunnel", "--url", `http://localhost:${this.port}`],
        { shell: true },
      );

      let lastUpdate = 0;
      let isResolved = false;

      this.tunnelProcess.stderr.on("data", async (data: any) => {
        const logStr = data.toString();

        // Immediate Match for Tunnel URL (Critical)
        const match = logStr.match(
          /https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/,
        );
        if (match) {
          const tunnelUrl = match[0];

          if (tunnelUrl === this.currentTunnelUrl) {
            Logger.warn("⚠️ Tunnel connection refreshed (URL maintained)...");
            return;
          }

          this.currentTunnelUrl = tunnelUrl;
          spinner.succeed(chalk.green("Tunnel Configured!"));
          console.log(chalk.yellow(`\n🚇 Tunnel: ${tunnelUrl}\n`));

          await this.registerToWorker(tunnelUrl);

          if (!isResolved) {
            isResolved = true;
            resolve();
          }
          return;
        }

        // Throttle Visual Updates (to prevent flickering)
        const now = Date.now();
        if (now - lastUpdate > 500 && !isResolved) {
          const cleanLog = logStr.replace(/\n/g, "").trim().substring(0, 50);
          if (cleanLog.length > 5) {
            // Filter out noise
            spinner.text = `Tunnel: ${cleanLog}...`;
            lastUpdate = now;
          }
        }
      });

      this.tunnelProcess.on("error", (e: any) => {
        spinner.fail("Tunnel Process Failed");
        reject(e);
      });
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
