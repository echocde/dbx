import type { ConnectionConfig, DatabaseType } from "@/types/database";
import { supportsDriverManagement } from "@/lib/databaseCapabilities";

export interface AgentDriverUpdateState {
  db_type: string;
  label: string;
  installed: boolean;
  installed_version: string | null;
  version: string;
  update_available: boolean;
}

export interface AgentDriverUpdatePrompt {
  dbType: string;
  label: string;
  currentVersion: string;
  latestVersion: string;
}

export function agentDriverUpdateKeyForConnection(
  connection: Pick<ConnectionConfig, "db_type" | "driver_profile">,
): string | null {
  if (connection.db_type === "oracle" && connection.driver_profile === "oracle-10g") return "oracle-10g";
  if (!supportsDriverManagement(connection.db_type as DatabaseType)) return null;
  return connection.db_type;
}

export function agentDriverUpdateIgnoreKey(dbType: string, version: string): string {
  return `${dbType}@${version}`;
}

export function findAgentDriverUpdatePrompt(
  connection: Pick<ConnectionConfig, "db_type" | "driver_profile">,
  drivers: readonly AgentDriverUpdateState[],
  ignoredVersions: ReadonlySet<string> = new Set(),
): AgentDriverUpdatePrompt | null {
  const dbType = agentDriverUpdateKeyForConnection(connection);
  if (!dbType) return null;

  const driver = drivers.find((item) => item.db_type === dbType);
  if (!driver?.installed || !driver.update_available || !driver.version || !driver.installed_version) return null;
  if (ignoredVersions.has(agentDriverUpdateIgnoreKey(dbType, driver.version))) return null;

  return {
    dbType,
    label: driver.label || dbType,
    currentVersion: driver.installed_version,
    latestVersion: driver.version,
  };
}
