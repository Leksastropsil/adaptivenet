import { select, input } from "@inquirer/prompts";
import chalk from "chalk";
import figlet from "figlet";
// @ts-ignore
import standardFont from "./fonts/Standard.flf" with { type: "text" };
import ora from "ora";
import gradient from "gradient-string";
import { spawnSync } from "node:child_process";
import { ConfigManager, ClientConfig } from "./ConfigManager";
import { ClientEngine } from "./ClientEngine";
import { DeployManager } from "./DeployManager";

// Preload Font for EXE Bundle support
figlet.parseFont("Standard", standardFont);

// WINDOWS FIX: Force UTF-8 Output for Emojis
if (process.platform === "win32") {
  try {
    spawnSync("chcp", ["65001"], { stdio: "inherit", shell: true });
  } catch (e) {
    // Ignore if fails
  }
}

const engine = new ClientEngine();

// --- UI HELPERS ---

const clear = () => console.clear();

const renderTitle = () => {
  const text = figlet.textSync("ADAPTIVENET", {
    font: "Standard",
    horizontalLayout: "fitted",
  });
  console.log(gradient.pastel.multiline(text));
  console.log(
    gradient.cristal(
      "  Universal Stream Gateway Client v2.1 | Enterprise Edition",
    ),
  );
  console.log(chalk.dim("  " + "=".repeat(60)));
  console.log("");
};

// TUI Helper: Render Input Panel (Minimal Style)
const renderInputBox = async (
  label: string,
  desc: string,
  defaultValue: string,
  isSecret = false,
  validate?: (val: string) => boolean | string,
) => {
  const width = 60;
  // Header: Neon Blue Line
  console.log(
    " " +
      chalk.bold.white(label) +
      chalk.hex("#3b8eea")(" " + "─".repeat(width - label.length)),
  );
  // Description
  console.log(" " + chalk.dim(desc));

  const value = await input({
    message: chalk.hex("#00ff99")(" └─>"),
    default: defaultValue,
    validate,
    theme: {
      prefix: "",
    },
  });

  console.log(""); // Spacer
  return value;
};

const showMonitor = async () => {
  clear();
  renderTitle();

  // 1. Select Adapter FIRST
  const adapter = await select({
    message: chalk.hex("#3b8eea")("Select Content Adapter"),
    choices: [
      {
        name: "🎬 LK21 (LayarKaca21)",
        value: "lk21",
        description: "Indonesian Movie Streaming Platform",
      },
    ],
  });

  const config = ConfigManager.load();

  // 2. Start Engine
  try {
    await engine.start(config, adapter);
  } catch (e) {
    console.log(chalk.red("Failed to start engine."));
    await new Promise((r) => setTimeout(r, 2000));
    return;
  }

  // 3. System Online Dashboard (Cleaner Look)
  console.log(
    chalk.bold.hex("#00ff99")(" ● SYSTEM ONLINE ") +
      " " +
      chalk.dim("Waiting for traffic..."),
  );
  console.log(
    chalk.dim("Press ") +
      chalk.bold.hex("#3b8eea")("CTRL+C") +
      chalk.dim(" to Shutdown") +
      "  |  " +
      chalk.dim("Press ") +
      chalk.bold.hex("#3b8eea")("CTRL+X") +
      chalk.dim(" for Dashboard"),
  );
  console.log(chalk.dim("-".repeat(60)));

  // Keep alive loop until SIGINT/CTRL+X

  // Keep alive loop until SIGINT/CTRL+X
  return new Promise<void>((resolve) => {
    const cleanup = async () => {
      await engine.stop();
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeAllListeners("keypress");
    };

    // Setup Keypress
    const readline = require("readline");
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.resume();

    process.stdin.on("keypress", async (str, key) => {
      if (key.ctrl && key.name === "c") {
        // CTRL + C -> Shutdown Completely
        console.log("\n" + chalk.red("🔻 Shutting Down (Force)..."));
        await cleanup();
        process.exit(0);
      }
      if (key.ctrl && key.name === "x") {
        // CTRL + X -> Back to Dashboard
        console.log("\n" + chalk.yellow("🔻 Stopping Engine..."));
        await cleanup();
        resolve(); // Returns to main loop
      }
    });
  });
};

