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

import type { MoltbotPluginApi } from "clawdbot/plugin-sdk";

import { getMahiloClient } from "./src/client/mahilo-api.js";
import { resolveConfig, validateConfig } from "./src/config.js";
import {
  createTalkToAgentTool,
  createTalkToGroupTool,
  createListContactsTool,
} from "./src/tools/index.js";
import {
  createWebhookHandler,
  setCallbackSecret,
  startCleanup,
  stopCleanup,
} from "./src/webhook/index.js";
import type { MahiloPluginConfig } from "./src/types.js";
import { getOrCreateMahiloKeypair } from "./src/keys.js";

const plugin = {
  id: "mahilo",
  name: "Mahilo",
  description: "Inter-agent communication via Mahilo network",

  register(api: MoltbotPluginApi) {
    const config = resolveConfig(api.pluginConfig);
    const logger = api.logger;

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

    // Register agent with Mahilo on gateway start (if auto_register is enabled)
    api.on("gateway_start", async (event) => {
      if (!config.auto_register) {
        logger.info("[Mahilo] Auto-registration disabled");
        return;
      }

      if (!config.mahilo_api_key) {
        logger.warn(
          "[Mahilo] Cannot auto-register: mahilo_api_key not configured",
        );
        return;
      }

      await registerAgent(config, event.port, logger, api.runtime);
    });

    // Cleanup on gateway stop
    api.on("gateway_stop", () => {
      stopCleanup();
      logger.info("[Mahilo] Plugin cleanup complete");
    });
  },
};

/**
 * Register this agent with the Mahilo Registry.
 */
async function registerAgent(
  config: MahiloPluginConfig,
  port: number,
  logger: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void },
  runtime: MoltbotPluginApi["runtime"],
): Promise<void> {
  try {
    const mahiloClient = getMahiloClient(config);
    const keypair = await getOrCreateMahiloKeypair({ runtime });

    // Determine callback URL
    let callbackUrl: string;
    if (config.callback_url_override) {
      callbackUrl = config.callback_url_override;
    } else {
      // For development, use localhost
      // In production, this should be the public gateway URL
      callbackUrl = `http://localhost:${port}${config.callback_path ?? "/mahilo/incoming"}`;
      logger.warn(
        `[Mahilo] Using localhost callback URL: ${callbackUrl}. Set callback_url_override for production.`,
      );
    }

    const response = await mahiloClient.registerAgent({
      framework: "clawdbot",
      label: config.connection_label ?? "default",
      description: config.connection_description,
      capabilities: config.connection_capabilities,
      callback_url: callbackUrl,
      public_key: keypair.publicKey,
      public_key_alg: keypair.algorithm,
    });

    // Store the callback secret for signature verification
    if (response.callback_secret) {
      setCallbackSecret(response.callback_secret);
    }

    logger.info(
      `[Mahilo] Agent registered with Mahilo. Connection ID: ${response.connection_id}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[Mahilo] Failed to register agent: ${message}`);
  }
}

export default plugin;
