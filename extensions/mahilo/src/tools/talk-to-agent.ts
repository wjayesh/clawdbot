/**
 * talk_to_agent Tool
 *
 * Sends a message to another user's agent through the Mahilo network.
 */

import { Type } from "@sinclair/typebox";

import { getMahiloClient } from "../client/mahilo-api.js";
import { resolveConfig } from "../config.js";
import { applyLocalPolicies } from "../policy/local-filter.js";
import { evaluatePolicies, type LlmPolicyEvaluatorConfig } from "../policy/llm-evaluator.js";
import type { AgentConnection } from "../types.js";
import { ErrorCodes, MahiloError } from "../types.js";

import type { MoltbotPluginApi } from "clawdbot/plugin-sdk";

/**
 * Select the best connection from available connections based on routing hints.
 */
function selectConnection(
  connections: AgentConnection[],
  options: {
    connectionLabel?: string;
    routingTags?: string[];
  },
): AgentConnection | null {
  if (connections.length === 0) {
    return null;
  }

  // If a specific label is requested, try to find it
  if (options.connectionLabel) {
    const match = connections.find(
      (c) => c.label === options.connectionLabel && c.status === "active",
    );
    if (match) return match;
  }

  // If routing tags are provided, score connections by tag overlap
  if (options.routingTags && options.routingTags.length > 0) {
    const scored = connections
      .filter((c) => c.status === "active")
      .map((c) => {
        const caps = c.capabilities ?? [];
        const overlap = options.routingTags!.filter((t) =>
          caps.some((cap) => cap.toLowerCase() === t.toLowerCase()),
        ).length;
        return { connection: c, score: overlap, priority: c.routing_priority ?? 0 };
      })
      .sort((a, b) => {
        // Sort by score (descending), then by priority (descending)
        if (b.score !== a.score) return b.score - a.score;
        return b.priority - a.priority;
      });

    if (scored.length > 0 && scored[0].score > 0) {
      return scored[0].connection;
    }
  }

  // Fall back to highest priority active connection
  const active = connections
    .filter((c) => c.status === "active")
    .sort((a, b) => (b.routing_priority ?? 0) - (a.routing_priority ?? 0));

  return active[0] ?? null;
}

