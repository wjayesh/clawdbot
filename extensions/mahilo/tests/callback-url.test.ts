/**
 * Tests for Mahilo callback URL detection.
 */

import { describe, expect, it, vi } from "vitest";

import {
  detectCallbackUrl,
  validateCallbackUrl,
  type CallbackUrlDetectionContext,
} from "../src/callback-url.js";
import type { MahiloPluginConfig } from "../src/types.js";

function createContext(
  overrides: Partial<CallbackUrlDetectionContext> = {},
): CallbackUrlDetectionContext {
  return {
    config: {} as MahiloPluginConfig,
    port: 18789,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
    },
    ...overrides,
  };
}

describe("detectCallbackUrl", () => {
  describe("callback_url_override", () => {
    it("uses override when provided", async () => {
      const ctx = createContext({
        config: {
          callback_url_override: "https://my-domain.com/mahilo/incoming",
        } as MahiloPluginConfig,
      });

      const result = await detectCallbackUrl(ctx);

      expect(result.url).toBe("https://my-domain.com/mahilo/incoming");
      expect(result.source).toBe("override");
    });

    it("warns about insecure HTTP override", async () => {
      const ctx = createContext({
        config: {
          callback_url_override: "http://public-server.com/mahilo/incoming",
        } as MahiloPluginConfig,
      });

      const result = await detectCallbackUrl(ctx);

      expect(result.url).toBe("http://public-server.com/mahilo/incoming");
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain("insecure HTTP");
      expect(ctx.logger.warn).toHaveBeenCalled();
    });

    it("warns about localhost override", async () => {
      const ctx = createContext({
        config: {
          callback_url_override: "http://localhost:8080/mahilo",
        } as MahiloPluginConfig,
      });

      const result = await detectCallbackUrl(ctx);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain("localhost");
    });
  });

  describe("tailscale detection", () => {
    it("detects tailscale hostname when serve mode is enabled", async () => {
      const mockGetTailnet = vi.fn().mockResolvedValue("my-host.tailnet-abc.ts.net");
      const ctx = createContext({
        gatewayConfig: { tailscale: { mode: "serve" } },
        getTailnetHostname: mockGetTailnet,
      });

      const result = await detectCallbackUrl(ctx);

      expect(result.url).toBe("https://my-host.tailnet-abc.ts.net/mahilo/incoming");
      expect(result.source).toBe("tailscale");
      expect(mockGetTailnet).toHaveBeenCalled();
    });

    it("detects tailscale hostname when funnel mode is enabled", async () => {
      const mockGetTailnet = vi.fn().mockResolvedValue("funnel-host.tailnet.ts.net");
      const ctx = createContext({
        gatewayConfig: { tailscale: { mode: "funnel" } },
        getTailnetHostname: mockGetTailnet,
      });

      const result = await detectCallbackUrl(ctx);

      expect(result.url).toBe("https://funnel-host.tailnet.ts.net/mahilo/incoming");
      expect(result.source).toBe("tailscale");
    });

    it("falls back to localhost when tailscale detection fails", async () => {
      const mockGetTailnet = vi.fn().mockRejectedValue(new Error("tailscale not running"));
      const ctx = createContext({
        gatewayConfig: { tailscale: { mode: "serve" } },
        getTailnetHostname: mockGetTailnet,
        port: 9999,
      });

      const result = await detectCallbackUrl(ctx);

      expect(result.url).toBe("http://localhost:9999/mahilo/incoming");
      expect(result.source).toBe("localhost");
      expect(ctx.logger.warn).toHaveBeenCalled();
    });

    it("does not try tailscale when mode is off", async () => {
      const mockGetTailnet = vi.fn().mockResolvedValue("should-not-be-called.ts.net");
      const ctx = createContext({
        gatewayConfig: { tailscale: { mode: "off" } },
        getTailnetHostname: mockGetTailnet,
      });

      const result = await detectCallbackUrl(ctx);

      expect(result.source).toBe("localhost");
      expect(mockGetTailnet).not.toHaveBeenCalled();
    });
  });

  describe("localhost fallback", () => {
    it("uses localhost when no override or tailscale", async () => {
      const ctx = createContext({ port: 12345 });

      const result = await detectCallbackUrl(ctx);

      expect(result.url).toBe("http://localhost:12345/mahilo/incoming");
      expect(result.source).toBe("localhost");
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it("uses custom callback_path", async () => {
      const ctx = createContext({
        config: { callback_path: "/webhooks/mahilo" } as MahiloPluginConfig,
        port: 8080,
      });

      const result = await detectCallbackUrl(ctx);

      expect(result.url).toBe("http://localhost:8080/webhooks/mahilo");
    });
  });
});

describe("validateCallbackUrl", () => {
  it("returns no warnings for valid HTTPS URL", () => {
    const result = validateCallbackUrl("https://api.example.com/webhook");
    expect(result.warnings).toHaveLength(0);
  });

  it("warns about HTTP on public hosts", () => {
    const result = validateCallbackUrl("http://api.example.com/webhook");
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("insecure HTTP");
  });

  it("does not warn about HTTP on localhost", () => {
    const result = validateCallbackUrl("http://localhost:8080/webhook");
    // Should only warn about localhost, not HTTP
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain("localhost");
    expect(result.warnings[0]).not.toContain("insecure");
  });

  it("warns about private IP ranges", () => {
    const result = validateCallbackUrl("https://192.168.1.100:8080/webhook");
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("private IP");
  });

  it("warns about 10.x.x.x range", () => {
    const result = validateCallbackUrl("https://10.0.0.1/webhook");
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("private IP");
  });

  it("warns about 172.16-31.x.x range", () => {
    const result = validateCallbackUrl("https://172.20.0.1/webhook");
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("private IP");
  });

  it("does not warn about 172.15.x.x (not private)", () => {
    const result = validateCallbackUrl("https://172.15.0.1/webhook");
    expect(result.warnings).toHaveLength(0);
  });

  it("warns about invalid URL format", () => {
    const result = validateCallbackUrl("not-a-valid-url");
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("Invalid callback URL");
  });
});
