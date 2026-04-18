import { DataSourceType } from "@prisma/client";

import { normalizeAdminDataSourceConfig } from "@/lib/admin/data-sources";
import { formatSourceDataDictionaryForPrompt } from "@/lib/data-dictionary";
import { ensurePersistentDatasetPhysicalTable, PERSISTENT_IMPORT_SCHEMA } from "@/lib/data-studio-storage";
import { prisma } from "@/lib/prisma";
import { decryptJson } from "@/lib/security/secrets";
import type { SourceConnection } from "@/lib/source-connection";
import type { AppRole } from "@/types/auth";

export function dataSourceSupportsTidyverse(type: string) {
  return type === DataSourceType.POSTGRESQL || type === DataSourceType.MYSQL;
}

function getInternalDatabaseConnection() {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL must be set to resolve persistent imported tables.");
  }

  const parsed = new URL(databaseUrl);
  const database = parsed.pathname.replace(/^\/+/, "");

  if (!database) {
    throw new Error("DATABASE_URL does not include a database name for persistent imports.");
  }

  return {
    type: DataSourceType.POSTGRESQL,
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 5432,
    database,
    username: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password)
  };
}

export async function getAccessibleTidyverseConnection(args: {
  sourceId: string;
  userId: string;
  role: AppRole;
}): Promise<SourceConnection> {
  const source = await prisma.dataSource.findFirst({
    where: {
      id: args.sourceId,
      ...(args.role === "ADMIN"
        ? {}
        : {
            accessList: {
              some: {
                userId: args.userId
              }
            }
          })
    },
    select: {
      id: true,
      name: true,
      type: true,
      configCiphertext: true
    }
  });

  if (!source) {
    const persistentDataset = await prisma.persistentDataset.findUnique({
      where: {
        id: args.sourceId
      },
      select: {
        id: true,
        label: true,
        tableName: true
      }
    });

    if (!persistentDataset) {
      throw new Error("The selected tidyverse source is not available.");
    }

    await ensurePersistentDatasetPhysicalTable(persistentDataset.id);

    const internalConnection = getInternalDatabaseConnection();

    return {
      sourceId: persistentDataset.id,
      sourceName: persistentDataset.label,
      sourceKind: "persistent-import",
      type: internalConnection.type,
      host: internalConnection.host,
      port: internalConnection.port,
      database: internalConnection.database,
      schema: internalConnection.database,
      username: internalConnection.username,
      password: internalConnection.password,
      tableSchema: PERSISTENT_IMPORT_SCHEMA,
      tableName: persistentDataset.tableName
    };
  }

  if (!dataSourceSupportsTidyverse(source.type)) {
    throw new Error("Tidyverse nodes currently support PostgreSQL and MySQL governed data sources only.");
  }

  const config = normalizeAdminDataSourceConfig(
    decryptJson<Record<string, unknown>>(source.configCiphertext),
    source.type
  );

  return {
    sourceId: source.id,
    sourceName: source.name,
    sourceKind: "governed-source",
    type: source.type,
    host: config.host,
    port: config.port,
    database: config.schema,
    schema: config.schema,
    username: config.username,
    password: config.password
  };
}

export async function getAccessibleTidyverseSourceDictionaryValue(args: {
  sourceId: string;
  userId: string;
  role: AppRole;
}): Promise<string | null> {
  const source = await prisma.dataSource.findFirst({
    where: {
      id: args.sourceId,
      ...(args.role === "ADMIN"
        ? {}
        : {
            accessList: {
              some: {
                userId: args.userId
              }
            }
          })
    },
    select: {
      dataDictionary: true
    }
  });

  if (source) {
    return source.dataDictionary?.trim() || null;
  }

  const persistentDataset = await prisma.persistentDataset.findUnique({
    where: {
      id: args.sourceId
    },
    select: {
      dataDictionary: true
    }
  });

  if (!persistentDataset) {
    throw new Error("The selected tidyverse source is not available.");
  }

  return persistentDataset.dataDictionary?.trim() || null;
}

export async function getAccessibleTidyverseSourceDictionary(args: {
  sourceId: string;
  userId: string;
  role: AppRole;
}): Promise<string | null> {
  return formatSourceDataDictionaryForPrompt(await getAccessibleTidyverseSourceDictionaryValue(args)) ?? null;
}
