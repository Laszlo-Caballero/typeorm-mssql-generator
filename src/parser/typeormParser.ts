import * as fs from "fs";
import * as path from "path";
import { camelCase, pascalCase, kebabCase } from "change-case";
import pluralize from "pluralize";
import type {
  TableSearcher,
  Column,
  ForeignKey,
} from "../types/table_searcher.js";

interface TableInfo {
  schema: string;
  name: string;
  key: string;
  className: string;
  fileName: string;
  table: TableSearcher;
}

interface RelationInfo {
  sourceKey: string;
  targetKey: string;
  sourceClass: string;
  targetClass: string;
  sourceFile: string;
  targetFile: string;
  manyToOneProp: string;
  oneToManyProp: string;
  joinColumns: { name: string; referencedColumnName: string }[];
}

export class TypeormParser {
  data: TableSearcher[];
  output: string;

  constructor(data: TableSearcher[], output: string = "typeorm-entities") {
    this.data = data;
    this.output = output;
  }

  parser() {
    if (!fs.existsSync(this.output)) {
      fs.mkdirSync(this.output, { recursive: true });
    }

    const tableInfoMap = this.buildTableInfoMap();
    const relationsRegistry = this.buildRelationsRegistry(tableInfoMap);

    // Group relations by source and target table keys
    const manyToOneMap = new Map<string, RelationInfo[]>();
    const oneToManyMap = new Map<string, RelationInfo[]>();

    for (const rel of relationsRegistry) {
      const mList = manyToOneMap.get(rel.sourceKey) || [];
      mList.push(rel);
      manyToOneMap.set(rel.sourceKey, mList);

      const oList = oneToManyMap.get(rel.targetKey) || [];
      oList.push(rel);
      oneToManyMap.set(rel.targetKey, oList);
    }

    // Generate entity files
    for (const [tableKey, info] of tableInfoMap.entries()) {
      const table = info.table;
      const className = info.className;
      const filePath = path.join(this.output, info.fileName);

      let content = `import { Entity, PrimaryGeneratedColumn, PrimaryColumn, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';\n`;

      const imports = new Set<string>();

      const mRels = manyToOneMap.get(tableKey) || [];
      const oRels = oneToManyMap.get(tableKey) || [];

      for (const rel of mRels) {
        if (rel.targetClass !== className) {
          imports.add(
            `import { ${rel.targetClass} } from './${rel.targetFile}';`,
          );
        }
      }

      for (const rel of oRels) {
        if (rel.sourceClass !== className) {
          imports.add(
            `import { ${rel.sourceClass} } from './${rel.sourceFile}';`,
          );
        }
      }

      if (imports.size > 0) {
        content += Array.from(imports).join("\n") + "\n";
      }

      if (table.schema) {
        content += `\n@Entity({ schema: '${table.schema}', name: '${table.name}' })\n`;
      } else {
        content += `\n@Entity('${table.name}')\n`;
      }
      content += `export class ${className} {\n`;

      for (const col of table.columns) {
        const propName = this.formatPropName(col.name);
        const tsType = this.getTsType(col.dataType);

        let decorator = "";
        let extraOptions = [];

        if (
          col.maxLength &&
          col.maxLength > 0 &&
          ["varchar", "nvarchar", "char", "nchar"].includes(col.dataType)
        ) {
          extraOptions.push(`length: ${col.maxLength}`);
        } else if (
          col.maxLength === -1 &&
          ["varchar", "nvarchar", "varbinary"].includes(col.dataType)
        ) {
          extraOptions.push(`length: 'MAX'`);
        }

        if (col.isNullable) {
          extraOptions.push(`nullable: true`);
        }

        const optionsStr =
          extraOptions.length > 0 ? `, ${extraOptions.join(", ")}` : "";

        const isPk = table.primaryKeys.some((pk) => pk.columnName === col.name);

        if (isPk) {
          if (col.isIdentity) {
            decorator = `@PrimaryGeneratedColumn('increment')`;
          } else if (col.dataType === "uniqueidentifier") {
            decorator = `@PrimaryGeneratedColumn('uuid')`;
          } else {
            decorator = `@PrimaryColumn({ type: '${col.dataType}'${optionsStr} })`;
          }
        } else {
          decorator = `@Column({ type: '${col.dataType}'${optionsStr} })`;
        }

        content += `  ${decorator}\n`;
        content += `  ${propName}${col.isNullable ? "?" : ""}: ${tsType}${col.isNullable ? " | null" : ""};\n\n`;
      }

      // Add ManyToOne relations
      for (const rel of mRels) {
        const targetVar = camelCase(rel.targetClass);
        content += `  @ManyToOne(() => ${rel.targetClass}, (${targetVar}) => ${targetVar}.${rel.oneToManyProp})\n`;
        if (rel.joinColumns.length === 1) {
          const jCol = rel.joinColumns[0]!;
          content += `  @JoinColumn({ name: '${jCol.name.replace(/'/g, "\\'")}' })\n`;
        } else {
          const jStr = rel.joinColumns
            .map(
              (j) =>
                `{ name: '${j.name.replace(/'/g, "\\'")}', referencedColumnName: '${j.referencedColumnName.replace(/'/g, "\\'")}' }`,
            )
            .join(", ");
          content += `  @JoinColumn([${jStr}])\n`;
        }
        content += `  ${rel.manyToOneProp}: ${rel.targetClass};\n\n`;
      }

      // Add OneToMany relations
      for (const rel of oRels) {
        const sourceVar = camelCase(rel.sourceClass);
        content += `  @OneToMany(() => ${rel.sourceClass}, (${sourceVar}) => ${sourceVar}.${rel.manyToOneProp})\n`;
        content += `  ${rel.oneToManyProp}: ${rel.sourceClass}[];\n\n`;
      }

      content += `}\n`;
      fs.writeFileSync(filePath, content, "utf8");
    }
  }

