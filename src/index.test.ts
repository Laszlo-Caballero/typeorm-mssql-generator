import { MssqlDriver } from "./database/MssqlDriver.js";
import { TypeormParser } from "./parser/typeormParser.js";
import fs from "node:fs/promises";

async function main() {
  const driver = new MssqlDriver({
    server: "localhost",
    database: "TypeOrmGeneratorTest",
    user: "usersql",
    password: "123",
    options: {
      encrypt: false,
      trustServerCertificate: true,
    },
  });
  await driver.connect();

  const jsonData = await driver.getAllTableDetails();

  await fs.writeFile("output.json", JSON.stringify(jsonData, null, 2));
  
  // Call TypeormParser
  const parser = new TypeormParser(jsonData, 'typeorm-entities');
  parser.parser();
  console.log("TypeORM entities generated successfully in typeorm-entities/");

  await driver.disconnect();
}

main().catch((error) => {
  console.error("Error:", error);
});
