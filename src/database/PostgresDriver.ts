import pg from "pg";
import type { TableSearcher } from "../types/table_searcher.js";
import type {
  IDriverParse,
  IGetTable,
  IGetColumn,
  IGetPrimaryKey,
  IGetForeignKey,
  IGetCheckConstraint,
} from "../types/driver_parser.js";

export class PostgresDriver implements IDriverParse {
  private client: pg.Client;

  constructor(config: pg.ClientConfig) {
    this.client = new pg.Client(config);
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  async disconnect(): Promise<void> {
    await this.client.end();
  }

  async getTables(): Promise<IGetTable[]> {
    const query = `
      SELECT
        n.nspname AS "schema",
        c.relname AS "name",
        c.oid::integer AS "objectId"
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r'
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND n.nspname NOT LIKE 'pg_toast%'
      ORDER BY n.nspname, c.relname;
    `;

    const res = await this.client.query(query);
    return res.rows.map((row) => ({
      schema: row.schema,
      name: row.name,
      objectId: row.objectId,
    }));
  }

  async getColumns(schema: string, table: string): Promise<IGetColumn[]> {
    const query = `
      SELECT
        a.attnum AS "columnId",
        a.attname AS "name",
        t.typname AS "dataType",
        CASE
          WHEN a.atttypmod > 0 AND t.typname IN ('varchar', 'char', 'bpchar', 'character varying', 'character') THEN a.atttypmod - 4
          ELSE NULL
        END AS "maxLength",
        CASE
          WHEN t.typname IN ('numeric', 'decimal') AND a.atttypmod > 0 THEN ((a.atttypmod - 4) >> 16) & 65535
          ELSE NULL
        END AS "precision",
        CASE
          WHEN t.typname IN ('numeric', 'decimal') AND a.atttypmod > 0 THEN (a.atttypmod - 4) & 65535
          ELSE NULL
        END AS "scale",
        NOT a.attnotnull AS "isNullable",
        (a.attidentity != '') AS "isIdentity",
        (a.attgenerated != '') AS "isComputed",
        pg_get_expr(ad.adbin, ad.adrelid) AS "defaultValue"
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_type t ON t.oid = a.atttypid
      LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
      WHERE n.nspname = $1
        AND c.relname = $2
        AND a.attnum > 0
        AND NOT a.attisdropped
      ORDER BY a.attnum;
    `;

    const res = await this.client.query(query, [schema, table]);
    return res.rows.map((row) => ({
      columnId: row.columnId,
      name: row.name,
      dataType: this.mapPostgresDataType(row.dataType),
      maxLength: row.maxLength ? parseInt(row.maxLength, 10) : 0,
      precision: row.precision ? parseInt(row.precision, 10) : 0,
      scale: row.scale ? parseInt(row.scale, 10) : 0,
      isNullable: Boolean(row.isNullable),
      isIdentity: Boolean(row.isIdentity),
      isComputed: Boolean(row.isComputed),
      defaultValue: row.defaultValue,
    }));
  }

  async getPrimaryKeys(
    schema: string,
    table: string,
  ): Promise<IGetPrimaryKey[]> {
    const query = `
      SELECT
        con.conname AS "constraintName",
        a.attname AS "columnName",
        a.attnum AS "columnId"
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
      WHERE con.contype = 'p'
        AND n.nspname = $1
        AND c.relname = $2
      ORDER BY k.ord;
    `;

    const res = await this.client.query(query, [schema, table]);
    return res.rows.map((row) => ({
      constraintName: row.constraintName,
      columnName: row.columnName,
      columnId: row.columnId,
    }));
  }

  async getForeignKeys(
    schema: string,
    table: string,
  ): Promise<IGetForeignKey[]> {
    const query = `
      SELECT
        con.conname AS "constraintName",
        n1.nspname AS "tableSchema",
        c1.relname AS "tableName",
        a1.attname AS "columnName",
        a1.attnum AS "columnId",
        n2.nspname AS "referencedSchema",
        c2.relname AS "referencedTable",
        a2.attname AS "referencedColumn",
        a2.attnum AS "referenceColumnId",
        c1.oid::integer AS "tableObjectId",
        c2.oid::integer AS "referencedTableObjectId"
      FROM pg_constraint con
      JOIN pg_class c1 ON c1.oid = con.conrelid
      JOIN pg_namespace n1 ON n1.oid = c1.relnamespace
      JOIN pg_class c2 ON c2.oid = con.confrelid
      JOIN pg_namespace n2 ON n2.oid = c2.relnamespace
      JOIN LATERAL unnest(con.conkey, con.confkey) WITH ORDINALITY AS k(attnum, refattnum, ord) ON true
      JOIN pg_attribute a1 ON a1.attrelid = c1.oid AND a1.attnum = k.attnum
      JOIN pg_attribute a2 ON a2.attrelid = c2.oid AND a2.attnum = k.refattnum
      WHERE con.contype = 'f'
        AND n1.nspname = $1
        AND c1.relname = $2
      ORDER BY con.conname, k.ord;
    `;

    const res = await this.client.query(query, [schema, table]);
    return res.rows.map((row) => ({
      constraintName: row.constraintName,
      tableSchema: row.tableSchema,
      tableName: row.tableName,
      columnName: row.columnName,
      columnId: row.columnId,
      referencedSchema: row.referencedSchema,
      referencedTable: row.referencedTable,
      referencedColumn: row.referencedColumn,
      referenceColumnId: row.referenceColumnId,
      tableObjectId: row.tableObjectId,
      referencedTableObjectId: row.referencedTableObjectId,
    }));
  }

  async getCheckConstraints(
    schema: string,
    table: string,
  ): Promise<IGetCheckConstraint[]> {
    const query = `
      SELECT
        con.conname AS "constraintName",
        pg_get_constraintdef(con.oid) AS "definition",
        c.oid::integer AS "parent_object_id",
        COALESCE(con.conkey[1], 0) AS "columnId"
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE con.contype = 'c'
        AND n.nspname = $1
        AND c.relname = $2;
    `;

    const res = await this.client.query(query, [schema, table]);
    return res.rows.map((row) => ({
      constraintName: row.constraintName,
      definition: row.definition,
      parent_object_id: row.parent_object_id,
      columnId: row.columnId,
    }));
  }

  async getAllTableDetails(): Promise<TableSearcher[]> {
    const tables = await this.getTables();
    const tableMap = new Map<number, TableSearcher>();

    for (const t of tables) {
      tableMap.set(t.objectId, {
        schema: t.schema,
        name: t.name,
        objectId: t.objectId,
        columns: [],
        primaryKeys: [],
        foreignKeys: [],
        checkConstraints: [],
        defaultConstraints: [],
      });
    }

    const columnsQuery = `
      SELECT
        c.oid::integer AS "tableObjectId",
        a.attnum AS "columnId",
        a.attname AS "name",
        t.typname AS "dataType",
        CASE
          WHEN a.atttypmod > 0 AND t.typname IN ('varchar', 'char', 'bpchar', 'character varying', 'character') THEN a.atttypmod - 4
          ELSE NULL
        END AS "maxLength",
        CASE
          WHEN t.typname IN ('numeric', 'decimal') AND a.atttypmod > 0 THEN ((a.atttypmod - 4) >> 16) & 65535
          ELSE NULL
        END AS "precision",
        CASE
          WHEN t.typname IN ('numeric', 'decimal') AND a.atttypmod > 0 THEN (a.atttypmod - 4) & 65535
          ELSE NULL
        END AS "scale",
        NOT a.attnotnull AS "isNullable",
        (a.attidentity != '') AS "isIdentity",
        (a.attgenerated != '') AS "isComputed",
        pg_get_expr(ad.adbin, ad.adrelid) AS "defaultValue"
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_type t ON t.oid = a.atttypid
      LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
      WHERE c.relkind = 'r'
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND n.nspname NOT LIKE 'pg_toast%'
        AND a.attnum > 0
        AND NOT a.attisdropped
      ORDER BY c.oid, a.attnum;
    `;

    const pkQuery = `
      SELECT
        c.oid::integer AS "tableObjectId",
        con.conname AS "constraintName",
        a.attname AS "columnName",
        a.attnum AS "columnId"
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
      WHERE con.contype = 'p'
        AND c.relkind = 'r'
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND n.nspname NOT LIKE 'pg_toast%'
      ORDER BY c.oid, k.ord;
    `;

    const fkQuery = `
      SELECT
        con.conname AS "constraintName",
        n1.nspname AS "tableSchema",
        c1.relname AS "tableName",
        a1.attname AS "columnName",
        a1.attnum AS "columnId",
        n2.nspname AS "referencedSchema",
        c2.relname AS "referencedTable",
        a2.attname AS "referencedColumn",
        a2.attnum AS "referenceColumnId",
        c1.oid::integer AS "tableObjectId",
        c2.oid::integer AS "referencedTableObjectId"
      FROM pg_constraint con
      JOIN pg_class c1 ON c1.oid = con.conrelid
      JOIN pg_namespace n1 ON n1.oid = c1.relnamespace
      JOIN pg_class c2 ON c2.oid = con.confrelid
      JOIN pg_namespace n2 ON n2.oid = c2.relnamespace
      JOIN LATERAL unnest(con.conkey, con.confkey) WITH ORDINALITY AS k(attnum, refattnum, ord) ON true
      JOIN pg_attribute a1 ON a1.attrelid = c1.oid AND a1.attnum = k.attnum
      JOIN pg_attribute a2 ON a2.attrelid = c2.oid AND a2.attnum = k.refattnum
      WHERE con.contype = 'f'
        AND c1.relkind = 'r'
        AND n1.nspname NOT IN ('pg_catalog', 'information_schema')
        AND n1.nspname NOT LIKE 'pg_toast%';
    `;

    const ccQuery = `
      SELECT
        c.oid::integer AS "tableObjectId",
        con.conname AS "constraintName",
        pg_get_constraintdef(con.oid) AS "definition",
        COALESCE(con.conkey[1], 0) AS "columnId"
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE con.contype = 'c'
        AND c.relkind = 'r'
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND n.nspname NOT LIKE 'pg_toast%';
    `;

    const dcQuery = `
      SELECT
        c.oid::integer AS "tableObjectId",
        ('DF_' || c.relname || '_' || a.attname) AS "constraintName",
        pg_get_expr(ad.adbin, ad.adrelid) AS "definition",
        a.attnum AS "columnId"
      FROM pg_attrdef ad
      JOIN pg_class c ON c.oid = ad.adrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = ad.adrelid AND a.attnum = ad.adnum
      WHERE c.relkind = 'r'
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND n.nspname NOT LIKE 'pg_toast%';
    `;

    console.log(`Found ${tables.length} Postgres tables. Fetching columns...`);
    const columnsRes = await this.client.query(columnsQuery);

    console.log("Fetching primary keys...");
    const pkRes = await this.client.query(pkQuery);

    console.log("Fetching foreign keys...");
    const fkRes = await this.client.query(fkQuery);

    console.log("Fetching check constraints...");
    const ccRes = await this.client.query(ccQuery);

    console.log("Fetching default constraints...");
    const dcRes = await this.client.query(dcQuery);

    console.log("Assembling metadata in memory...");

    for (const row of columnsRes.rows) {
      const table = tableMap.get(row.tableObjectId);
      if (table) {
        table.columns.push({
          columnId: row.columnId,
          name: row.name,
          dataType: this.mapPostgresDataType(row.dataType),
          maxLength: row.maxLength ? parseInt(row.maxLength, 10) : 0,
          precision: row.precision ? parseInt(row.precision, 10) : 0,
          scale: row.scale ? parseInt(row.scale, 10) : 0,
          isNullable: Boolean(row.isNullable),
          isIdentity: Boolean(row.isIdentity),
          isComputed: Boolean(row.isComputed),
          defaultValue: row.defaultValue,
          objectId: row.tableObjectId,
        });
      }
    }

    for (const row of pkRes.rows) {
      const table = tableMap.get(row.tableObjectId);
      if (table) {
        table.primaryKeys.push({
          constraintName: row.constraintName,
          columnName: row.columnName,
          columnId: row.columnId,
        });
      }
    }

    for (const row of fkRes.rows) {
      const table = tableMap.get(row.tableObjectId);
      if (table) {
        table.foreignKeys.push({
          constraintName: row.constraintName,
          tableSchema: row.tableSchema,
          tableName: row.tableName,
          columnName: row.columnName,
          columnId: row.columnId,
          referencedSchema: row.referencedSchema,
          referencedTable: row.referencedTable,
          referencedColumn: row.referencedColumn,
          referenceColumnId: row.referenceColumnId,
          tableObjectId: row.tableObjectId,
          referencedTableObjectId: row.referencedTableObjectId,
        });
      }
    }

    for (const row of ccRes.rows) {
      const table = tableMap.get(row.tableObjectId);
      if (table) {
        table.checkConstraints.push({
          constraintName: row.constraintName,
          definition: row.definition,
          parent_object_id: row.tableObjectId,
          columnId: row.columnId,
        });
      }
    }

    for (const row of dcRes.rows) {
      const table = tableMap.get(row.tableObjectId);
      if (table) {
        table.defaultConstraints.push({
          constraintName: row.constraintName,
          definition: row.definition,
          columnId: row.columnId,
        });
      }
    }

    return Array.from(tableMap.values());
  }

  private mapPostgresDataType(dataType: string): string {
    switch (dataType.toLowerCase()) {
      case "int2":
      case "smallint":
        return "smallint";
      case "int4":
      case "integer":
      case "int":
        return "int";
      case "int8":
      case "bigint":
        return "bigint";
      case "bool":
      case "boolean":
        return "boolean";
      case "bpchar":
      case "char":
      case "character":
        return "char";
      case "varchar":
      case "character varying":
        return "varchar";
      case "float4":
      case "real":
        return "real";
      case "float8":
      case "double precision":
        return "float";
      case "numeric":
      case "decimal":
        return "decimal";
      case "timestamptz":
      case "timestamp with time zone":
      case "timestamp without time zone":
      case "timestamp":
        return "timestamp";
      case "timetz":
      case "time without time zone":
      case "time with time zone":
        return "time";
      default:
        return dataType;
    }
  }
}
