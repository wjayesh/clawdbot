/**
 * Webhook Handler
 *
 * Handles incoming messages from Mahilo Registry.
 */

import type { IncomingMessage as HttpIncomingMessage, ServerResponse } from "node:http";

import { resolveConfig } from "../config.js";
import { applyInboundPolicies } from "../policy/local-filter.js";
import type { IncomingMessage, MahiloPluginConfig } from "../types.js";
import { hasProcessedMessage, markMessageProcessed } from "./dedup.js";
import { verifyMahiloSignature } from "./signature.js";
import { triggerAgentRun } from "./trigger-agent.js";

import type { PluginLogger } from "../../../../src/plugins/types.js";

interface HandlerContext {
  pluginConfig: Record<string, unknown> | undefined;
  logger: PluginLogger;
  callbackSecret: string | null;
}

// Store callback secret after registration
let storedCallbackSecret: string | null = null;

export function setCallbackSecret(secret: string): void {
  storedCallbackSecret = secret;
}

export function getCallbackSecret(): string | null {
  return storedCallbackSecret;
}

/**
 * Create the webhook handler for incoming Mahilo messages.
 */
export function createWebhookHandler(ctx: HandlerContext) {
  return async (req: HttpIncomingMessage, res: ServerResponse): Promise<void> => {
    const config = resolveConfig(ctx.pluginConfig);

    // Collect raw body for signature verification (addresses HIGH-1)
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    const rawBody = Buffer.concat(chunks).toString("utf8");

    // Parse JSON body
    let body: IncomingMessage;
    try {
      body = JSON.parse(rawBody) as IncomingMessage;
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON body" }));
      return;
    }

    // Get headers
    const signature = req.headers["x-mahilo-signature"] as string | undefined;
    const timestamp = req.headers["x-mahilo-timestamp"] as string | undefined;

    // Verify signature
    const secret = ctx.callbackSecret ?? storedCallbackSecret;
    if (secret && signature && timestamp) {
      if (!verifyMahiloSignature(rawBody, signature, timestamp, secret)) {
        ctx.logger.warn("[Mahilo] Invalid signature on incoming message");
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid signature" }));
        return;
      }
    } else if (secret) {
      // Secret is configured but signature headers are missing
      ctx.logger.warn("[Mahilo] Missing signature headers on incoming message");
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing signature headers" }));
      return;
    }

    // Validate required fields
    if (!body.message_id || !body.sender || !body.message) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid message format: missing required fields" }));
      return;
    }

    // De-duplicate by message_id (addresses HIGH-2)
    if (hasProcessedMessage(body.message_id)) {
      ctx.logger.info(`[Mahilo] Duplicate message ignored: ${body.message_id}`);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ acknowledged: true, duplicate: true }));
      return;
    }

    // Apply inbound policies
    const policyResult = applyInboundPolicies(body.message, config.inbound_policies);
    if (!policyResult.allowed) {
      ctx.logger.info(`[Mahilo] Message blocked by inbound policy: ${policyResult.reason}`);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          acknowledged: true,
          processed: false,
          reason: policyResult.reason,
        }),
      );
      return;
    }

    // Mark as processed before acknowledging
    markMessageProcessed(body.message_id);

    // Acknowledge receipt IMMEDIATELY (don't wait for agent processing)
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ acknowledged: true }));

    // Trigger agent run asynchronously (after response is sent)
    setImmediate(() => {
      triggerAgentRun(body, { logger: ctx.logger }).catch((error) => {
        ctx.logger.error(`[Mahilo] Failed to trigger agent run for message ${body.message_id}: ${error}`);
      });
    });
  };
}
