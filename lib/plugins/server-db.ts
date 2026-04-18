import { Client as PostgresClient } from "pg";
import mysql from "mysql2/promise";

import type { SourceConnection } from "@/lib/source-connection";

export type ServerDatabaseHandle = {
  driver: "postgres" | "mysql";
  query: (sql: string, params?: readonly unknown[]) => Promise<Array<Record<string, unknown>>>;
  close: () => Promise<void>;
};

export async function connectServerDatabase(connection: SourceConnection): Promise<ServerDatabaseHandle> {
  if (connection.type === "POSTGRESQL") {
    const client = new PostgresClient({
      host: connection.host,
      port: connection.port,
      database: connection.database ?? connection.schema,
      user: connection.username,
      password: connection.password,
      statement_timeout: 20_000,
      query_timeout: 20_000
    });

    await client.connect();

    return {
      driver: "postgres",
      async query(sql, params = []) {
        const result = await client.query<Record<string, unknown>>(sql, params as unknown[]);
        return result.rows;
      },
      async close() {
        await client.end();
      }
    };
  }

  const client = await mysql.createConnection({
    host: connection.host,
    port: connection.port,
    database: connection.database ?? connection.schema,
    user: connection.username,
    password: connection.password
  });

  return {
    driver: "mysql",
    async query(sql, params = []) {
      const [rows] = await client.query(sql, params as unknown[]);
      return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];
    },
    async close() {
      await client.end();
    }
  };
}