  private buildTableInfoMap(): Map<string, TableInfo> {
    const map = new Map<string, TableInfo>();

    const tableNameCounts = new Map<string, number>();
    for (const t of this.data) {
      const nameLower = t.name.toLowerCase();
      tableNameCounts.set(nameLower, (tableNameCounts.get(nameLower) || 0) + 1);
    }

    for (const table of this.data) {
      const schema = table.schema || "dbo";
      const key = `${schema}.${table.name}`;
      const hasDuplicateName =
        (tableNameCounts.get(table.name.toLowerCase()) || 0) > 1;

      const singularName = pluralize.singular(table.name);
      let className = pascalCase(singularName);
      let fileBaseName = kebabCase(className);

      if (hasDuplicateName) {
        className = `${pascalCase(schema)}${className}`;
        fileBaseName = `${kebabCase(schema)}-${fileBaseName}`;
      }

      map.set(key, {
        schema,
        name: table.name,
        key,
        className,
        fileName: `${fileBaseName}.entity.ts`,
        table,
      });
    }

    // Ensure className and fileName are strictly unique for every table
    const classNameMap = new Map<string, string>();
    const fileNameMap = new Map<string, string>();

    for (const info of map.values()) {
      let uniqueClassName = info.className;
      let counter = 2;
      while (
        classNameMap.has(uniqueClassName) &&
        classNameMap.get(uniqueClassName) !== info.key
      ) {
        uniqueClassName = `${info.className}${counter++}`;
      }
      classNameMap.set(uniqueClassName, info.key);
      info.className = uniqueClassName;

      let uniqueFileName = `${kebabCase(uniqueClassName)}.entity.ts`;
      let fCounter = 2;
      while (
        fileNameMap.has(uniqueFileName) &&
        fileNameMap.get(uniqueFileName) !== info.key
      ) {
        uniqueFileName = `${kebabCase(uniqueClassName)}${fCounter++}.entity.ts`;
      }
      fileNameMap.set(uniqueFileName, info.key);
      info.fileName = uniqueFileName;
    }

    return map;
  }

