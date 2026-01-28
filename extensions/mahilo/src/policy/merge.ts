/**
 * Policy Merge Module
 *
 * Merges local policies with registry policies.
 * - Local policies take precedence over registry policies
 * - For heuristic rules: merge by taking stricter values
 * - For LLM policies: combine all policies in priority order
 */

import type {
  HeuristicPolicy,
  HeuristicPolicyRules,
  InboundPolicyConfig,
  LocalPolicyConfig,
  PolicySourceMode,
} from "../types.js";

export interface MergedHeuristicRules {
  /** Maximum message length (takes the smaller/stricter value) */
  maxMessageLength?: number;
  /** Minimum message length (takes the larger/stricter value) */
  minMessageLength?: number;
  /** Combined blocked keywords from all sources */
  blockedKeywords: string[];
  /** Combined blocked patterns from all sources */
  blockedPatterns: string[];
  /** Require context (true if any policy requires it) */
  requireContext: boolean;
}

/**
 * Merge heuristic rules from multiple sources.
 * Takes the stricter value for numeric limits and combines arrays.
 */
export function mergeHeuristicRules(
  ...sources: (HeuristicPolicyRules | LocalPolicyConfig | InboundPolicyConfig | undefined)[]
): MergedHeuristicRules {
  const merged: MergedHeuristicRules = {
    blockedKeywords: [],
    blockedPatterns: [],
    requireContext: false,
  };

  const seenKeywords = new Set<string>();
  const seenPatterns = new Set<string>();

  for (const source of sources) {
    if (!source) continue;

    // maxMessageLength: take the smaller (stricter) value
    if ("maxMessageLength" in source && source.maxMessageLength !== undefined) {
      if (merged.maxMessageLength === undefined) {
        merged.maxMessageLength = source.maxMessageLength;
      } else {
        merged.maxMessageLength = Math.min(merged.maxMessageLength, source.maxMessageLength);
      }
    }

    // minMessageLength: take the larger (stricter) value
    if ("minMessageLength" in source && source.minMessageLength !== undefined) {
      if (merged.minMessageLength === undefined) {
        merged.minMessageLength = source.minMessageLength;
      } else {
        merged.minMessageLength = Math.max(merged.minMessageLength, source.minMessageLength);
      }
    }

    // blockedKeywords: combine and dedupe (case-insensitive)
    if (source.blockedKeywords) {
      for (const kw of source.blockedKeywords) {
        const lower = kw.toLowerCase();
        if (!seenKeywords.has(lower)) {
          seenKeywords.add(lower);
          merged.blockedKeywords.push(kw);
        }
      }
    }

    // blockedPatterns: combine and dedupe
    if (source.blockedPatterns) {
      for (const pattern of source.blockedPatterns) {
        if (!seenPatterns.has(pattern)) {
          seenPatterns.add(pattern);
          merged.blockedPatterns.push(pattern);
        }
      }
    }

    // requireContext: true if any policy requires it
    if ("requireContext" in source && source.requireContext) {
      merged.requireContext = true;
    }
  }

  return merged;
}

/**
 * Merge local config with registry heuristic policies.
 * Returns merged rules based on the policy source mode.
 */
export function mergeOutboundPolicies(
  localConfig: LocalPolicyConfig | undefined,
  registryPolicies: HeuristicPolicy[],
  mode: PolicySourceMode,
): MergedHeuristicRules {
  switch (mode) {
    case "local":
      return mergeHeuristicRules(localConfig);

    case "registry": {
      // Merge all registry policies in priority order (highest first)
      const registryRules = registryPolicies.map((p) => p.rules);
      return mergeHeuristicRules(...registryRules);
    }

    case "merged":
    default: {
      // Local policies take precedence, then registry
      // Put local first so it's processed first and any stricter values from it are kept
      const registryRules = registryPolicies.map((p) => p.rules);
      return mergeHeuristicRules(localConfig, ...registryRules);
    }
  }
}

/**
 * Merge local inbound config with registry heuristic policies.
 * Returns merged rules based on the policy source mode.
 */
export function mergeInboundPolicies(
  localConfig: InboundPolicyConfig | undefined,
  registryPolicies: HeuristicPolicy[],
  mode: PolicySourceMode,
): MergedHeuristicRules {
  switch (mode) {
    case "local":
      return mergeHeuristicRules(localConfig);

    case "registry": {
      const registryRules = registryPolicies.map((p) => p.rules);
      return mergeHeuristicRules(...registryRules);
    }

    case "merged":
    default: {
      const registryRules = registryPolicies.map((p) => p.rules);
      return mergeHeuristicRules(localConfig, ...registryRules);
    }
  }
}

/**
 * Apply merged heuristic rules to a message.
 * Returns whether the message is allowed and any rejection reason.
 */
export function applyMergedHeuristicRules(
  message: string,
  context: string | undefined,
  rules: MergedHeuristicRules,
  direction: "outbound" | "inbound",
): { allowed: boolean; reason?: string } {
  // Check message length (max)
  if (rules.maxMessageLength !== undefined && message.length > rules.maxMessageLength) {
    return {
      allowed: false,
      reason: `Message too long (${message.length} chars, max ${rules.maxMessageLength})`,
    };
  }

  // Check message length (min) - only for outbound
  if (
    direction === "outbound" &&
    rules.minMessageLength !== undefined &&
    message.length < rules.minMessageLength
  ) {
    return {
      allowed: false,
      reason: `Message too short (${message.length} chars, min ${rules.minMessageLength})`,
    };
  }

  // Check blocked keywords (case-insensitive)
  if (rules.blockedKeywords.length > 0) {
    const lowerMessage = message.toLowerCase();
    for (const keyword of rules.blockedKeywords) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        return {
          allowed: false,
          reason: "Message contains blocked keyword",
        };
      }
    }
  }

  // Check blocked patterns (regex)
  if (rules.blockedPatterns.length > 0) {
    for (const pattern of rules.blockedPatterns) {
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

  // Check context requirement - only for outbound
  if (direction === "outbound" && rules.requireContext && (!context || context.trim() === "")) {
    return {
      allowed: false,
      reason: "Context is required for outgoing messages",
    };
  }

  return { allowed: true };
}
