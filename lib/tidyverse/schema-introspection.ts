import { connectServerDatabase } from "@/lib/plugins/server-db";
import type { SourceConnection } from "@/lib/source-connection";

type SourceSchemaColumn = {
  name: string;
  dataType: string;
  isNullable: boolean;
};

type SourceSchemaTable = {
  schema: string;
  name: string;
  columns: SourceSchemaColumn[];
};

export type TidyverseSourceSchemaDefinition = {
  scope: "table" | "schema";
  truncated: boolean;
  tables: SourceSchemaTable[];
};

const MAX_SCHEMA_TABLES = 12;
const MAX_TABLE_COLUMNS = 40;

function normalizeBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return value.toUpperCase() === "YES" || value.toLowerCase() === "true";
  }

  return false;
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value : String(value ?? "");
}

export async function introspectTidyverseSourceSchema(
  connection: SourceConnection,
  options?: {
    maxSchemaTables?: number;
    maxTableColumns?: number | null;
  }
): Promise<TidyverseSourceSchemaDefinition | null> {
  const handle = await connectServerDatabase(connection);

  try {
    const schemaName = connection.tableSchema ?? connection.schema;
    const maxSchemaTables = options && "maxSchemaTables" in options ? options.maxSchemaTables ?? MAX_SCHEMA_TABLES : MAX_SCHEMA_TABLES;
    const maxTableColumns: number | null =
      options && "maxTableColumns" in options
        ? options.maxTableColumns === null
          ? null
          : options.maxTableColumns ?? MAX_TABLE_COLUMNS
        : MAX_TABLE_COLUMNS;
    const unlimitedColumns = maxTableColumns === null;

    if (connection.tableName) {
      if (handle.driver === "postgres") {
        const rows = await handle.query(
          `
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = $1
              AND table_name = $2
            ORDER BY ordinal_position
          `,
          [schemaName, connection.tableName]
        );

        return {
          scope: "table",
          truncated: !unlimitedColumns && rows.length > maxTableColumns,
          tables: [
            {
              schema: schemaName,
              name: connection.tableName,
              columns: (unlimitedColumns ? rows : rows.slice(0, maxTableColumns)).map((row) => ({
                name: normalizeString(row.column_name),
                dataType: normalizeString(row.data_type),
                isNullable: normalizeBoolean(row.is_nullable)
              }))
            }
          ]
        };
      }

      const rows = await handle.query(
        `
          SELECT column_name, data_type, is_nullable
          FROM information_schema.columns
          WHERE table_schema = ?
            AND table_name = ?
          ORDER BY ordinal_position
        `,
        [connection.database ?? connection.schema, connection.tableName]
      );

      return {
        scope: "table",
        truncated: !unlimitedColumns && rows.length > maxTableColumns,
        tables: [
          {
            schema: schemaName,
            name: connection.tableName,
            columns: (unlimitedColumns ? rows : rows.slice(0, maxTableColumns)).map((row) => ({
              name: normalizeString(row.column_name),
              dataType: normalizeString(row.data_type),
              isNullable: normalizeBoolean(row.is_nullable)
            }))
          }
        ]
      };
    }

    if (handle.driver === "postgres") {
      const tables = await handle.query(
        `
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = $1
            AND table_type = 'BASE TABLE'
          ORDER BY table_name
          LIMIT $2
        `,
        [schemaName, maxSchemaTables + 1]
      );
      const selectedTables = tables.slice(0, maxSchemaTables).map((row) => normalizeString(row.table_name));

      if (selectedTables.length === 0) {
        return {
          scope: "schema",
          truncated: false,
          tables: []
        };
      }

      const columns = await handle.query(
        `
          SELECT table_name, column_name, data_type, is_nullable, ordinal_position
          FROM information_schema.columns
          WHERE table_schema = $1
            AND table_name = ANY($2::text[])
          ORDER BY table_name, ordinal_position
        `,
        [schemaName, selectedTables]
      );

      const byTable = new Map<string, SourceSchemaTable>();
      for (const tableName of selectedTables) {
        byTable.set(tableName, {
          schema: schemaName,
          name: tableName,
          columns: []
        });
      }

      for (const row of columns) {
        const table = byTable.get(normalizeString(row.table_name));
        if (!table || (!unlimitedColumns && table.columns.length >= maxTableColumns)) {
          continue;
        }

        table.columns.push({
          name: normalizeString(row.column_name),
          dataType: normalizeString(row.data_type),
          isNullable: normalizeBoolean(row.is_nullable)
        });
      }

      return {
        scope: "schema",
        truncated: tables.length > maxSchemaTables,
        tables: selectedTables.map((tableName) => byTable.get(tableName)!).filter(Boolean)
      };
    }

    const tables = await handle.query(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = ?
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
        LIMIT ?
      `,
      [connection.database ?? connection.schema, maxSchemaTables + 1]
    );
    const selectedTables = tables.slice(0, maxSchemaTables).map((row) => normalizeString(row.table_name));

    if (selectedTables.length === 0) {
      return {
        scope: "schema",
        truncated: false,
        tables: []
      };
    }

    const byTable = new Map<string, SourceSchemaTable>();
    for (const tableName of selectedTables) {
      byTable.set(tableName, {
        schema: schemaName,
        name: tableName,
        columns: []
      });
    }

    for (const tableName of selectedTables) {
      const columns = await handle.query(
        `
          SELECT column_name, data_type, is_nullable
          FROM information_schema.columns
          WHERE table_schema = ?
            AND table_name = ?
          ORDER BY ordinal_position
        `,
        [connection.database ?? connection.schema, tableName]
      );

      byTable.set(tableName, {
        schema: schemaName,
        name: tableName,
        columns: (unlimitedColumns ? columns : columns.slice(0, maxTableColumns)).map((row) => ({
          name: normalizeString(row.column_name),
          dataType: normalizeString(row.data_type),
          isNullable: normalizeBoolean(row.is_nullable)
        }))
      });
    }

    return {
      scope: "schema",
      truncated: tables.length > maxSchemaTables,
      tables: selectedTables.map((tableName) => byTable.get(tableName)!).filter(Boolean)
    };
  } finally {
    await handle.close();
  }
}
