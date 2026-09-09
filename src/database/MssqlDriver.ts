import mssql from "mssql";
import type { TableSearcher } from "../types/table_searcher.js";
import type { IDriverParse } from "../types/driver_parser.js";

export class MssqlDriver implements IDriverParse {
  private connection: mssql.ConnectionPool;

  constructor(private readonly config: mssql.config) {
    this.connection = new mssql.ConnectionPool({
      requestTimeout: 120000,
      connectionTimeout: 30000,
      ...config,
      options: {
        requestTimeout: 120000,
        ...config.options,
      },
    });
  }

  async connect() {
    await this.connection.connect();
  }

  async disconnect() {
    await this.connection.close();
  }

  async getTables() {
    const query = `
        SELECT
        s.name AS SchemaName,
        t.name AS TableName,
        t.object_id AS TableObjectId
    FROM sys.tables t
    INNER JOIN sys.schemas s
        ON t.schema_id = s.schema_id
    WHERE t.is_ms_shipped = 0
    ORDER BY s.name, t.name;
    `;

    const result = await this.connection.query(query);

    const tables = result.recordset.map((row) => ({
      schema: row.SchemaName,
      name: row.TableName,
      objectId: row.TableObjectId,
    }));

    return tables;
  }

  async getColumns(schema: string, table: string) {
    const query = `
      SELECT
    c.column_id,
    c.name,
    ty.name AS DataType,
    c.max_length,
    c.precision,
    c.scale,
    c.is_nullable,
    c.is_identity,
    c.is_computed,
    dc.definition AS DefaultValue
FROM sys.columns c
INNER JOIN sys.types ty
ON c.user_type_id = ty.user_type_id
LEFT JOIN sys.default_constraints dc
ON c.default_object_id = dc.object_id
WHERE c.object_id = OBJECT_ID('${schema}.${table}')
ORDER BY c.column_id;
    `;

    const result = await this.connection.query(query);

    const columns = result.recordset.map((row) => ({
      columnId: row.column_id,
      name: row.name,
      dataType: row.DataType,
      maxLength: row.max_length,
      precision: row.precision,
      scale: row.scale,
      isNullable: row.is_nullable,
      isIdentity: row.is_identity,
      isComputed: row.is_computed,
      defaultValue: row.DefaultValue,
    }));

    return columns;
  }

  async getPrimaryKeys(schema: string, table: string) {
    const query = `
    SELECT
    kc.name,
    c.column_id,
    c.name AS ColumnName
FROM sys.key_constraints kc
INNER JOIN sys.index_columns ic
    ON kc.parent_object_id = ic.object_id
    AND kc.unique_index_id = ic.index_id
INNER JOIN sys.columns c
    ON ic.object_id = c.object_id
    AND ic.column_id = c.column_id
WHERE kc.type = 'PK'
AND kc.parent_object_id = OBJECT_ID('${schema}.${table}');
`;

    const result = await this.connection.query(query);

    const primaryKeys = result.recordset.map((row) => ({
      constraintName: row.name,
      columnName: row.ColumnName,
      columnId: row.column_id,
    }));

    return primaryKeys;
  }

  async getForeignKeys(schema: string, table: string) {
    const query = `
    
SELECT
    fk.name,
    OBJECT_SCHEMA_NAME(fk.parent_object_id) AS TableSchema,
    OBJECT_NAME(fk.parent_object_id) AS TableName,
    fk.parent_object_id AS TableObjectId,
    pc.name AS ColumnName,
    pc.column_id as ColumnId,
    OBJECT_SCHEMA_NAME(fk.referenced_object_id) AS ReferencedSchema,
    OBJECT_NAME(fk.referenced_object_id) AS ReferencedTable,
    fk.referenced_object_id AS ReferencedTableObjectId,
    rc.name AS ReferencedColumn,
    rc.column_id as ReferenceColumnId
FROM sys.foreign_keys fk
INNER JOIN sys.foreign_key_columns fkc
ON fk.object_id = fkc.constraint_object_id
INNER JOIN sys.columns pc
ON pc.object_id = fkc.parent_object_id
AND pc.column_id = fkc.parent_column_id
INNER JOIN sys.columns rc
ON rc.object_id = fkc.referenced_object_id
AND rc.column_id = fkc.referenced_column_id
WHERE fk.parent_object_id = OBJECT_ID('${schema}.${table}');
    `;

    const result = await this.connection.query(query);

    const foreignKeys = result.recordset.map((row) => ({
      constraintName: row.name,
      tableSchema: row.TableSchema,
      tableName: row.TableName,
      columnName: row.ColumnName,
      columnId: row.ColumnId,
      referencedSchema: row.ReferencedSchema,
      referencedTable: row.ReferencedTable,
      referencedColumn: row.ReferencedColumn,
      referenceColumnId: row.ReferenceColumnId,
      tableObjectId: row.TableObjectId,
      referencedTableObjectId: row.ReferencedTableObjectId,
    }));

    return foreignKeys;
  }

