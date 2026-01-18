import { ProxyNode } from "../../client/core/proxy-node";
import { LK21ClientProvider } from "../../client/providers/lk21";
import { YoutubeMusicClientProvider } from "../../client/providers/ytmusic";
import { MusixmatchClientProvider } from "../../client/providers/musixmatch";
import { ClientConfig } from "./ConfigManager";

// Wrapper to control the ProxyNode
export class ClientEngine {
  private proxy: ProxyNode | null = null;
  public isRunning = false;

  constructor() {}

  public async start(config: ClientConfig, adapter: string = "lk21") {
    if (this.isRunning) return;

    console.log(`Starting Engine with ${config.provider} tunnel...`);

    let contentProvider;
    switch (adapter) {
      case "lk21":
      default:
        console.log("Initializing Adapter: LayarKaca21 (LK21)...");
        contentProvider = new LK21ClientProvider();
        break;
      case "ytmusic":
        console.log("Initializing Adapter: Youtube Music...");
        contentProvider = new YoutubeMusicClientProvider();
        break;
      case "musixmatch":
        console.log("Initializing Adapter: Musixmatch...");
        contentProvider = new MusixmatchClientProvider();
        break;
    }

    this.proxy = new ProxyNode(contentProvider, {
      port: config.customPort,
      workerUrl: config.workerUrl,
      secret: config.adminSecret,
    });

    // We don't await start() indefinitely if it blocks, but ProxyNode.start()
    // usually sets up server and tunnel.
    // Assuming ProxyNode.start() is async but resolves once setup is done.
    // If it blocks (long running), we might need to not await it or await it in background?
    // ProxyNode logic: startServer() (bun serve) is non-blocking usually?
    // tunnel logic: spawns process.
    // So it should be fine.

    try {
      await this.proxy.start();
      this.isRunning = true;
    } catch (e) {
      console.error("Failed to start engine:", e);
      this.isRunning = false;
      throw e;
    }
  }

  public async stop() {
    if (!this.proxy) return;

    // console.log("Stopping Engine...");
    await this.proxy.stop();

    this.isRunning = false;
    this.proxy = null;
  }
}
