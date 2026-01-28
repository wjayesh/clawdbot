import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { getFreeGatewayPort } from "../src/gateway/test-helpers.e2e.js";

type GatewayInstance = {
  name: string;
  port: number;
  homeDir: string;
  stateDir: string;
  configPath: string;
  child: ChildProcessWithoutNullStreams;
  stdout: string[];
  stderr: string[];
};

const E2E_TIMEOUT_MS = 120_000;
const registryBaseUrl = process.env.MAHILO_REGISTRY_URL ?? "http://127.0.0.1:8080";
const registryApiUrl = `${registryBaseUrl.replace(/\/$/, "")}/api/v1`;
const enabled = process.env.MAHILO_E2E === "1";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForPortOpen(
  proc: ChildProcessWithoutNullStreams,
  chunksOut: string[],
  chunksErr: string[],
  port: number,
  timeoutMs: number,
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (proc.exitCode !== null) {
      const stdout = chunksOut.join("");
      const stderr = chunksErr.join("");
      throw new Error(
        `gateway exited before listening (code=${String(proc.exitCode)} signal=${String(proc.signalCode)})\n` +
          `--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`,
      );
    }

    try {
      await new Promise<void>((resolve, reject) => {
        const socket = net.connect({ host: "127.0.0.1", port });
        socket.once("connect", () => {
          socket.destroy();
          resolve();
        });
        socket.once("error", (err) => {
          socket.destroy();
          reject(err);
        });
      });
      return;
    } catch {
      // keep polling
    }

    await sleep(25);
  }
  const stdout = chunksOut.join("");
  const stderr = chunksErr.join("");
  throw new Error(
    `timeout waiting for gateway to listen on port ${port}\n` +
      `--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`,
  );
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  const body = text ? (JSON.parse(text) as T) : ({} as T);
  if (!res.ok) {
    throw new Error(`request failed ${res.status} ${res.statusText}: ${text}`);
  }
  return body;
}

async function registerUser(username: string) {
  return await fetchJson<{ api_key: string; username: string }>(`${registryApiUrl}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });
}

async function sendFriendRequest(apiKey: string, username: string) {
  return await fetchJson<{ friendship_id: string; status: string }>(
    `${registryApiUrl}/friends/request`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ username }),
    },
  );
}

async function acceptFriendRequest(apiKey: string, friendshipId: string) {
  return await fetchJson<{ friendship_id: string; status: string }>(
    `${registryApiUrl}/friends/${friendshipId}/accept`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    },
  );
}

async function listAgentConnections(apiKey: string) {
  return await fetchJson<Array<{ id?: string; status?: string }>>(`${registryApiUrl}/agents`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
}

async function waitForAgentConnection(apiKey: string, timeoutMs = 15_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const connections = await listAgentConnections(apiKey);
    if (connections.some((conn) => conn.status === "active")) return;
    await sleep(250);
  }
  throw new Error("timeout waiting for Mahilo agent registration");
}

async function spawnGatewayInstance(params: {
  name: string;
  apiKey: string;
}): Promise<GatewayInstance> {
  const port = await getFreeGatewayPort();
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), `moltbot-mahilo-${params.name}-`));
  const configDir = path.join(homeDir, ".clawdbot");
  const stateDir = path.join(configDir, "state");
  await fs.mkdir(configDir, { recursive: true });
  await fs.mkdir(stateDir, { recursive: true });
  const configPath = path.join(configDir, "moltbot.json");

  const callbackUrl = `http://127.0.0.1:${port}/mahilo/incoming`;

  const config = {
    gateway: { auth: { mode: "token", token: `token-${params.name}` } },
    plugins: {
      enabled: true,
      entries: {
        mahilo: {
          enabled: true,
          config: {
            mahilo_api_key: params.apiKey,
            mahilo_api_url: registryApiUrl,
            callback_url_override: callbackUrl,
            auto_register: true,
          },
        },
      },
    },
  };

  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  const stdout: string[] = [];
  const stderr: string[] = [];
  const child = spawn(
    "node",
    [
      "dist/index.js",
      "gateway",
      "--port",
      String(port),
      "--bind",
      "loopback",
      "--allow-unconfigured",
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        HOME: homeDir,
        CLAWDBOT_CONFIG_PATH: configPath,
        CLAWDBOT_STATE_DIR: stateDir,
        CLAWDBOT_SKIP_CHANNELS: "1",
        CLAWDBOT_SKIP_GMAIL_WATCHER: "1",
        CLAWDBOT_SKIP_CRON: "1",
        CLAWDBOT_SKIP_CANVAS_HOST: "1",
        CLAWDBOT_SKIP_BROWSER_CONTROL_SERVER: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (d) => stdout.push(String(d)));
  child.stderr?.on("data", (d) => stderr.push(String(d)));

  await waitForPortOpen(child, stdout, stderr, port, 45_000);

  return {
    name: params.name,
    port,
    homeDir,
    stateDir,
    configPath,
    child,
    stdout,
    stderr,
  };
}

async function stopGatewayInstance(inst: GatewayInstance) {
  if (inst.child.exitCode === null && !inst.child.killed) {
    try {
      inst.child.kill("SIGTERM");
    } catch {
      // ignore
    }
  }
  const exited = await Promise.race([
    new Promise<boolean>((resolve) => {
      if (inst.child.exitCode !== null) return resolve(true);
      inst.child.once("exit", () => resolve(true));
    }),
    sleep(5_000).then(() => false),
  ]);
  if (!exited && inst.child.exitCode === null && !inst.child.killed) {
    try {
      inst.child.kill("SIGKILL");
    } catch {
      // ignore
    }
  }
  await fs.rm(inst.homeDir, { recursive: true, force: true });
}

async function waitForLog(inst: GatewayInstance, needle: string, timeoutMs = 15_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const haystack = inst.stdout.join("") + inst.stderr.join("");
    if (haystack.includes(needle)) return;
    await sleep(100);
  }
  throw new Error(`timeout waiting for log line: ${needle}`);
}

const suite = enabled ? describe : describe.skip;

suite("Mahilo E2E", () => {
  it("routes a registry message to the Mahilo webhook", { timeout: E2E_TIMEOUT_MS }, async () => {
    const suffix = randomUUID().replace(/-/g, "").slice(0, 8);
    const aliceUser = `alice${suffix}`;
    const bobUser = `bob${suffix}`;

    const alice = await registerUser(aliceUser);
    const bob = await registerUser(bobUser);

    const aliceGateway = await spawnGatewayInstance({
      name: "alice",
      apiKey: alice.api_key,
    });
    const bobGateway = await spawnGatewayInstance({
      name: "bob",
      apiKey: bob.api_key,
    });

    try {
      await waitForAgentConnection(alice.api_key);
      await waitForAgentConnection(bob.api_key);

      const friendship = await sendFriendRequest(alice.api_key, bob.username);
      expect(friendship.status).toBeDefined();
      await acceptFriendRequest(bob.api_key, friendship.friendship_id);

      const message = `E2E ping ${suffix}`;
      const sendResult = await fetchJson<{ message_id: string; status: string }>(
        `${registryApiUrl}/messages/send`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${alice.api_key}`,
          },
          body: JSON.stringify({
            recipient: bob.username,
            message,
            context: "Mahilo E2E test",
          }),
        },
      );

      expect(sendResult.status).toBe("delivered");
      await waitForLog(bobGateway, `[Mahilo] Received message from ${alice.username}`);
      await waitForLog(bobGateway, message);
    } finally {
      await stopGatewayInstance(aliceGateway);
      await stopGatewayInstance(bobGateway);
    }
  });
});
