import { select, input } from "@inquirer/prompts";
import chalk from "chalk";
import ora from "ora";
import figlet from "figlet";
import gradient from "gradient-string";
// @ts-ignore
import standardFont from "./fonts/Standard.flf" with { type: "text" };
import { spawnSync } from "node:child_process";
import { ConfigManager, ClientConfig } from "./ConfigManager";
import { ClientEngine } from "./ClientEngine";
import { DeployManager } from "./DeployManager";

// WINDOWS FIX: Force UTF-8 Output
if (process.platform === "win32") {
  try {
    spawnSync("chcp", ["65001"], { stdio: "inherit", shell: true });
  } catch (e) {}
}

// Preload Font
figlet.parseFont("Standard", standardFont);

const engine = new ClientEngine();

// --- GLOBAL CLEANUP ---
const globalCleanup = async () => {
  console.log("\n[INFO] Received Exit Signal. Cleaning up...");
  await engine.stop();
  process.exit(0);
};

process.on("SIGINT", globalCleanup);
process.on("SIGTERM", globalCleanup);

// --- UI HELPERS ---

const clear = () => console.clear();

const renderHeader = () => {
  const text = figlet.textSync("ADAPTIVENET", {
    font: "Standard",
    horizontalLayout: "fitted",
  });
  console.log(gradient.pastel.multiline(text));
  console.log(chalk.bold("  AdaptiveNet Web v0.4.0"));
  console.log(chalk.dim("  Maintained by AdaptiveTeam"));
  console.log(chalk.dim("-".repeat(60)));
  console.log("");
};

// Minimal Input Helper
const renderInputBox = async (
  label: string,
  desc: string,
  defaultValue: string,
  isSecret = false,
  validate?: (val: string) => boolean | string,
) => {
  console.log(chalk.bold(label));
  console.log(chalk.dim(desc));

  const value = await input({
    message: " >",
    default: defaultValue,
    validate,
  });

  console.log("");
  return value;
};

const showMonitor = async () => {
  clear();
  renderHeader();

  // 1. Select Adapter
  const adapter = await select({
    message: "Select Content Adapter:",
    choices: [
      {
        name: "LK21 (LayarKaca21)" + chalk.green(" [STABLE]"),
        value: "lk21",
        description: "Indonesian Movie Streaming Platform",
      },
      {
        name: "Youtube Music" + chalk.red(" [UNSTABLE]"),
        value: "ytmusic",
        description: "music.youtube.com (Charts & Search)",
      },
      {
        name: "Musixmatch" + chalk.red(" [UNSTABLE]"),
        value: "musixmatch",
        description: "Lyrics & Metadata",
      },
    ],
  });

  const config = ConfigManager.load();

  // 2. Start Engine
  try {
    await engine.start(config, adapter);
  } catch (e) {
    console.log(chalk.red("[ERROR] Failed to start engine."));
    await new Promise((r) => setTimeout(r, 2000));
    return;
  }

  // 3. System Status
  console.log(
    chalk.green("[READY]") +
      "  System Online" +
      chalk.dim(" | Waiting for traffic..."),
  );
  console.log(chalk.dim("-".repeat(40)));
  console.log(chalk.dim("Controls:"));
  console.log("  Ctrl+C  Shutdown");
  console.log("  Ctrl+X  Dashboard");
  console.log("");

  // Keep alive loop
  return new Promise<void>((resolve) => {
    const cleanup = async () => {
      await engine.stop();
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeAllListeners("keypress");
    };

    const readline = require("readline");
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.resume();

    process.stdin.on("keypress", async (str, key) => {
      if (key.ctrl && key.name === "c") {
        console.log("\n" + chalk.red("[STOP] Shutting Down..."));
        await engine.stop();
        process.exit(0);
      }
      if (key.ctrl && key.name === "x") {
        console.log("\n" + chalk.yellow("[STOP] Stopping Engine..."));
        await cleanup();
        resolve();
      }
    });
  });
};

