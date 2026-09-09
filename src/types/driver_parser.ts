import type { TableSearcher } from "./table_searcher";

export interface IGetTable {
  schema: any;
  name: any;
  objectId: any;
}

export interface IGetColumn {
  columnId: any;
  name: any;
  dataType: any;
  maxLength: any;
  precision: any;
  scale: any;
  isNullable: any;
  isIdentity: any;
  isComputed: any;
  defaultValue: any;
}

export interface IGetPrimaryKey {
  constraintName: any;
  columnName: any;
  columnId: any;
}

export interface IGetForeignKey {
  constraintName: any;
  tableSchema: any;
  tableName: any;
  columnName: any;
  columnId: any;
  referencedSchema: any;
  referencedTable: any;
  referencedColumn: any;
  referenceColumnId: any;
  tableObjectId: any;
  referencedTableObjectId: any;
}

export interface IGetCheckConstraint {
  constraintName: any;
  definition: any;
  parent_object_id: any;
  columnId: any;
}

export interface IDriverParse {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getTables(): Promise<IGetTable[]>;
  getColumns(schema: string, table: string): Promise<IGetColumn[]>;
  getPrimaryKeys(schema: string, table: string): Promise<IGetPrimaryKey[]>;
  getForeignKeys(schema: string, table: string): Promise<IGetForeignKey[]>;
  getCheckConstraints(
    schema: string,
    table: string,
  ): Promise<IGetCheckConstraint[]>;
  getAllTableDetails(): Promise<TableSearcher[]>;
}
