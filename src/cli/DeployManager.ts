import { spawn } from "child_process";
import chalk from "chalk";
import ora from "ora";
import fs from "fs";
import path from "path";
import { select } from "@inquirer/prompts";
import { ConfigManager } from "./ConfigManager";

export class DeployManager {
  private static getAutoConfig(): {
    cmd: string;
    args: string[];
    label: string;
  } {
    const cwd = process.cwd();

    // 1. Cloudflare Workers
    if (fs.existsSync(path.join(cwd, "wrangler.toml"))) {
      return {
        cmd: process.platform === "win32" ? "npx.cmd" : "npx",
        args: ["wrangler", "deploy", "--minify", "src/index.ts"],
        label: "Cloudflare (Wrangler detected)",
      };
    }

    // 2. Vercel
    if (fs.existsSync(path.join(cwd, "vercel.json"))) {
      return {
        cmd: process.platform === "win32" ? "npx.cmd" : "npx",
        args: ["vercel", "--prod"],
        label: "Vercel (vercel.json detected)",
      };
    }

    // 3. Docker
    if (
      fs.existsSync(path.join(cwd, "Dockerfile")) ||
      fs.existsSync(path.join(cwd, "docker-compose.yml"))
    ) {
      // Check if there is a deploy script, otherwise warn/default
      const pkg = JSON.parse(
        fs.readFileSync(path.join(cwd, "package.json"), "utf-8"),
      );
      if (pkg.scripts && pkg.scripts.deploy) {
        return {
          cmd: "npm",
          args: ["run", "deploy"],
          label: "Docker/Generic (Dockerfile + deploy script)",
        };
      }
    }

    // 4. Generic 'npm run deploy'
    try {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(cwd, "package.json"), "utf-8"),
      );
      if (pkg.scripts && pkg.scripts.deploy) {
        return {
          cmd: "npm",
          args: ["run", "deploy"],
          label: "Generic Script (npm run deploy)",
        };
      }
    } catch {}

    throw new Error(
      "No known deployment config found (Wrangler/Vercel/Dockerfile/package.json).",
    );
  }

  public static async deployAndSync() {
    console.log("");
    const cwd = process.cwd();
    const hasWrangler = fs.existsSync(path.join(cwd, "wrangler.toml"));
    const hasVercel = fs.existsSync(path.join(cwd, "vercel.json"));
    const hasDocker =
      fs.existsSync(path.join(cwd, "Dockerfile")) ||
      fs.existsSync(path.join(cwd, "docker-compose.yml"));

    const mode = await select({
      message: chalk.bold("SELECT DEPLOYMENT MODE"),
      choices: [
        {
          name: "✨ Auto-Detect (Smart)",
          value: "auto",
          description:
            "Automatically identifies configuration files (wrangler.toml, vercel.json, package.json)",
        },
        {
          name: "⚡ Cloudflare Workers",
          value: "cloudflare",
          description:
            "Deploys to Cloudflare Edge Network using 'wrangler deploy'",
          disabled: !hasWrangler
            ? chalk.yellow("(⚠️ No wrangler.toml)")
            : false,
        },
        {
          name: "▲ Vercel Serverless",
          value: "vercel",
          description: "Deploys to Vercel Infrastructure using 'vercel --prod'",
          disabled: !hasVercel ? chalk.yellow("(⚠️ No vercel.json)") : false,
        },
        {
          name: "🐳 Docker / Generic",
          value: "generic",
          description:
            "Executes custom 'npm run deploy' script for VPS or Container environments",
          disabled: !hasDocker ? chalk.yellow("(⚠️ No Dockerfile)") : false,
        },
      ],
    });

    let deployConfig;

    if (mode === "auto") {
      try {
        deployConfig = this.getAutoConfig();
      } catch (e: any) {
        console.log(chalk.red(`\n❌ Auto-detect failed: ${e.message}`));
        return;
      }
    } else if (mode === "cloudflare") {
      deployConfig = {
        cmd: process.platform === "win32" ? "npx.cmd" : "npx",
        args: ["wrangler", "deploy", "--minify", "src/index.ts"],
        label: "Cloudflare (Manual)",
      };
    } else if (mode === "vercel") {
      deployConfig = {
        cmd: process.platform === "win32" ? "npx.cmd" : "npx",
        args: ["vercel", "--prod"],
        label: "Vercel (Manual)",
      };
    } else {
      // Generic
      deployConfig = {
        cmd: "npm",
        args: ["run", "deploy"],
        label: "Generic/Docker (npm run deploy)",
      };
    }

    console.log(chalk.blue(`\n🚀 Initializing: ${deployConfig.label}`));
    console.log(
      chalk.dim(
        `   Command: ${deployConfig.cmd} ${deployConfig.args.join(" ")}\n`,
      ),
    );

    return new Promise<void>((resolve, reject) => {
      // Use pipe to capture output
      const deployProcess = spawn(deployConfig.cmd, deployConfig.args, {
        shell: true,
        stdio: "pipe",
      });
      const spinner = ora(`Deploying...`).start();

      let outputBuffer = "";

      const onData = (data: Buffer) => {
        const str = data.toString();
        outputBuffer += str;
      };

      deployProcess.stdout.on("data", onData);
      deployProcess.stderr.on("data", onData);

      deployProcess.on("close", (code) => {
        if (code === 0) {
          spinner.succeed("Deployment Successful!");

          // Universal URL Regex: http/https, ignores localhost/127.0.0.1
          const urlRegex =
            /https?:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)(?:[\w-]+\.)+[\w-]+(?::\d+)?(?:\/)?/g;

          const matches = outputBuffer.match(urlRegex);

          if (matches && matches.length > 0) {
            // Pick the last URL found (typically the final "Available at/Deployed to:" url)
            const newUrl = matches[matches.length - 1].replace(/\/$/, "");

            console.log(
              chalk.green(`\n🔎 Detected Endpoint: ${chalk.bold(newUrl)}`),
            );

            const config = ConfigManager.load();
            if (config.workerUrl !== newUrl) {
              config.workerUrl = newUrl;
              ConfigManager.save(config);
              console.log(
                chalk.green("✅ Configuration synced automatically."),
              );
            } else {
              console.log(chalk.dim("✅ Configuration already up to date."));
            }
          } else {
            console.log(
              chalk.yellow(
                "⚠️ Verification: No public URL detected in output.",
              ),
            );
          }
          resolve();
        } else {
          spinner.fail(`Deployment Failed (Code ${code})`);
          console.error(chalk.red("\n--- Deployment Log ---\n" + outputBuffer));
          reject(new Error("Deployment failed"));
        }
      });
    });
  }
}
