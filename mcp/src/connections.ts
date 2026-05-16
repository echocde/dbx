import { join } from "node:path";
import { homedir, platform } from "node:os";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";

export interface ConnectionConfig {
  id: string;
  name: string;
  db_type: string;
  driver_profile?: string;
  host: string;
  port: number;
  username: string;
  password: string;
  database?: string;
  url_params?: string;
  ssh_enabled: boolean;
  proxy_enabled?: boolean;
  proxy_type?: "socks5" | "http";
  proxy_host?: string;
  proxy_port?: number;
  proxy_username?: string;
  proxy_password?: string;
  ssl: boolean;
}

export function canonicalizeConnection(config: ConnectionConfig): ConnectionConfig {
  if (config.db_type === "mysql" && config.driver_profile?.toLowerCase() === "tdengine") {
    return {
      ...config,
      db_type: "tdengine",
      driver_profile: "tdengine",
      port: config.port === 0 || config.port === 6030 ? 6041 : config.port,
    };
  }
  if (config.db_type === "tdengine") {
    return {
      ...config,
      driver_profile: "tdengine",
      port: config.port || 6041,
    };
  }
  return config;
}

function appDataDir(): string {
  const home = homedir();
  switch (platform()) {
    case "darwin":
      return join(home, "Library", "Application Support", "com.dbx.app");
    case "win32":
      return join(process.env.APPDATA || join(home, "AppData", "Roaming"), "com.dbx.app");
    default:
      return join(home, ".config", "com.dbx.app");
  }
}

function openDb(readonly = false): Database.Database {
  const dbPath = join(appDataDir(), "dbx.db");
  return new Database(dbPath, { readonly });
}

function getSecret(db: Database.Database, connectionId: string, key: string): string {
  const row = db
    .prepare("SELECT secret FROM connection_secrets WHERE connection_id = ? AND key = ?")
    .get(connectionId, key) as { secret: string } | undefined;
  return row?.secret ?? "";
}

export async function loadConnections(): Promise<ConnectionConfig[]> {
  try {
    const db = openDb(true);
    const rows = db.prepare("SELECT id, config_json FROM connections").all() as { id: string; config_json: string }[];
    const configs: ConnectionConfig[] = [];

    for (const row of rows) {
      const config: ConnectionConfig = canonicalizeConnection(JSON.parse(row.config_json));
      config.id = row.id;
      if (!config.password) config.password = getSecret(db, row.id, "password");
      if (!config.proxy_password) config.proxy_password = getSecret(db, row.id, "proxy_password");
      configs.push(config);
    }

    db.close();
    return configs;
  } catch {
    return [];
  }
}

export async function findConnection(name: string): Promise<ConnectionConfig | undefined> {
  const connections = await loadConnections();
  return connections.find((c) => c.name.toLowerCase() === name.toLowerCase());
}

export async function addConnection(config: Omit<ConnectionConfig, "id">): Promise<ConnectionConfig> {
  const id = randomUUID();
  const db = openDb();
  const normalized = canonicalizeConnection({ ...config, id } as ConnectionConfig);

  const full = {
    id,
    name: normalized.name,
    db_type: normalized.db_type,
    driver_profile: normalized.driver_profile ?? normalized.db_type,
    driver_label: null,
    url_params: normalized.url_params ?? "",
    host: normalized.host,
    port: normalized.port,
    username: normalized.username,
    password: "",
    database: normalized.database ?? null,
    color: null,
    ssh_enabled: normalized.ssh_enabled ?? false,
    ssh_host: "",
    ssh_port: 22,
    ssh_user: "",
    ssh_password: "",
    ssh_key_path: "",
    ssh_key_passphrase: "",
    ssh_expose_lan: false,
    proxy_enabled: normalized.proxy_enabled ?? false,
    proxy_type: normalized.proxy_type ?? "socks5",
    proxy_host: normalized.proxy_host ?? "",
    proxy_port: normalized.proxy_port ?? 1080,
    proxy_username: normalized.proxy_username ?? "",
    proxy_password: "",
    ssl: normalized.ssl ?? false,
    sysdba: false,
    connection_string: null,
  };
  const configJson = JSON.stringify(full);

  const insert = db.transaction(() => {
    db.prepare("INSERT INTO connections (id, config_json) VALUES (?, ?)").run(id, configJson);
    if (normalized.password) {
      db.prepare("INSERT INTO connection_secrets (connection_id, key, secret) VALUES (?, ?, ?)").run(
        id,
        "password",
        normalized.password,
      );
    }
    if (normalized.proxy_password) {
      db.prepare("INSERT INTO connection_secrets (connection_id, key, secret) VALUES (?, ?, ?)").run(
        id,
        "proxy_password",
        normalized.proxy_password,
      );
    }
  });
  insert();
  db.close();

  return normalized;
}

export async function removeConnection(name: string): Promise<boolean> {
  const connection = await findConnection(name);
  if (!connection) return false;

  const db = openDb();
  const remove = db.transaction(() => {
    db.prepare("DELETE FROM connections WHERE id = ?").run(connection.id);
    db.prepare("DELETE FROM connection_secrets WHERE connection_id = ?").run(connection.id);
  });
  remove();
  db.close();

  return true;
}
