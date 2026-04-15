import { DataSourceType } from "@prisma/client";
import { z } from "zod";

export const adminDataSourceConfigSchema = z.object({
  host: z.string().min(1, "Hostname or IP is required."),
  port: z.coerce.number().int().min(1, "Port is required.").max(65535, "Port must be between 1 and 65535."),
  schema: z.string().min(1, "Schema is required."),
  username: z.string().min(1, "Username is required."),
  password: z.string().min(1, "Password is required.")
});

export const adminDataSourceSchema = z.object({
  name: z.string().min(2, "Name is required."),
  description: z.string().optional(),
  type: z.nativeEnum(DataSourceType),
  config: adminDataSourceConfigSchema,
  allowedUserIds: z.array(z.string().min(1)).default([])
});

export const updateAdminDataSourceSchema = adminDataSourceSchema.extend({
  id: z.string().min(1, "Data source id is required.")
});

export type AdminDataSourceInput = z.infer<typeof adminDataSourceSchema>;

export type AdminDataSourceRecord = {
  id: string;
  name: string;
  description: string;
  type: DataSourceType;
  allowedUserIds: string[];
  config: {
    host: string;
    port: number;
    schema: string;
    username: string;
    password: string;
  };
  createdAt: string;
  updatedAt: string;
};

export type AdminAssignableUser = {
  id: string;
  email: string;
  name: string | null;
  role: "ADMIN" | "USER";
  isActive: boolean;
};

function getString(config: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = config[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return "";
}

function getPort(config: Record<string, unknown>, type: DataSourceType) {
  const candidate = config.port;

  if (typeof candidate === "number" && Number.isInteger(candidate) && candidate > 0) {
    return candidate;
  }

  if (typeof candidate === "string" && /^\d+$/.test(candidate)) {
    return Number(candidate);
  }

  return type === DataSourceType.MYSQL ? 3306 : 5432;
}

export function normalizeAdminDataSourceConfig(config: Record<string, unknown>, type: DataSourceType) {
  return {
    host: getString(config, ["host", "hostname", "ip", "ipAddress"]),
    port: getPort(config, type),
    schema: getString(config, ["schema", "database", "dbName", "dbname"]),
    username: getString(config, ["username", "user"]),
    password: getString(config, ["password", "pass"])
  };
}
