import { ProxyNode } from "./core/proxy-node";
import { LK21ClientProvider } from "./providers/lk21";
import { IClientProvider } from "./core/types";
import figlet from "figlet";
import gradient from "gradient-string";
import inquirer from "inquirer";
import chalk from "chalk";

// REGISTRY
const providers: IClientProvider[] = [
  new LK21ClientProvider(),
  // new IdlixClientProvider()
];

async function main() {
  console.clear();
  console.log(gradient.pastel.multiline(figlet.textSync("ADAPTER CLIENT")));
  console.log(chalk.dim("Select an adapter to start the proxy node.\n"));

  const { adapterName } = await inquirer.prompt([
    {
      type: "list",
      name: "adapterName",
      message: "Choose Adapter:",
      choices: providers.map((p) => p.name),
    },
  ]);

  const selected = providers.find((p) => p.name === adapterName);

  if (!selected) {
    console.log(chalk.red("Error: Adapter not found."));
    process.exit(1);
  }

  // VALIDATION
  if (!selected.isConfigured()) {
    console.log(
      chalk.red(`\n❌ Adapter '${selected.name}' is NOT Configured!`),
    );
    console.log(
      chalk.yellow(`Please check your .env file or provider settings.`),
    );
    process.exit(1);
  }

  // START
  console.clear();
  console.log(
    gradient.vice(`\nStarting ${selected.name.toUpperCase()} Adapter...\n`),
  );

  const node = new ProxyNode(selected);
  await node.start();
}

main();
