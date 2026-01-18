import gradient from "gradient-string";
import chalk from "chalk";

const WORKER_URL =
  process.env.WORKER_URL ||
  "https://lk21-api.leksaandanaoktaviansaa.workers.dev";
const SLUG = "avengers-endgame-2019"; // Default test slug

async function main() {
  console.clear();
  console.log(gradient.retro.multiline("PROXY DEBUGGER"));
  console.log(chalk.dim(`Worker: ${WORKER_URL}\n`));

  console.log(chalk.yellow("1. Fetching Metadata..."));
  try {
    const res = await fetch(`${WORKER_URL}/lk21/watch/${SLUG}`);
    if (!res.ok) throw new Error(`API Error: ${res.status}`);

    interface ApiResponse {
      streams?: {
        type: string;
        url: string;
        headers?: {
          Referer?: string;
        };
      }[];
    }

    const data = (await res.json()) as ApiResponse;
    const stream = data.streams?.find((s) => s.type === "hls");

    if (!stream) {
      console.log(chalk.red("No HLS stream found."));
      return;
    }

    console.log(chalk.green("✔ Stream Found!"));
    console.log(chalk.dim(stream.url.substring(0, 60) + "..."));

    console.log(chalk.yellow("\n2. Generating Proxy Link..."));

    // Construct Proxy URL
    const target = encodeURIComponent(stream.url);
    const referer = encodeURIComponent(
      stream.headers?.Referer || "https://tv7.lk21official.cc",
    );

    const proxyUrl = `${WORKER_URL}/proxy?url=${target}&referer=${referer}`;

    console.log(gradient.vice("\n----------------------------------------"));
    console.log(chalk.bold.white("COPY & PASTE INTO VLC / PLAYER:"));
    console.log(gradient.vice("----------------------------------------\n"));

    console.log(chalk.cyan.underline(proxyUrl));
    console.log("\n");
  } catch (e) {
    console.log(chalk.red(`Error: ${e}`));
  }
}

main();
