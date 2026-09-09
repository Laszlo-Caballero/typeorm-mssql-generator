#!/usr/bin/env tsx
import { parseArgs } from "node:util";
import { MssqlDriver } from "./database/MssqlDriver.js";
import { PostgresDriver } from "./database/PostgresDriver.js";
import { TypeormParser } from "./parser/typeormParser.js";
import type { IDriverParse } from "./types/driver_parser.js";
import fs from "node:fs/promises";

async function main() {
  const options = {
    driver: { type: "string" as const, short: "D", default: "mssql" },
    server: { type: "string" as const, short: "s", default: "localhost" },
    database: { type: "string" as const, short: "d" },
    user: { type: "string" as const, short: "u" },
    password: { type: "string" as const, short: "p" },
    output: {
      type: "string" as const,
      short: "o",
      default: "typeorm-entities",
    },
    encrypt: { type: "boolean" as const, short: "e", default: false },
    trust: { type: "boolean" as const, short: "t", default: true },
    port: { type: "string" as const, short: "P" },
    help: { type: "boolean" as const, short: "h" },
  };

  let values;
  try {
    const parsed = parseArgs({
      args: process.argv.slice(2),
      options,
    });
    values = parsed.values;
  } catch (error: any) {
    console.error("Error parsing arguments:", error.message);
    process.exit(1);
  }

  if (values.help) {
    console.log(`
Usage: tsx src/main.ts [options]

Options:
  -D, --driver <driver>      Database driver: mssql | postgres (default: mssql)
  -s, --server <server>      Database server (default: localhost)
  -P, --port <port>          Database port (default: 1433 for mssql, 5432 for postgres)
  -d, --database <db>        Database name (required)
  -u, --user <user>          Database user (required)
  -p, --password <password>  Database password (required)
  -o, --output <dir>         Output directory (default: typeorm-entities)
  -e, --encrypt              Enable encryption for MSSQL (default: false)
  -t, --trust                Trust server certificate for MSSQL (default: true)
  -h, --help                 Show help
    `);
    process.exit(0);
  }

  if (!values.database || !values.user || !values.password) {
    console.error(
      "Error: --database, --user, and --password are required options.",
    );
    console.error("Run with --help for usage information.");
    process.exit(1);
  }

  const driverType = values.driver?.toLowerCase() || "mssql";
  const defaultPort =
    driverType === "postgres" || driverType === "pg" ? "5432" : "1433";
  const portStr = values.port || defaultPort;
  const port = parseInt(portStr, 10);

  console.log(
    `Connecting to ${driverType} database ${values.database} on ${values.server}:${port}...`,
  );

  let driver: IDriverParse;
  if (driverType === "postgres" || driverType === "pg") {
    driver = new PostgresDriver({
      host: values.server!,
      port,
      database: values.database!,
      user: values.user!,
      password: values.password!,
    });
  } else {
    driver = new MssqlDriver({
      server: values.server!,
      port,
      database: values.database!,
      user: values.user!,
      password: values.password!,
      options: {
        encrypt: values.encrypt,
        trustServerCertificate: values.trust,
      },
    });
  }

  try {
    await driver.connect();
    console.log("Connected successfully. Extracting schema...");

    const jsonData = await driver.getAllTableDetails();

    // Optional: write output.json for debugging
    await fs.writeFile("output.json", JSON.stringify(jsonData, null, 2));

    console.log(
      `Schema extracted. Generating TypeORM entities in '${values.output}'...`,
    );

    const parser = new TypeormParser(jsonData, values.output);
    parser.parser();

    console.log(`TypeORM entities generated successfully in ${values.output}/`);
  } catch (error) {
    console.error("Error during execution:", error);
  } finally {
    await driver.disconnect();
  }
}

main().catch((error) => {
  console.error("Fatal Error:", error);
  process.exit(1);
});