  async getCheckConstraints(schema: string, table: string) {
    const query = `
        SELECT
        cc.name,
        cc.definition,
        cc.parent_object_id,
        cc.parent_column_id as columnId
    FROM sys.check_constraints cc
    WHERE cc.parent_object_id = OBJECT_ID('${schema}.${table}');
    `;

    const result = await this.connection.query(query);

    const checkConstraints = result.recordset.map((row) => ({
      constraintName: row.name,
      definition: row.definition,
      parent_object_id: row.parent_object_id,
      columnId: row.columnId,
    }));

    return checkConstraints;
  }

  async getDefaultConstraints(schema: string, table: string) {
    const query = `
    SELECT
        c.name,
        dc.definition,
        c.column_id
    FROM sys.default_constraints dc
    INNER JOIN sys.columns c
    ON dc.parent_object_id = c.object_id
    AND dc.parent_column_id = c.column_id
    WHERE dc.parent_object_id = OBJECT_ID('${schema}.${table}');
    `;

    const result = await this.connection.query(query);

    const defaultConstraints = result.recordset.map((row) => ({
      constraintName: row.name,
      definition: row.definition,
      columnId: row.column_id,
    }));

    return defaultConstraints;
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
        c.object_id AS TableObjectId,
        c.column_id AS ColumnId,
        c.name AS Name,
        ty.name AS DataType,
        c.max_length AS MaxLength,
        c.precision AS Precision,
        c.scale AS Scale,
        c.is_nullable AS IsNullable,
        c.is_identity AS IsIdentity,
        c.is_computed AS IsComputed,
        dc.definition AS DefaultValue
      FROM sys.columns c
      INNER JOIN sys.tables t ON c.object_id = t.object_id AND t.is_ms_shipped = 0
      INNER JOIN sys.types ty ON c.user_type_id = ty.user_type_id
      LEFT JOIN sys.default_constraints dc ON c.default_object_id = dc.object_id
      ORDER BY c.object_id, c.column_id;
    `;

    const pkQuery = `
      SELECT
        kc.parent_object_id AS TableObjectId,
        kc.name AS ConstraintName,
        c.column_id AS ColumnId,
        c.name AS ColumnName
      FROM sys.key_constraints kc
      INNER JOIN sys.tables t ON kc.parent_object_id = t.object_id AND t.is_ms_shipped = 0
      INNER JOIN sys.index_columns ic
        ON kc.parent_object_id = ic.object_id
        AND kc.unique_index_id = ic.index_id
      INNER JOIN sys.columns c
        ON ic.object_id = c.object_id
        AND ic.column_id = c.column_id
      WHERE kc.type = 'PK';
    `;

    const fkQuery = `
      SELECT
        fk.name AS ConstraintName,
        ps.name AS TableSchema,
        pt.name AS TableName,
        fk.parent_object_id AS TableObjectId,
        pc.name AS ColumnName,
        pc.column_id AS ColumnId,
        rs.name AS ReferencedSchema,
        rt.name AS ReferencedTable,
        fk.referenced_object_id AS ReferencedTableObjectId,
        rc.name AS ReferencedColumn,
        rc.column_id AS ReferenceColumnId
      FROM sys.foreign_keys fk
      INNER JOIN sys.tables pt ON fk.parent_object_id = pt.object_id AND pt.is_ms_shipped = 0
      INNER JOIN sys.schemas ps ON pt.schema_id = ps.schema_id
      INNER JOIN sys.tables rt ON fk.referenced_object_id = rt.object_id
      INNER JOIN sys.schemas rs ON rt.schema_id = rs.schema_id
      INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
      INNER JOIN sys.columns pc ON pc.object_id = fkc.parent_object_id AND pc.column_id = fkc.parent_column_id
      INNER JOIN sys.columns rc ON rc.object_id = fkc.referenced_object_id AND rc.column_id = fkc.referenced_column_id;
    `;

    const ccQuery = `
      SELECT
        cc.parent_object_id AS TableObjectId,
        cc.name AS ConstraintName,
        cc.definition AS Definition,
        cc.parent_column_id AS ColumnId
      FROM sys.check_constraints cc
      INNER JOIN sys.tables t ON cc.parent_object_id = t.object_id AND t.is_ms_shipped = 0;
    `;

    const dcQuery = `
      SELECT
        c.object_id AS TableObjectId,
        dc.name AS ConstraintName,
        dc.definition AS Definition,
        c.column_id AS ColumnId
      FROM sys.default_constraints dc
      INNER JOIN sys.tables t ON dc.parent_object_id = t.object_id AND t.is_ms_shipped = 0
      INNER JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id;
    `;

    console.log(`Found ${tables.length} tables. Fetching database columns...`);
    const columnsRes = await this.connection.query(columnsQuery);

    console.log("Fetching primary keys...");
    const pkRes = await this.connection.query(pkQuery);

    console.log("Fetching foreign keys...");
    const fkRes = await this.connection.query(fkQuery);

    console.log("Fetching check constraints...");
    const ccRes = await this.connection.query(ccQuery);

    console.log("Fetching default constraints...");
    const dcRes = await this.connection.query(dcQuery);

    console.log("Assembling metadata in memory...");

    for (const row of columnsRes.recordset) {
      const table = tableMap.get(row.TableObjectId);
      if (table) {
        table.columns.push({
          columnId: row.ColumnId,
          name: row.Name,
          dataType: row.DataType,
          maxLength: row.MaxLength,
          precision: row.Precision,
          scale: row.Scale,
          isNullable: row.IsNullable,
          isIdentity: row.IsIdentity,
          isComputed: row.IsComputed,
          defaultValue: row.DefaultValue,
          objectId: row.TableObjectId,
        });
      }
    }

    for (const row of pkRes.recordset) {
      const table = tableMap.get(row.TableObjectId);
      if (table) {
        table.primaryKeys.push({
          constraintName: row.ConstraintName,
          columnName: row.ColumnName,
          columnId: row.ColumnId,
        });
      }
    }

    for (const row of fkRes.recordset) {
      const table = tableMap.get(row.TableObjectId);
      if (table) {
        table.foreignKeys.push({
          constraintName: row.ConstraintName,
          tableSchema: row.TableSchema,
          tableName: row.TableName,
          columnName: row.ColumnName,
          columnId: row.ColumnId,
          referencedSchema: row.ReferencedSchema,
          referencedTable: row.ReferencedTable,
          referencedColumn: row.ReferencedColumn,
          referenceColumnId: row.ReferenceColumnId,
          tableObjectId: row.TableObjectId,
          referencedTableObjectId: row.ReferencedTableObjectId,
        });
      }
    }

    for (const row of ccRes.recordset) {
      const table = tableMap.get(row.TableObjectId);
      if (table) {
        table.checkConstraints.push({
          constraintName: row.ConstraintName,
          definition: row.Definition,
          parent_object_id: row.TableObjectId,
          columnId: row.ColumnId,
        });
      }
    }

    for (const row of dcRes.recordset) {
      const table = tableMap.get(row.TableObjectId);
      if (table) {
        table.defaultConstraints.push({
          constraintName: row.ConstraintName,
          definition: row.Definition,
          columnId: row.ColumnId,
        });
      }
    }

    return Array.from(tableMap.values());
  }
}