const configure = async () => {
  clear();
  renderTitle();
  console.log(chalk.bgBlue.black.bold(" CONFIGURATION MODE ") + "\n");

  const config = ConfigManager.load();

  // 1. Worker URL
  const newWorkerUrl = await renderInputBox(
    "📡 Service URL",
    "Your deployed Worker/Vercel link",
    config.workerUrl,
    false,
    (value) =>
      value.startsWith("http")
        ? true
        : "URL must start with http:// or https://",
  );

  // 2. Admin Secret
  const newAdminSecret = await renderInputBox(
    "🔑 Access Key",
    "Secret used for secure handshake",
    config.adminSecret,
  );

  // 3. Port
  const newPortStr = await renderInputBox(
    "🔌 Local Port",
    "Port for this machine's proxy",
    config.customPort.toString(),
    false,
    (value) => (!isNaN(parseInt(value)) ? true : "Port must be a number"),
  );

  // 4. Provider (Manual Box for Select)
  const width = 60;
  const label = "🚇 Tunneling";
  console.log(
    " " +
      chalk.bold.white(label) +
      chalk.hex("#3b8eea")(" " + "─".repeat(width - label.length)),
  );
  console.log(" " + chalk.dim("How to expose this connection"));

  const newProvider = (await select({
    message: chalk.hex("#00ff99")(" └─>"),
    choices: [
      { name: "Cloudflare (Stable)", value: "cloudflare" },
      { name: "Pinggy (Backup)", value: "pinggy" },
    ],
    default: config.provider,
    theme: { prefix: "" },
  })) as "cloudflare" | "pinggy";

  console.log("");

  const newConfig: ClientConfig = {
    provider: newProvider,
    customPort: parseInt(newPortStr) || 3000,
    workerUrl: newWorkerUrl,
    adminSecret: newAdminSecret,
  };

  ConfigManager.save(newConfig);
  console.log(chalk.green("\n✔ Configuration Saved Successfully!"));
  await new Promise((r) => setTimeout(r, 1000));
};

const startCLI = async () => {
  clear();
  renderTitle();

  let config = ConfigManager.load();
  const isDefault =
    config.workerUrl === "http://localhost:8787" || !config.workerUrl;

  if (isDefault) {
    console.log(chalk.yellow("⚡ First Setup Detected"));
    console.log(
      chalk.dim(
        "   We need to deploy your backend and configure the client.\n",
      ),
    );

    // 1. Force Deployment
    await DeployManager.deployAndSync();

    // 2. Force Configuration (Re-load to get the synced URL)
    console.log(chalk.blue("\n⚙️  Proceeding to Configuration..."));
    await new Promise((r) => setTimeout(r, 1500));
    await configure();

    console.log(chalk.green("\n✅ Setup Complete! Entering Dashboard..."));
    await new Promise((r) => setTimeout(r, 1500));
  }

  // Main Loop
  while (true) {
    clear();
    renderTitle();

    // Status Dashboard
    config = ConfigManager.load(); // Refresh config
    const errors = ConfigManager.validate(config);

    if (errors.length > 0) {
      console.log(
        chalk.bold.hex("#ff5555")(" ● CONFIG REQUIRED ") +
          " " +
          chalk.red("Missing parameters"),
      );
    } else {
      console.log(
        chalk.bold.hex("#00ff99")(" ● READY ") +
          chalk.hex("#3b8eea")(`  Target: ${config.workerUrl}`),
      );
    }
    console.log("");

    const action = await select({
      message: chalk.hex("#3b8eea").bold("MAIN MENU"),
      choices: [
        {
          name:
            chalk.hex("#00ff99")("📡") +
            chalk.bold.white(" Start Gateway") +
            chalk.dim("       Launch Proxy & Tunnel"),
          value: "start",
          disabled: errors.length > 0,
        },
        {
          name:
            chalk.hex("#00ff99")("🚀") +
            chalk.bold.white(" Redeploy") +
            chalk.dim("            Auto-Detect / Cloud / VPS"),
          value: "deploy",
        },
        {
          name:
            chalk.hex("#00ff99")("⚙️ ") +
            chalk.bold.white(" Configuration") +
            chalk.dim("      Server & Tunnel Settings"),
          value: "config",
        },
        {
          name: chalk.gray("🚪 Exit"),
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

// Start
startCLI();
