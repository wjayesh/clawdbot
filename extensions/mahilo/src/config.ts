/**
 * Mahilo Plugin Configuration
 */

import type { MahiloPluginConfig } from "./types.js";

export const DEFAULT_CONFIG: Required<
  Pick<MahiloPluginConfig, "mahilo_api_url" | "callback_path" | "connection_label" | "auto_register">
> = {
  mahilo_api_url: "https://api.mahilo.dev/api/v1",
  callback_path: "/mahilo/incoming",
  connection_label: "default",
  auto_register: true,
};

export function resolveConfig(pluginConfig: Record<string, unknown> | undefined): MahiloPluginConfig {
  const cfg = (pluginConfig ?? {}) as MahiloPluginConfig;
  return {
    mahilo_api_key: cfg.mahilo_api_key,
    mahilo_api_url: cfg.mahilo_api_url ?? DEFAULT_CONFIG.mahilo_api_url,
    callback_path: cfg.callback_path ?? DEFAULT_CONFIG.callback_path,
    callback_url_override: cfg.callback_url_override,
    connection_label: cfg.connection_label ?? DEFAULT_CONFIG.connection_label,
    connection_description: cfg.connection_description,
    connection_capabilities: cfg.connection_capabilities ?? [],
    auto_register: cfg.auto_register ?? DEFAULT_CONFIG.auto_register,
    local_policies: cfg.local_policies ?? {},
    inbound_policies: cfg.inbound_policies ?? {},
  };
}

export function validateConfig(config: MahiloPluginConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // API key is optional at load time (will fail on actual API calls)
  if (config.mahilo_api_key && typeof config.mahilo_api_key !== "string") {
    errors.push("mahilo_api_key must be a string");
  }

  if (config.mahilo_api_url && typeof config.mahilo_api_url !== "string") {
    errors.push("mahilo_api_url must be a string");
  }

  if (config.connection_capabilities && !Array.isArray(config.connection_capabilities)) {
    errors.push("connection_capabilities must be an array of strings");
  }

  return { valid: errors.length === 0, errors };
}
