/**
 * Local Policy Filter
 *
 * Applies local policy checks before messages are sent or after they are received.
 * Policies are enforced locally to ensure privacy (no message content sent to registry).
 */

import type { InboundPolicyConfig, LocalPolicyConfig, PolicyResult } from "../types.js";

/**
 * Apply local policies to outbound messages.
 */
export function applyLocalPolicies(
  message: string,
  context: string | undefined,
  config: LocalPolicyConfig | undefined,
): PolicyResult {
  if (!config) {
    return { allowed: true };
  }

  // Check message length (max)
  if (config.maxMessageLength !== undefined && message.length > config.maxMessageLength) {
    return {
      allowed: false,
      reason: `Message too long (${message.length} chars, max ${config.maxMessageLength})`,
    };
  }

  // Check message length (min)
  if (config.minMessageLength !== undefined && message.length < config.minMessageLength) {
    return {
      allowed: false,
      reason: `Message too short (${message.length} chars, min ${config.minMessageLength})`,
    };
  }

  // Check blocked keywords (case-insensitive)
  if (config.blockedKeywords && config.blockedKeywords.length > 0) {
    const lowerMessage = message.toLowerCase();
    for (const keyword of config.blockedKeywords) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        return {
          allowed: false,
          reason: "Message contains blocked keyword",
        };
      }
    }
  }

  // Check blocked patterns (regex)
  if (config.blockedPatterns && config.blockedPatterns.length > 0) {
    for (const pattern of config.blockedPatterns) {
      try {
        const regex = new RegExp(pattern, "i");
        if (regex.test(message)) {
          return {
            allowed: false,
            reason: "Message matches blocked pattern",
          };
        }
      } catch {
        // Invalid regex pattern, skip
      }
    }
  }

  // Check context requirement
  if (config.requireContext && (!context || context.trim() === "")) {
    return {
      allowed: false,
      reason: "Context is required for outgoing messages",
    };
  }

  return { allowed: true };
}

/**
 * Apply inbound policies to received messages.
 */
export function applyInboundPolicies(
  message: string,
  config: InboundPolicyConfig | undefined,
): PolicyResult {
  if (!config) {
    return { allowed: true };
  }

  // Check blocked keywords (case-insensitive)
  if (config.blockedKeywords && config.blockedKeywords.length > 0) {
    const lowerMessage = message.toLowerCase();
    for (const keyword of config.blockedKeywords) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        return {
          allowed: false,
          reason: "Message contains blocked keyword",
        };
      }
    }
  }

  // Check blocked patterns (regex)
  if (config.blockedPatterns && config.blockedPatterns.length > 0) {
    for (const pattern of config.blockedPatterns) {
      try {
        const regex = new RegExp(pattern, "i");
        if (regex.test(message)) {
          return {
            allowed: false,
            reason: "Message matches blocked pattern",
          };
        }
      } catch {
        // Invalid regex pattern, skip
      }
    }
  }

  return { allowed: true };
}
