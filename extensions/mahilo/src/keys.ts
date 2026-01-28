/**
 * Mahilo keypair storage (for registry registration).
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { PluginRuntime } from "clawdbot/plugin-sdk";

const KEYPAIR_VERSION = 1;
const KEYPAIR_DIR = "mahilo";
const KEYPAIR_FILE = "keypair.json";

type MahiloKeypair = {
  version: 1;
  algorithm: "ed25519";
  publicKey: string;
  privateKey: string;
  createdAt: string;
};

function resolveKeypairPath(runtime: PluginRuntime, env?: NodeJS.ProcessEnv): string {
  const stateDir = runtime.state.resolveStateDir(env, os.homedir);
  return path.join(stateDir, KEYPAIR_DIR, KEYPAIR_FILE);
}

function parseKeypair(raw: string): MahiloKeypair | null {
  try {
    const parsed = JSON.parse(raw) as Partial<MahiloKeypair>;
    if (parsed?.version !== KEYPAIR_VERSION) return null;
    if (parsed.algorithm !== "ed25519") return null;
    if (typeof parsed.publicKey !== "string" || typeof parsed.privateKey !== "string") {
      return null;
    }
    if (typeof parsed.createdAt !== "string") return null;
    return parsed as MahiloKeypair;
  } catch {
    return null;
  }
}

async function readKeypair(filePath: string): Promise<MahiloKeypair | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return parseKeypair(raw);
  } catch (err) {
    if ((err as { code?: string }).code === "ENOENT") return null;
    return null;
  }
}

async function writeKeypair(filePath: string, keypair: MahiloKeypair): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const payload = `${JSON.stringify(keypair, null, 2)}\n`;
  await fs.writeFile(filePath, payload, { mode: 0o600 });
}

function createKeypair(): MahiloKeypair {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  return {
    version: KEYPAIR_VERSION,
    algorithm: "ed25519",
    publicKey: publicKey.export({ type: "spki", format: "der" }).toString("base64"),
    privateKey: privateKey.export({ type: "pkcs8", format: "der" }).toString("base64"),
    createdAt: new Date().toISOString(),
  };
}

export async function getOrCreateMahiloKeypair(params: {
  runtime: PluginRuntime;
  env?: NodeJS.ProcessEnv;
}): Promise<MahiloKeypair> {
  const filePath = resolveKeypairPath(params.runtime, params.env);
  const existing = await readKeypair(filePath);
  if (existing) return existing;
  const created = createKeypair();
  await writeKeypair(filePath, created);
  return created;
}
