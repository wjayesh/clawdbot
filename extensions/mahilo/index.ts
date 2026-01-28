/**
 * Clawdbot Mahilo Plugin
 *
 * Enables inter-agent communication via the Mahilo network.
 *
 * Features:
 * - talk_to_agent tool: Send messages to other users' agents
 * - list_mahilo_contacts tool: List friends on Mahilo
 * - Webhook endpoint: Receive messages from Mahilo
 * - Auto-registration: Register agent with Mahilo on startup
 * - Local policy enforcement: Privacy-preserving message filtering
 */

import type { MoltbotPluginApi, MoltbotPluginServiceContext } from "clawdbot/plugin-sdk";

import { detectCallbackUrl } from "./src/callback-url.js";
import { getMahiloClient } from "./src/client/mahilo-api.js";
import { isEncryptionEnabled, resolveConfig, validateConfig } from "./src/config.js";
import { getOrCreateMahiloKeypair } from "./src/keys.js";
import { loadMahiloState, saveMahiloState } from "./src/state.js";
import {
  createTalkToAgentTool,
  createTalkToGroupTool,
  createListContactsTool,
} from "./src/tools/index.js";
import type { MahiloPluginConfig } from "./src/types.js";
import {
  createWebhookHandler,
  setCallbackSecret,
  startCleanup,
  stopCleanup,
} from "./src/webhook/index.js";

// Module-level state for service to access
let pluginRuntime: MoltbotPluginApi["runtime"] | null = null;
let pluginConfig: MahiloPluginConfig | null = null;
let pluginLogger: MoltbotPluginApi["logger"] | null = null;

const plugin = {
  id: "mahilo",
  name: "Mahilo",
  description: "Inter-agent communication via Mahilo network",

  register(api: MoltbotPluginApi) {
    const config = resolveConfig(api.pluginConfig);
    const logger = api.logger;

    // Store for service access
    pluginRuntime = api.runtime;
    pluginConfig = config;
    pluginLogger = logger;

    // Validate configuration
    const validation = validateConfig(config);
    if (!validation.valid) {
      logger.warn(`[Mahilo] Configuration issues: ${validation.errors.join(", ")}`);
    }

    // Register tools
    api.registerTool(createTalkToAgentTool(api), { optional: true });
    api.registerTool(createTalkToGroupTool(api), { optional: true });
    api.registerTool(createListContactsTool(api), { optional: true });

    // Register webhook route
    const callbackPath = config.callback_path ?? "/mahilo/incoming";
    api.registerHttpRoute({
      path: callbackPath,
      handler: createWebhookHandler({
        pluginConfig: api.pluginConfig,
        logger: api.logger,
        callbackSecret: null, // Will be set after registration
      }),
    });

    logger.info(`[Mahilo] Plugin registered. Webhook path: ${callbackPath}`);

    // Start dedup cleanup
    startCleanup();

    // Register auto-registration service (runs after HTTP server is listening)
    if (config.auto_register) {
      api.registerService({
        id: "mahilo-auto-register",
        start: async (ctx) => {
          if (!pluginConfig?.mahilo_api_key) {
            pluginLogger?.warn("[Mahilo] Cannot auto-register: mahilo_api_key not configured");
            return;
          }

          // Determine port from config or callback_url_override
          const port = ctx.config?.gateway?.port ?? 18789;
          await registerAgent(pluginConfig, port, pluginLogger!, pluginRuntime!, ctx);
        },
        stop: () => {
          stopCleanup();
          pluginLogger?.info("[Mahilo] Plugin cleanup complete");
        },
      });
    }
  },
};

/**
 * Register this agent with the Mahilo Registry.
 * Uses persisted state to avoid unnecessary re-registrations.
 * Detects public callback URL from config, tailscale, or localhost fallback.
 */
async function registerAgent(
  config: MahiloPluginConfig,
  port: number,
  logger: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void },
  runtime: MoltbotPluginApi["runtime"],
  serviceCtx?: MoltbotPluginServiceContext,
): Promise<void> {
  try {
    // Detect callback URL using config, tailscale, or localhost fallback
    const detection = await detectCallbackUrl({
      config,
      port,
      gatewayConfig: serviceCtx?.config?.gateway,
      logger,
    });
    const callbackUrl = detection.url;

    // Check persisted state to see if we can skip re-registration
    const persistedState = await loadMahiloState({ runtime });
    if (
      persistedState?.callback_secret &&
      persistedState.registered_callback_url === callbackUrl
    ) {
      // Reuse existing registration
      setCallbackSecret(persistedState.callback_secret);
      logger.info(
        `[Mahilo] Reusing existing registration. Connection ID: ${persistedState.connection_id ?? "unknown"}`,
      );
      return;
    }

    // Need to register (new or callback URL changed)
    const mahiloClient = getMahiloClient(config);
    const keypair = await getOrCreateMahiloKeypair({ runtime });

    // Determine if we should advertise encryption support
    const supportsEncryption = isEncryptionEnabled(config);

    const response = await mahiloClient.registerAgent({
      framework: "clawdbot",
      label: config.connection_label ?? "default",
      description: config.connection_description,
      capabilities: config.connection_capabilities,
      callback_url: callbackUrl,
      public_key: keypair.publicKey,
      public_key_alg: keypair.algorithm,
      supports_encryption: supportsEncryption,
      encryption_alg: supportsEncryption ? "x25519-xsalsa20-poly1305" : undefined,
    });

    // Store the callback secret for signature verification (in memory)
    if (response.callback_secret) {
      setCallbackSecret(response.callback_secret);
    }

    // Persist state for next startup
    await saveMahiloState({
      runtime,
      state: {
        callback_secret: response.callback_secret,
        connection_id: response.connection_id,
        registered_at: new Date().toISOString(),
        registered_callback_url: callbackUrl,
      },
    });

    const encryptionStatus = supportsEncryption
      ? `encryption: ${config.encryption?.mode}`
      : "encryption: off";
    logger.info(
      `[Mahilo] Agent registered with Mahilo. Connection ID: ${response.connection_id} (${encryptionStatus})`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[Mahilo] Failed to register agent: ${message}`);
  }
}

export default plugin;
