/**
 * talk_to_group Tool
 *
 * Sends a message to a Mahilo group.
 */

import { Type } from "@sinclair/typebox";
import type { MoltbotPluginApi } from "clawdbot/plugin-sdk";

import { getMahiloClient } from "../client/mahilo-api.js";
import { resolveConfig } from "../config.js";
import { applyLocalPolicies } from "../policy/local-filter.js";
import { evaluatePolicies, type LlmPolicyEvaluatorConfig } from "../policy/llm-evaluator.js";
import { ErrorCodes, MahiloError } from "../types.js";

export function createTalkToGroupTool(api: MoltbotPluginApi) {
  return {
    name: "talk_to_group",
    description: `Send a message to a Mahilo group.

Use this when you need to:
- Share information with a group of agents
- Coordinate in a shared Mahilo group

You must be a member of the group. Use the group's id, not its display name.

Parameters:
- group_id: The Mahilo group id to contact
- message: The actual message content
- context: (Optional) Why you're sending this message - helps recipients understand your intent`,

    parameters: Type.Object({
      group_id: Type.String({
        description: "Mahilo group id (not the group name)",
      }),
      message: Type.String({
        description: "The message to send",
      }),
      context: Type.Optional(
        Type.String({
          description: "Why you're sending this message (helps recipients understand)",
        }),
      ),
    }),

    async execute(_id: string, params: Record<string, unknown>) {
      const groupId = String(params.group_id ?? "").trim();
      const message = String(params.message ?? "").trim();
      const context = params.context ? String(params.context).trim() : undefined;

      const config = resolveConfig(api.pluginConfig);

      // 1. Input validation
      if (!groupId) {
        return formatError("Group id is required");
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
          // Fetch applicable policies for this group (outbound + global + group-specific)
          const policies = await mahiloClient.getApplicablePolicies({
            direction: "outbound",
            targetGroup: groupId,
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
          console.warn(
            "[Mahilo] LLM policy evaluation failed:",
            err instanceof Error ? err.message : "Unknown error",
          );
        }
      }

      // 5. Send message
      try {
        const response = await mahiloClient.sendMessage({
          recipient: groupId,
          recipient_type: "group",
          message,
          context,
          idempotency_key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        });

        switch (response.status) {
          case "delivered":
            return formatResult(`Message sent to group ${groupId}.`);
          case "pending":
            return formatResult(
              `Message queued for group ${groupId}. Delivery pending. Message ID: ${response.message_id}`,
            );
          case "rejected":
            return formatResult(
              `Message rejected: ${response.rejection_reason ?? "Policy violation"}`,
            );
          default:
            return formatResult(`Message sent to group ${groupId}. Status: ${response.status}`);
        }
      } catch (err) {
        return handleSendError(err, groupId);
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

function handleSendError(err: unknown, groupId: string) {
  if (err instanceof MahiloError) {
    switch (err.code) {
      case ErrorCodes.NOT_GROUP_MEMBER:
        return formatResult(
          `Cannot send message: you're not a member of group "${groupId}". Join the group first.`,
        );
      case ErrorCodes.GROUP_NOT_FOUND:
        return formatResult(`Cannot send message: group "${groupId}" not found on Mahilo.`);
      case ErrorCodes.RATE_LIMITED:
        return formatResult(
          "Cannot send message: you're sending too many messages. Please wait before trying again.",
        );
      case ErrorCodes.INVALID_API_KEY:
        return formatError(
          "Mahilo API key is invalid or not configured. Check your plugin configuration.",
        );
      case ErrorCodes.NOT_IMPLEMENTED:
        return formatResult(
          "Group messaging is not supported by the Mahilo Registry yet. Try again after group support is released.",
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
