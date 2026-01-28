/**
 * Mahilo plugin state persistence.
 *
 * Persists callback_secret and connection_id to disk so the plugin
 * can reuse them across gateway restarts without re-registering.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { PluginRuntime } from "clawdbot/plugin-sdk";

const STATE_VERSION = 1;
const STATE_DIR = "mahilo";
const STATE_FILE = "state.json";

export interface MahiloState {
  version: 1;
  callback_secret?: string;
  connection_id?: string;
  registered_at?: string;
  /** The callback URL that was registered. Used to detect if re-registration is needed. */
  registered_callback_url?: string;
}

function resolveStatePath(runtime: PluginRuntime, env?: NodeJS.ProcessEnv): string {
  const stateDir = runtime.state.resolveStateDir(env, os.homedir);
  return path.join(stateDir, STATE_DIR, STATE_FILE);
}

function parseState(raw: string): MahiloState | null {
  try {
    const parsed = JSON.parse(raw) as Partial<MahiloState>;
    if (parsed?.version !== STATE_VERSION) return null;
    return parsed as MahiloState;
  } catch {
    return null;
  }
}

async function readState(filePath: string): Promise<MahiloState | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return parseState(raw);
  } catch (err) {
    if ((err as { code?: string }).code === "ENOENT") return null;
    return null;
  }
}

async function writeState(filePath: string, state: MahiloState): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const payload = `${JSON.stringify(state, null, 2)}\n`;
  await fs.writeFile(filePath, payload, { mode: 0o600 });
}

/**
 * Load persisted Mahilo state (callback_secret, connection_id, etc.).
 */
export async function loadMahiloState(params: {
  runtime: PluginRuntime;
  env?: NodeJS.ProcessEnv;
}): Promise<MahiloState | null> {
  const filePath = resolveStatePath(params.runtime, params.env);
  return readState(filePath);
}

/**
 * Save Mahilo state to disk.
 */
export async function saveMahiloState(params: {
  runtime: PluginRuntime;
  state: Omit<MahiloState, "version">;
  env?: NodeJS.ProcessEnv;
}): Promise<void> {
  const filePath = resolveStatePath(params.runtime, params.env);
  const existing = await readState(filePath);
  const merged: MahiloState = {
    ...existing,
    ...params.state,
    version: STATE_VERSION,
  };
  await writeState(filePath, merged);
}

/**
 * Clear persisted Mahilo state (for re-registration).
 */
export async function clearMahiloState(params: {
  runtime: PluginRuntime;
  env?: NodeJS.ProcessEnv;
}): Promise<void> {
  const filePath = resolveStatePath(params.runtime, params.env);
  try {
    await fs.unlink(filePath);
  } catch (err) {
    if ((err as { code?: string }).code !== "ENOENT") throw err;
  }
}
