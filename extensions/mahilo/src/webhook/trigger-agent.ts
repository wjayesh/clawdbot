/**
 * Agent Run Triggering
 *
 * Triggers an agent run to process incoming Mahilo messages.
 */

import type { IncomingMessage } from "../types.js";
import type { PluginLogger } from "../../../../src/plugins/types.js";

export interface TriggerAgentContext {
  logger: PluginLogger;
}

/**
 * Format an incoming Mahilo message for the agent.
 */
export function formatIncomingMessage(incoming: IncomingMessage): string {
  let formatted = `📬 Message from ${incoming.sender} (via Mahilo):\n\n`;
  formatted += incoming.message;

  if (incoming.context) {
    formatted += `\n\n[Context: ${incoming.context}]`;
  }

  formatted += `\n\n---\nTo reply, use the talk_to_agent tool with recipient "${incoming.sender}".`;

  return formatted;
}

/**
 * Trigger an agent run to process the incoming message.
 *
 * This is called asynchronously after the webhook has acknowledged receipt.
 * The actual agent run implementation depends on the Clawdbot infrastructure.
 *
 * For Phase 1, we log the message and store it for manual review.
 * Full integration with the agent runner will be added when the infrastructure
 * is ready.
 */
export async function triggerAgentRun(
  incoming: IncomingMessage,
  ctx: TriggerAgentContext,
): Promise<void> {
  const formattedMessage = formatIncomingMessage(incoming);

  // Log the incoming message
  ctx.logger.info(`[Mahilo] Received message from ${incoming.sender}: ${incoming.message_id}`);

  // TODO: Integrate with Clawdbot's agent run infrastructure
  // This will use the cron/isolated-agent infrastructure or similar
  // to trigger an actual agent run with the formatted message.
  //
  // For now, we just log the formatted message.
  // The user can configure a cron job or manual trigger to process
  // Mahilo messages from the logs.

  ctx.logger.info(`[Mahilo] Message content:\n${formattedMessage}`);

  // Store metadata for tracking
  const metadata = {
    source: "mahilo",
    mahilo_message_id: incoming.message_id,
    mahilo_correlation_id: incoming.correlation_id,
    mahilo_sender: incoming.sender,
    mahilo_sender_agent: incoming.sender_agent,
    received_at: new Date().toISOString(),
  };

  ctx.logger.info(`[Mahilo] Message metadata: ${JSON.stringify(metadata)}`);
}
