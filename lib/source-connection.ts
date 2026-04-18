import { z } from "zod";

export const sourceConnectionTypeOptions = ["POSTGRESQL", "MYSQL"] as const;

export const sourceConnectionSchema = z.object({
  sourceId: z.string().min(1),
  sourceName: z.string().min(1),
  sourceKind: z.enum(["governed-source", "persistent-import"]).default("governed-source"),
  type: z.enum(sourceConnectionTypeOptions),
  host: z.string().min(1),
  port: z.number().int().positive(),
  database: z.string().min(1).optional(),
  schema: z.string().min(1),
  username: z.string().min(1).optional(),
  password: z.string().min(1).optional(),
  tableSchema: z.string().min(1).optional(),
  tableName: z.string().min(1).optional()
});

export type SourceConnection = z.infer<typeof sourceConnectionSchema>;

export function sanitizeSourceConnection(connection: SourceConnection | null | undefined): SourceConnection | null {
  if (!connection) {
    return null;
  }

  const { username: _username, password: _password, ...rest } = connection;
  return rest;
}
