import fs from "fs";
import path from "path";

const CONFIG_PATH = path.resolve(process.cwd(), "config.json");

export interface ClientConfig {
  provider: "cloudflare" | "pinggy";
  customPort: number;
  workerUrl: string;
  adminSecret: string;
}

const DEFAULT_CONFIG: ClientConfig = {
  provider: "cloudflare",
  customPort: 3000,
  workerUrl: "http://localhost:8787",
  adminSecret: "rahasia123",
};

export class ConfigManager {
  public static load(): ClientConfig {
    if (!fs.existsSync(CONFIG_PATH)) {
      return { ...DEFAULT_CONFIG };
    }
    try {
      const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }

  public static save(config: ClientConfig) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
  }

  public static validate(config: ClientConfig): string[] {
    const errors: string[] = [];

    if (!config.workerUrl) errors.push("Worker URL is missing.");
    return errors;
  }
}
