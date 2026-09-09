import { TypeormParser } from "./typeormParser.js";
import * as fs from "fs";
import * as path from "path";
import type { TableSearcher } from "../types/table_searcher.js";

async function testParser() {
  const outputDir = "test-entities-temp";

  const mockTables: TableSearcher[] = [
    {
      name: "tiempos",
      schema: "dbo",
      objectId: 1,
      columns: [
        {
          columnId: 1,
          name: "NOMBRE DE EXAMENES",
          dataType: "nvarchar",
          maxLength: 510,
          precision: 0,
          scale: 0,
          isNullable: true,
          isIdentity: false,
          isComputed: false,
          objectId: 1,
        },
        {
          columnId: 2,
          name: "TIEMPO (HORAS)",
          dataType: "nvarchar",
          maxLength: 510,
          precision: 0,
          scale: 0,
          isNullable: true,
          isIdentity: false,
          isComputed: false,
          objectId: 1,
        },
        {
          columnId: 3,
          name: "PROCESO",
          dataType: "nvarchar",
          maxLength: 510,
          precision: 0,
          scale: 0,
          isNullable: true,
          isIdentity: false,
          isComputed: false,
          objectId: 1,
        },
      ],
      primaryKeys: [],
      foreignKeys: [],
      checkConstraints: [],
      defaultConstraints: [],
    },
  ];

  const parser = new TypeormParser(mockTables, outputDir);
  parser.parser();

  const generatedFilePath = path.join(outputDir, "tiempo.entity.ts");
  const content = fs.readFileSync(generatedFilePath, "utf8");

  // Assertions
  if (!content.includes('"NOMBRE DE EXAMENES"?: string | null;')) {
    throw new Error(
      'Test failed: "NOMBRE DE EXAMENES" was not quoted properly.',
    );
  }
  if (!content.includes('"TIEMPO (HORAS)"?: string | null;')) {
    throw new Error('Test failed: "TIEMPO (HORAS)" was not quoted properly.');
  }
  if (!content.includes("PROCESO?: string | null;")) {
    throw new Error("Test failed: PROCESO was not unquoted.");
  }

  // Cleanup
  fs.rmSync(outputDir, { recursive: true, force: true });
}

testParser().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
