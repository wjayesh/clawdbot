/**
 * Tests for Mahilo state persistence.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearMahiloState, loadMahiloState, saveMahiloState, type MahiloState } from "../src/state.js";

// Mock runtime
function createMockRuntime(stateDir: string) {
  return {
    state: {
      resolveStateDir: () => stateDir,
    },
  } as Parameters<typeof loadMahiloState>[0]["runtime"];
}

describe("Mahilo State Persistence", () => {
  let tempDir: string;
  let runtime: ReturnType<typeof createMockRuntime>;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mahilo-state-test-"));
    runtime = createMockRuntime(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("loadMahiloState", () => {
    it("returns null when no state file exists", async () => {
      const state = await loadMahiloState({ runtime });
      expect(state).toBeNull();
    });

    it("loads valid state from disk", async () => {
      const stateFile = path.join(tempDir, "mahilo", "state.json");
      await fs.mkdir(path.dirname(stateFile), { recursive: true });
      const savedState: MahiloState = {
        version: 1,
        callback_secret: "test-secret-123",
        connection_id: "conn_abc",
        registered_at: "2026-01-28T00:00:00Z",
        registered_callback_url: "https://example.com/mahilo/incoming",
      };
      await fs.writeFile(stateFile, JSON.stringify(savedState));

      const loaded = await loadMahiloState({ runtime });
      expect(loaded).toEqual(savedState);
    });

    it("returns null for invalid JSON", async () => {
      const stateFile = path.join(tempDir, "mahilo", "state.json");
      await fs.mkdir(path.dirname(stateFile), { recursive: true });
      await fs.writeFile(stateFile, "not valid json");

      const state = await loadMahiloState({ runtime });
      expect(state).toBeNull();
    });

    it("returns null for wrong version", async () => {
      const stateFile = path.join(tempDir, "mahilo", "state.json");
      await fs.mkdir(path.dirname(stateFile), { recursive: true });
      await fs.writeFile(stateFile, JSON.stringify({ version: 999 }));

      const state = await loadMahiloState({ runtime });
      expect(state).toBeNull();
    });
  });

  describe("saveMahiloState", () => {
    it("creates state file with correct permissions", async () => {
      await saveMahiloState({
        runtime,
        state: {
          callback_secret: "secret-xyz",
          connection_id: "conn_123",
        },
      });

      const stateFile = path.join(tempDir, "mahilo", "state.json");
      const stats = await fs.stat(stateFile);
      // Check file exists and is readable
      expect(stats.isFile()).toBe(true);
      // Check permissions (0o600 = owner read/write only)
      const mode = stats.mode & 0o777;
      expect(mode).toBe(0o600);
    });

    it("merges with existing state", async () => {
      // Save initial state
      await saveMahiloState({
        runtime,
        state: {
          callback_secret: "secret-1",
          connection_id: "conn_1",
        },
      });

      // Save updated state (partial update)
      await saveMahiloState({
        runtime,
        state: {
          callback_secret: "secret-2",
        },
      });

      const loaded = await loadMahiloState({ runtime });
      expect(loaded?.callback_secret).toBe("secret-2");
      expect(loaded?.connection_id).toBe("conn_1"); // Preserved from first save
    });

    it("creates directory if it does not exist", async () => {
      await saveMahiloState({
        runtime,
        state: {
          callback_secret: "test",
        },
      });

      const stateFile = path.join(tempDir, "mahilo", "state.json");
      const exists = await fs.access(stateFile).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });
  });

  describe("clearMahiloState", () => {
    it("removes state file", async () => {
      // Create state file first
      await saveMahiloState({
        runtime,
        state: {
          callback_secret: "to-be-cleared",
        },
      });

      // Clear it
      await clearMahiloState({ runtime });

      // Verify it's gone
      const state = await loadMahiloState({ runtime });
      expect(state).toBeNull();
    });

    it("does not throw if file does not exist", async () => {
      // Should not throw
      await expect(clearMahiloState({ runtime })).resolves.not.toThrow();
    });
  });
});
