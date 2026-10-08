export class ConsoleLogger {
  debug(message?: unknown, ...args: unknown[]) {
    console.debug(message, ...args);
  }

  info(message?: unknown, ...args: unknown[]) {
    console.info(message, ...args);
  }

  warn(message?: unknown, ...args: unknown[]) {
    console.warn(message, ...args);
  }

  error(message?: unknown, ...args: unknown[]) {
    console.error(message, ...args);
  }

  verbose(message?: unknown, ...args: unknown[]) {
    console.log(message, ...args);
  }

  silly(message?: unknown, ...args: unknown[]) {
    console.log(message, ...args);
  }
}

export const consoleLogger = new ConsoleLogger();
