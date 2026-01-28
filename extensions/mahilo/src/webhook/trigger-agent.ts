/**
 * Agent Run Triggering
 *
 * Triggers an agent run to process incoming Mahilo messages.
 * Uses callGateway to invoke the gateway's agent method.
 */

import { callGateway } from "../../../../src/gateway/call.js";
import type { PluginLogger } from "../../../../src/plugins/types.js";

import type { IncomingMessage, MahiloPluginConfig } from "../types.js";

export interface TriggerAgentContext {
  logger: PluginLogger;
  config: MahiloPluginConfig;
}

/**
 * Format an incoming Mahilo message for the agent.
 */
export function formatIncomingMessage(incoming: IncomingMessage): string {
  // Check if this is a group message
  const isGroupMessage = Boolean(incoming.group_id || incoming.group_name);
  const groupDisplay = incoming.group_name ?? incoming.group_id;

  let formatted: string;
  if (isGroupMessage) {
    formatted = `📬 Message from ${incoming.sender} in group "${groupDisplay}" (via Mahilo):\n\n`;
  } else {
    formatted = `📬 Message from ${incoming.sender} (via Mahilo):\n\n`;
  }

  formatted += incoming.message;

  if (incoming.context) {
    formatted += `\n\n[Context: ${incoming.context}]`;
  }

  formatted += "\n\n---\n";

  if (isGroupMessage) {
    formatted += `To reply to the group, use the talk_to_group tool with group_id "${incoming.group_id}".\n`;
    formatted += `To reply directly to ${incoming.sender}, use the talk_to_agent tool with recipient "${incoming.sender}".`;
  } else {
    formatted += `To reply, use the talk_to_agent tool with recipient "${incoming.sender}".`;
  }

  return formatted;
}

/**
 * Build extra system prompt context for the agent.
 */
function buildExtraSystemPrompt(incoming: IncomingMessage): string {
  const isGroupMessage = Boolean(incoming.group_id || incoming.group_name);
  const groupDisplay = incoming.group_name ?? incoming.group_id;

  const lines: (string | null)[] = [
    `You are receiving a message from another agent via the Mahilo network.`,
    `Sender: ${incoming.sender}`,
    incoming.sender_agent ? `Sender Agent: ${incoming.sender_agent}` : null,
  ];

  if (isGroupMessage) {
    lines.push(`Group: ${groupDisplay}`);
    lines.push(`Group ID: ${incoming.group_id}`);
    lines.push(`To reply to the group, use the talk_to_group tool with group_id "${incoming.group_id}".`);
    lines.push(`To reply directly to the sender, use the talk_to_agent tool with recipient "${incoming.sender}".`);
  } else {
    lines.push(`To reply, use the talk_to_agent tool with recipient "${incoming.sender}".`);
  }

  return lines.filter(Boolean).join("\n");
}

export interface TriggerAgentResult {
  ok: boolean;
  runId?: string;
  error?: string;
}

/**
 * Trigger an agent run to process the incoming message.
 *
 * This is called asynchronously after the webhook has acknowledged receipt.
 * Uses callGateway to invoke the gateway's agent method, which triggers
 * an actual agent run with the formatted message.
 */
export async function triggerAgentRun(
  incoming: IncomingMessage,
  ctx: TriggerAgentContext,
): Promise<TriggerAgentResult> {
  const formattedMessage = formatIncomingMessage(incoming);

  const groupInfo = incoming.group_id ? ` in group ${incoming.group_name ?? incoming.group_id}` : "";
  ctx.logger.info(`[Mahilo] Received message from ${incoming.sender}${groupInfo}: ${incoming.message_id}`);
  ctx.logger.info(`[Mahilo] Message: ${incoming.message}`);

  // Determine target session
  const sessionKey = ctx.config.inbound_session_key ?? "main";
  const agentId = ctx.config.inbound_agent_id;

  // Use the Mahilo message_id as idempotency key to prevent duplicate processing
  const idempotencyKey = `mahilo-${incoming.message_id}`;

  try {
    const response = (await callGateway({
      method: "agent",
      params: {
        message: formattedMessage,
        sessionKey,
        ...(agentId ? { agentId } : {}),
        idempotencyKey,
        deliver: false, // Don't auto-deliver to channels
        extraSystemPrompt: buildExtraSystemPrompt(incoming),
      },
      timeoutMs: 10_000, // 10 second timeout for accepting the run
    })) as { runId?: string; acceptedAt?: number };

    const runId = typeof response?.runId === "string" ? response.runId : idempotencyKey;

    ctx.logger.info(`[Mahilo] Agent run triggered: runId=${runId}, sessionKey=${sessionKey}`);

    // Log metadata for tracking
    const metadata: Record<string, unknown> = {
      source: "mahilo",
      mahilo_message_id: incoming.message_id,
      mahilo_correlation_id: incoming.correlation_id,
      mahilo_sender: incoming.sender,
      mahilo_sender_agent: incoming.sender_agent,
      run_id: runId,
      session_key: sessionKey,
      received_at: new Date().toISOString(),
    };

    // Include group info if present
    if (incoming.group_id) {
      metadata.mahilo_group_id = incoming.group_id;
      metadata.mahilo_group_name = incoming.group_name;
    }

    ctx.logger.info(`[Mahilo] Message metadata: ${JSON.stringify(metadata)}`);

    return { ok: true, runId };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    ctx.logger.error(`[Mahilo] Failed to trigger agent run: ${errorMessage}`);

    // Log the message content for manual recovery
    ctx.logger.warn(`[Mahilo] Unprocessed message from ${incoming.sender}:\n${formattedMessage}`);

    return { ok: false, error: errorMessage };
  }
}
