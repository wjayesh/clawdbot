/**
 * Tests for Mahilo plugin configuration.
 */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_ENCRYPTION_CONFIG,
  isEncryptionEnabled,
  isEncryptionRequired,
  resolveConfig,
  validateConfig,
} from "../src/config.js";
import type { MahiloPluginConfig } from "../src/types.js";

describe("resolveConfig", () => {
  it("applies default values for missing fields", () => {
    const config = resolveConfig({});

    expect(config.mahilo_api_url).toBe("https://api.mahilo.dev/api/v1");
    expect(config.callback_path).toBe("/mahilo/incoming");
    expect(config.connection_label).toBe("default");
    expect(config.auto_register).toBe(true);
    expect(config.inbound_session_key).toBe("main");
  });

  it("applies default encryption config", () => {
    const config = resolveConfig({});

    expect(config.encryption).toEqual(DEFAULT_ENCRYPTION_CONFIG);
    expect(config.encryption?.mode).toBe("off");
    expect(config.encryption?.allow_plaintext_fallback).toBe(true);
  });

  it("preserves user-specified encryption config", () => {
    const config = resolveConfig({
      encryption: {
        mode: "required",
        allow_plaintext_fallback: false,
      },
    });

    expect(config.encryption?.mode).toBe("required");
    expect(config.encryption?.allow_plaintext_fallback).toBe(false);
  });

  it("merges partial encryption config with defaults", () => {
    const config = resolveConfig({
      encryption: {
        mode: "opportunistic",
      },
    });

    expect(config.encryption?.mode).toBe("opportunistic");
    expect(config.encryption?.allow_plaintext_fallback).toBe(true); // default
  });
});

describe("validateConfig", () => {
  it("validates valid config", () => {
    const config: MahiloPluginConfig = {
      mahilo_api_key: "mhl_test_key",
      encryption: {
        mode: "opportunistic",
        allow_plaintext_fallback: true,
      },
    };

    const result = validateConfig(config);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects invalid encryption mode", () => {
    const config: MahiloPluginConfig = {
      encryption: {
        mode: "invalid" as any,
      },
    };

    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "encryption.mode must be one of: off, opportunistic, required",
    );
  });

  it("rejects conflicting encryption settings", () => {
    const config: MahiloPluginConfig = {
      encryption: {
        mode: "required",
        allow_plaintext_fallback: true,
      },
    };

    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("allow_plaintext_fallback cannot be true");
  });

  it("allows required mode with fallback false", () => {
    const config: MahiloPluginConfig = {
      encryption: {
        mode: "required",
        allow_plaintext_fallback: false,
      },
    };

    const result = validateConfig(config);
    expect(result.valid).toBe(true);
  });

  it("validates all encryption modes", () => {
    for (const mode of ["off", "opportunistic", "required"] as const) {
      const config: MahiloPluginConfig = {
        encryption: { mode, allow_plaintext_fallback: mode !== "required" },
      };
      const result = validateConfig(config);
      expect(result.valid).toBe(true);
    }
  });
});

describe("isEncryptionEnabled", () => {
  it("returns false for mode=off", () => {
    const config: MahiloPluginConfig = {
      encryption: { mode: "off" },
    };
    expect(isEncryptionEnabled(config)).toBe(false);
  });

  it("returns true for mode=opportunistic", () => {
    const config: MahiloPluginConfig = {
      encryption: { mode: "opportunistic" },
    };
    expect(isEncryptionEnabled(config)).toBe(true);
  });

  it("returns true for mode=required", () => {
    const config: MahiloPluginConfig = {
      encryption: { mode: "required" },
    };
    expect(isEncryptionEnabled(config)).toBe(true);
  });

  it("returns false for undefined encryption config", () => {
    const config: MahiloPluginConfig = {};
    expect(isEncryptionEnabled(config)).toBe(false);
  });
});

describe("isEncryptionRequired", () => {
  it("returns false for mode=off", () => {
    const config: MahiloPluginConfig = {
      encryption: { mode: "off" },
    };
    expect(isEncryptionRequired(config)).toBe(false);
  });

  it("returns false for mode=opportunistic", () => {
    const config: MahiloPluginConfig = {
      encryption: { mode: "opportunistic" },
    };
    expect(isEncryptionRequired(config)).toBe(false);
  });

  it("returns true for mode=required", () => {
    const config: MahiloPluginConfig = {
      encryption: { mode: "required" },
    };
    expect(isEncryptionRequired(config)).toBe(true);
  });

  it("returns false for undefined encryption config", () => {
    const config: MahiloPluginConfig = {};
    expect(isEncryptionRequired(config)).toBe(false);
  });
});
