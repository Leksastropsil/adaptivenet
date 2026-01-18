export class Logger {
  static info(msg: string) {
    console.log(msg);
  }

  static warn(msg: string) {
    console.log(`\x1b[33m${msg}\x1b[0m`);
  }

  static error(msg: string) {
    console.log(`\x1b[31m${msg}\x1b[0m`);
  }
}
