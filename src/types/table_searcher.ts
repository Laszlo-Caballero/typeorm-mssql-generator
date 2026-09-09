export interface TableSearcher {
  schema: string;
  name: string;
  objectId: number;
  columns: Column[];
  primaryKeys: PrimaryKey[];
  foreignKeys: ForeignKey[];
  checkConstraints: CheckConstraint[];
  defaultConstraints: DefaultConstraint[];
}

export interface Column {
  columnId: number;
  name: string;
  dataType: string;
  maxLength: number;
  precision: number;
  scale: number;
  isNullable: boolean;
  isIdentity: boolean;
  isComputed: boolean;
  defaultValue?: string;
  objectId: number;
}

export interface PrimaryKey {
  constraintName: string;
  columnName: string;
  columnId: number;
}

export interface ForeignKey {
  constraintName: string;
  tableName: string;
  tableSchema?: string;
  tableObjectId: number;
  columnId: number;
  columnName: string;
  referencedTable: string;
  referencedSchema?: string;
  referencedColumn: string;
  referencedTableObjectId: number;
  referenceColumnId: number;
}

export interface CheckConstraint {
  constraintName: string;
  definition: string;
  parent_object_id: number;
  columnId: number;
}

export interface DefaultConstraint {
  constraintName: string;
  definition: string;
  columnId: number;
}