const configure = async () => {
  clear();
  renderHeader();
  console.log(chalk.bold("[CONFIGURATION DETAILS]") + "\n");

  const config = ConfigManager.load();

  // 1. Worker URL
  const newWorkerUrl = await renderInputBox(
    "Service URL",
    "Endpoint for the worker/server",
    config.workerUrl,
    false,
    (value) => (value.startsWith("http") ? true : "Must start with http(s)://"),
  );

  // 2. Admin Secret
  const newAdminSecret = await renderInputBox(
    "Access Key",
    "Secret for handshake authentication",
    config.adminSecret,
  );

  // 3. Port
  const newPortStr = await renderInputBox(
    "Local Port",
    "Port for the local proxy server",
    config.customPort.toString(),
    false,
    (value) => (!isNaN(parseInt(value)) ? true : "Must be a number"),
  );

  // 4. Provider
  console.log(chalk.bold("Tunnel Provider"));
  console.log(chalk.dim("Mechanism for exposing the connection"));

  const newProvider = (await select({
    message: " >",
    choices: [
      { name: "Cloudflare (Recommended)", value: "cloudflare" },
      { name: "Pinggy (Backup)", value: "pinggy" },
    ],
    default: config.provider,
  })) as "cloudflare" | "pinggy";

  console.log("");

  const newConfig: ClientConfig = {
    provider: newProvider,
    customPort: parseInt(newPortStr) || 3000,
    workerUrl: newWorkerUrl,
    adminSecret: newAdminSecret,
  };

  ConfigManager.save(newConfig);
  console.log(chalk.green("[OK] Configuration saved."));
  await new Promise((r) => setTimeout(r, 1000));
};

const startCLI = async () => {
  clear();
  renderHeader();

  let config = ConfigManager.load();
  const isDefault =
    config.workerUrl === "http://localhost:8787" || !config.workerUrl;

  if (isDefault) {
    console.log(chalk.yellow("[WARN] First time setup detected."));
    console.log("Proceeding to deployment and configuration...\n");
    await DeployManager.deployAndSync();
    console.log("\n[INFO] Starting configuration...");
    await new Promise((r) => setTimeout(r, 1500));
    await configure();
    console.log(chalk.green("\n[OK] Setup complete."));
    await new Promise((r) => setTimeout(r, 1500));
  }

  // Main Loop
  while (true) {
    clear();
    renderHeader();

    config = ConfigManager.load();
    const errors = ConfigManager.validate(config);

    if (errors.length > 0) {
      console.log(chalk.red("[ERROR] Configuration missing parameters."));
    } else {
      console.log(
        chalk.green("[STATUS] READY") +
          chalk.dim(`  Target: ${config.workerUrl}`),
      );
    }
    console.log("");

    const action = await select({
      message: "Main Menu",
      choices: [
        {
          name: "Start Gateway",
          value: "start",
          disabled: errors.length > 0,
          description: "Launch proxy and tunnel",
        },
        {
          name: "Redeploy Infrastructure",
          value: "deploy",
          description: "Update backend deployment",
        },
        {
          name: "Configuration",
          value: "config",
          description: "Edit settings",
        },
        {
          name: "Exit",
          value: "exit",
        },
      ],
    });

    if (action === "exit") {
      process.exit(0);
    } else if (action === "config") {
      await configure();
    } else if (action === "deploy") {
      await DeployManager.deployAndSync();
      await new Promise((r) => setTimeout(r, 2000));
    } else if (action === "start") {
      await showMonitor();
    }
  }
};

// --- ARGUMENT HANDLING ---
const args = process.argv.slice(2);

if (args.includes("--version") || args.includes("-v")) {
  console.log("v0.4.0");
  console.log("Maintained by AdaptiveTeam");
  process.exit(0);
}

if (args.includes("--help") || args.includes("-h")) {
  console.log(
    `
Usage: adaptive-net-client [options]

Options:
  -v, --version   Show version number
  -h, --help      Show help

Maintained by AdaptiveTeam
`.trim(),
  );
  process.exit(0);
}

// Start
startCLI();