  private buildRelationsRegistry(
    tableInfoMap: Map<string, TableInfo>,
  ): RelationInfo[] {
    const relations: RelationInfo[] = [];

    const usedPropsMap = new Map<string, Set<string>>();
    for (const [key, info] of tableInfoMap.entries()) {
      const set = new Set<string>();
      for (const col of info.table.columns) {
        set.add(col.name);
        set.add(this.formatPropName(col.name));
      }
      usedPropsMap.set(key, set);
    }

    const findTargetTable = (fk: ForeignKey): TableInfo | undefined => {
      if (fk.referencedSchema) {
        const key = `${fk.referencedSchema}.${fk.referencedTable}`;
        if (tableInfoMap.has(key)) return tableInfoMap.get(key);
      }
      for (const info of tableInfoMap.values()) {
        if (info.name.toLowerCase() === fk.referencedTable.toLowerCase()) {
          return info;
        }
      }
      return undefined;
    };

    for (const [sourceKey, sourceInfo] of tableInfoMap.entries()) {
      const sourceTable = sourceInfo.table;
      if (!sourceTable.foreignKeys || sourceTable.foreignKeys.length === 0) {
        continue;
      }

      const fkGroups = new Map<string, ForeignKey[]>();
      for (const fk of sourceTable.foreignKeys) {
        const groupKey =
          fk.constraintName || `${fk.columnName}_${fk.referencedTable}`;
        const list = fkGroups.get(groupKey) || [];
        list.push(fk);
        fkGroups.set(groupKey, list);
      }

      const targetCounts = new Map<string, number>();
      for (const group of fkGroups.values()) {
        const first = group[0]!;
        const targetInfo = findTargetTable(first);
        if (targetInfo) {
          targetCounts.set(
            targetInfo.key,
            (targetCounts.get(targetInfo.key) || 0) + 1,
          );
        }
      }

      for (const [_, fks] of fkGroups.entries()) {
        const firstFk = fks[0]!;
        const targetInfo = findTargetTable(firstFk);
        if (!targetInfo) continue;

        const targetKey = targetInfo.key;
        const isMultipleToTarget = (targetCounts.get(targetKey) || 0) > 1;

        const sourceProps = usedPropsMap.get(sourceKey)!;
        const targetProps = usedPropsMap.get(targetKey)!;

        const firstColClean = firstFk.columnName.replace(/^id_?/i, "");
        const colSuffix = pascalCase(firstColClean || firstFk.columnName);

        // ManyToOne prop name in source entity
        let manyToOneProp = camelCase(pluralize.singular(targetInfo.name));
        if (isMultipleToTarget || sourceProps.has(manyToOneProp)) {
          manyToOneProp =
            camelCase(pluralize.singular(targetInfo.name)) + colSuffix;
        }
        let mIndex = 2;
        let baseMProp = manyToOneProp;
        while (sourceProps.has(manyToOneProp)) {
          manyToOneProp = `${baseMProp}${mIndex++}`;
        }
        sourceProps.add(manyToOneProp);

        // OneToMany prop name in target entity
        let oneToManyProp = camelCase(pluralize(sourceInfo.name));
        if (isMultipleToTarget || targetProps.has(oneToManyProp)) {
          oneToManyProp = camelCase(pluralize(sourceInfo.name)) + colSuffix;
        }
        let oIndex = 2;
        let baseOProp = oneToManyProp;
        while (targetProps.has(oneToManyProp)) {
          oneToManyProp = `${baseOProp}${oIndex++}`;
        }
        targetProps.add(oneToManyProp);

        const joinColumns = fks.map((fk) => ({
          name: fk.columnName,
          referencedColumnName: fk.referencedColumn,
        }));

        relations.push({
          sourceKey,
          targetKey,
          sourceClass: sourceInfo.className,
          targetClass: targetInfo.className,
          sourceFile: sourceInfo.fileName.replace(/\.ts$/, ""),
          targetFile: targetInfo.fileName.replace(/\.ts$/, ""),
          manyToOneProp,
          oneToManyProp,
          joinColumns,
        });
      }
    }

    return relations;
  }

  private formatPropName(name: string): string {
    const isValidIdentifier =
      /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name) && name !== "constructor";
    if (isValidIdentifier) {
      return name;
    }
    return `"${name.replace(/"/g, '\\"')}"`;
  }

  private getTsType(dataType: string): string {
    switch (dataType.toLowerCase()) {
      case "int":
      case "integer":
      case "int2":
      case "int4":
      case "int8":
      case "tinyint":
      case "smallint":
      case "bigint":
      case "decimal":
      case "numeric":
      case "float":
      case "float4":
      case "float8":
      case "double precision":
      case "real":
      case "money":
      case "smallmoney":
        return "number";
      case "bit":
      case "boolean":
      case "bool":
        return "boolean";
      case "date":
      case "time":
      case "timetz":
      case "timestamptz":
      case "datetime":
      case "datetime2":
      case "smalldatetime":
      case "datetimeoffset":
      case "timestamp":
      case "timestamp without time zone":
      case "timestamp with time zone":
        return "Date";
      default:
        return "string";
    }
  }
}
