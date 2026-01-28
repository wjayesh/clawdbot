/**
 * Mahilo Callback URL Detection
 *
 * Determines the public callback URL for Mahilo registration.
 * Tries multiple strategies: config override, tailscale, then localhost fallback.
 */

import type { MahiloPluginConfig } from "./types.js";

export type CallbackUrlDetectionContext = {
  config: MahiloPluginConfig;
  port: number;
  /** The full moltbot config, used to check tailscale settings */
  gatewayConfig?: {
    tailscale?: { mode?: "off" | "serve" | "funnel" };
  };
  /** Tailnet hostname detector (injected for testing) */
  getTailnetHostname?: () => Promise<string>;
  logger: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
  };
};

export type CallbackUrlResult = {
  url: string;
  source: "override" | "tailscale" | "localhost";
  warnings: string[];
};

/**
 * Detect the public callback URL for Mahilo registration.
 *
 * Strategy order:
 * 1. Use callback_url_override if set
 * 2. If tailscale serve/funnel is enabled, detect the tailnet hostname
 * 3. Fall back to localhost (with a warning)
 */
export async function detectCallbackUrl(
  ctx: CallbackUrlDetectionContext,
): Promise<CallbackUrlResult> {
  const { config, port, logger } = ctx;
  const callbackPath = config.callback_path ?? "/mahilo/incoming";
  const warnings: string[] = [];

  // 1. Check for explicit override
  if (config.callback_url_override) {
    const url = config.callback_url_override;
    const validation = validateCallbackUrl(url);
    if (validation.warnings.length > 0) {
      warnings.push(...validation.warnings);
      for (const w of validation.warnings) {
        logger.warn(`[Mahilo] ${w}`);
      }
    }
    return { url, source: "override", warnings };
  }

  // 2. Check for tailscale serve/funnel mode
  const tailscaleMode = ctx.gatewayConfig?.tailscale?.mode;
  if (tailscaleMode === "serve" || tailscaleMode === "funnel") {
    const getTailnet = ctx.getTailnetHostname ?? defaultGetTailnetHostname;
    try {
      const hostname = await getTailnet();
      if (hostname) {
        // Tailscale serve/funnel uses HTTPS on port 443
        const url = `https://${hostname}${callbackPath}`;
        logger.info(`[Mahilo] Detected tailscale hostname: ${hostname}`);
        return { url, source: "tailscale", warnings };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`[Mahilo] Failed to detect tailscale hostname: ${msg}`);
    }
  }

  // 3. Fall back to localhost
  const url = `http://localhost:${port}${callbackPath}`;
  const warning =
    "Using localhost callback URL. Mahilo messages will only work locally. " +
    "Set callback_url_override or enable tailscale for production use.";
  warnings.push(warning);
  logger.warn(`[Mahilo] ${warning}`);

  return { url, source: "localhost", warnings };
}

/**
 * Validate a callback URL and return any warnings.
 */
export function validateCallbackUrl(url: string): { warnings: string[] } {
  const warnings: string[] = [];

  try {
    const parsed = new URL(url);

    // Warn about HTTP (insecure)
    if (parsed.protocol === "http:") {
      const isLocalhost =
        parsed.hostname === "localhost" ||
        parsed.hostname === "127.0.0.1" ||
        parsed.hostname === "::1";
      if (!isLocalhost) {
        warnings.push(
          `Callback URL uses insecure HTTP (${url}). Consider using HTTPS for production.`,
        );
      }
    }

    // Warn about localhost/loopback (won't work externally)
    if (
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "::1"
    ) {
      warnings.push(
        `Callback URL points to localhost (${url}). External agents cannot reach this address.`,
      );
    }

    // Warn about private IP ranges
    if (isPrivateIp(parsed.hostname)) {
      warnings.push(
        `Callback URL uses private IP (${parsed.hostname}). External agents may not reach this address.`,
      );
    }
  } catch {
    warnings.push(`Invalid callback URL format: ${url}`);
  }

  return { warnings };
}

/**
 * Check if an IP address is in a private range.
 */
function isPrivateIp(hostname: string): boolean {
  // Check for private IPv4 ranges
  const privateRanges = [
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, // 10.0.0.0/8
    /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/, // 172.16.0.0/12
    /^192\.168\.\d{1,3}\.\d{1,3}$/, // 192.168.0.0/16
  ];

  return privateRanges.some((range) => range.test(hostname));
}

/**
 * Default implementation for getting tailnet hostname.
 * This is dynamically imported to avoid bundling tailscale deps.
 */
async function defaultGetTailnetHostname(): Promise<string> {
  // Dynamic import to avoid requiring tailscale at plugin load time
  const { getTailnetHostname } = await import("../../../src/infra/tailscale.js");
  return getTailnetHostname();
}
