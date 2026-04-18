import { Client } from "pg";

const MANAGED_TABLES = new Map<string, Set<string>>([
  ["adhoc_analysis", new Set(["TemporaryAnalysisDataset", "TemporaryAnalysisDatasetRow"])],
  ["import_archive", new Set(["PersistentDataset", "PersistentDatasetRow"])]
]);

function quoteIdentifier(value: string) {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL must be set.");
  }

  const client = new Client({
    connectionString: databaseUrl
  });

  await client.connect();

  try {
    for (const [schema, managedTables] of MANAGED_TABLES) {
      const result = await client.query<{ table_name: string }>(
        `
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = $1
            AND table_type = 'BASE TABLE'
          ORDER BY table_name
        `,
        [schema]
      );

      for (const row of result.rows) {
        if (managedTables.has(row.table_name)) {
          continue;
        }

        await client.query(`DROP TABLE IF EXISTS ${quoteIdentifier(schema)}.${quoteIdentifier(row.table_name)}`);
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