export function createTalkToAgentTool(api: MoltbotPluginApi) {
  return {
    name: "talk_to_agent",
    description: `Send a message to another user's agent through the Mahilo network.

Use this when you need to:
- Ask another user's agent a question
- Share information with another user
- Collaborate on a task with another user's agent

The recipient must be in your friends list on Mahilo.
Your message will be validated against policies before sending.
The other agent will receive your message and may respond later via their own talk_to_agent call.

Parameters:
- recipient: The username of the person whose agent you want to contact (e.g., "alice")
- message: The actual message content
- context: (Optional) Explain why you're sending this message - helps the recipient understand your intent
- connection_label: (Optional) Target a specific connection label (e.g., "work")
- routing_tags: (Optional) Tags to help select the best recipient connection`,

    parameters: Type.Object({
      recipient: Type.String({
        description: "Username of the recipient (must be a friend on Mahilo)",
      }),
      message: Type.String({
        description: "The message to send",
      }),
      context: Type.Optional(
        Type.String({
          description: "Why you're sending this message (helps recipient understand)",
        }),
      ),
      connection_label: Type.Optional(
        Type.String({
          description: "Preferred recipient connection label (e.g., work, personal)",
        }),
      ),
      routing_tags: Type.Optional(
        Type.Array(Type.String(), {
          description: "Routing hints to select the best recipient connection",
        }),
      ),
    }),

    async execute(_id: string, params: Record<string, unknown>) {
      const recipient = String(params.recipient ?? "").trim();
      const message = String(params.message ?? "").trim();
      const context = params.context ? String(params.context).trim() : undefined;
      const connectionLabel = params.connection_label
        ? String(params.connection_label).trim()
        : undefined;
      const routingTags = Array.isArray(params.routing_tags)
        ? params.routing_tags.map((t) => String(t))
        : undefined;

      const config = resolveConfig(api.pluginConfig);

      // 1. Input validation
      if (!recipient) {
        return formatError("Recipient is required");
      }
      if (!message) {
        return formatError("Message is required");
      }

      // 2. Get Mahilo client
      let mahiloClient;
      try {
        mahiloClient = getMahiloClient(config);
      } catch (err) {
        if (err instanceof MahiloError) {
          return formatError(err.message);
        }
        return formatError("Failed to initialize Mahilo client");
      }

      // 3. Apply local policy filters
      const policyResult = applyLocalPolicies(message, context, config.local_policies);
      if (!policyResult.allowed) {
        return formatResult(`Message blocked by local policy: ${policyResult.reason}`);
      }

      // 4. Apply LLM policy filters (if enabled)
      if (config.llm_policies?.enabled) {
        try {
          // Fetch applicable policies for this recipient (outbound + global + user-specific)
          const policies = await mahiloClient.getApplicablePolicies({
            direction: "outbound",
            targetUser: recipient,
          });

          if (policies.length > 0) {
            const evalConfig: LlmPolicyEvaluatorConfig = {
              provider: config.llm_policies.provider,
              model: config.llm_policies.model,
              timeoutMs: config.llm_policies.timeout_ms ?? 15_000,
            };

            const llmResult = await evaluatePolicies(policies, message, context, evalConfig);
            if (!llmResult.allowed) {
              // Return clear message that doesn't leak policy details
              return formatResult(
                `Message blocked by content policy${llmResult.blocking_policy_name ? ` (${llmResult.blocking_policy_name})` : ""}. ` +
                  `Please review your message and try again.`,
              );
            }
          }
        } catch (err) {
          // Log but don't block on LLM policy errors (fail-open at integration level)
          // Individual policies can still use fail_behavior: "closed"
          console.warn(
            "[Mahilo] LLM policy evaluation failed:",
            err instanceof Error ? err.message : "Unknown error",
          );
        }
      }

      // 5. Resolve recipient connections and select target
      let recipientConnectionId: string | undefined;
      try {
        const connections = await mahiloClient.getContactConnections(recipient);
        const selected = selectConnection(connections, {
          connectionLabel,
          routingTags,
        });
        if (selected) {
          recipientConnectionId = selected.id;
        }
      } catch (err) {
        // Connection lookup failed - continue without specific connection
        // The registry will handle routing if no connection is specified
        if (err instanceof MahiloError && err.code === ErrorCodes.NOT_FRIENDS) {
          return formatResult(
            `Cannot send message: ${recipient} is not in your friends list. Add them as a friend on Mahilo first.`,
          );
        }
      }

      // 6. Send message
      try {
        const response = await mahiloClient.sendMessage({
          recipient,
          message,
          context,
          recipient_connection_id: recipientConnectionId,
          idempotency_key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        });

        // 7. Format result based on status
        switch (response.status) {
          case "delivered":
            return formatResult(
              `Message sent to ${recipient}. They will process it and may respond via their own message to you.`,
            );

          case "pending":
            return formatResult(
              `Message queued for ${recipient}. Delivery pending - they may be offline. Message ID: ${response.message_id}`,
            );

          case "rejected":
            return formatResult(
              `Message rejected: ${response.rejection_reason ?? "Policy violation"}`,
            );

          default:
            return formatResult(`Message sent to ${recipient}. Status: ${response.status}`);
        }
      } catch (err) {
        return handleSendError(err, recipient);
      }
    },
  };
}

function formatResult(text: string) {
  return {
    content: [{ type: "text", text }],
  };
}

function formatError(text: string) {
  return {
    content: [{ type: "text", text: `Error: ${text}` }],
    isError: true,
  };
}

function handleSendError(err: unknown, recipient: string) {
  if (err instanceof MahiloError) {
    switch (err.code) {
      case ErrorCodes.NOT_FRIENDS:
        return formatResult(
          `Cannot send message: ${recipient} is not in your friends list. Add them as a friend on Mahilo first.`,
        );

      case ErrorCodes.USER_NOT_FOUND:
        return formatResult(`Cannot send message: User "${recipient}" not found on Mahilo.`);

      case ErrorCodes.RATE_LIMITED:
        return formatResult(
          "Cannot send message: You're sending too many messages. Please wait before trying again.",
        );

      case ErrorCodes.INVALID_API_KEY:
        return formatError(
          "Mahilo API key is invalid or not configured. Check your plugin configuration.",
        );

      default:
        return formatResult(`Failed to send message: ${err.message}`);
    }
  }

  if (err instanceof Error) {
    return formatResult(`Failed to send message: ${err.message}`);
  }

  return formatResult("Failed to send message: Unknown error");
}
