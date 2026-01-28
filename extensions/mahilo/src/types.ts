/**
 * Mahilo Plugin Types
 */

// =============================================================================
// Configuration Types
// =============================================================================

export interface LocalPolicyConfig {
  maxMessageLength?: number;
  minMessageLength?: number;
  blockedKeywords?: string[];
  blockedPatterns?: string[];
  requireContext?: boolean;
}

export interface InboundPolicyConfig {
  blockedKeywords?: string[];
  blockedPatterns?: string[];
}

/**
 * Encryption mode for Mahilo messages.
 * - off: No encryption (plaintext only)
 * - opportunistic: Encrypt when recipient supports it, fallback to plaintext
 * - required: Always encrypt, fail if recipient doesn't support encryption
 */
export type EncryptionMode = "off" | "opportunistic" | "required";

export interface EncryptionConfig {
  /** Encryption mode for outbound messages. Default: off */
  mode?: EncryptionMode;
  /** Allow plaintext fallback when opportunistic encryption fails. Default: true */
  allow_plaintext_fallback?: boolean;
}

/**
 * Configuration for LLM-based policy evaluation.
 */
export interface LlmPolicyConfig {
  /** Enable LLM policy evaluation. Default: false */
  enabled?: boolean;
  /** Provider to use for LLM evaluation (e.g., "anthropic", "openai"). If not set, uses default. */
  provider?: string;
  /** Model to use for evaluation (e.g., "claude-3-5-haiku-20241022"). If not set, uses cheapest/fastest. */
  model?: string;
  /** Timeout for each policy evaluation in milliseconds. Default: 15000 */
  timeout_ms?: number;
  /** Policy cache TTL in milliseconds. Default: 300000 (5 minutes) */
  cache_ttl_ms?: number;
}

export interface MahiloPluginConfig {
  mahilo_api_key?: string;
  mahilo_api_url?: string;
  callback_path?: string;
  callback_url_override?: string;
  connection_label?: string;
  connection_description?: string;
  connection_capabilities?: string[];
  auto_register?: boolean;
  local_policies?: LocalPolicyConfig;
  inbound_policies?: InboundPolicyConfig;
  /** Session key to route inbound Mahilo messages to. Defaults to "main". */
  inbound_session_key?: string;
  /** Agent ID for inbound message routing. If not set, uses default agent. */
  inbound_agent_id?: string;
  /** Encryption settings for Mahilo messages. */
  encryption?: EncryptionConfig;
  /** LLM-based policy evaluation settings. */
  llm_policies?: LlmPolicyConfig;
  /**
   * Policy source mode for heuristic policies.
   * - local: use only local policies from config
   * - registry: use only registry policies
   * - merged: merge local and registry policies (local takes precedence)
   * Default: merged
   */
  policy_source?: PolicySourceMode;
}

// =============================================================================
// API Types
// =============================================================================

export interface AgentConnection {
  id: string;
  framework: string;
  label: string;
  description?: string;
  capabilities?: string[];
  routing_priority?: number;
  callback_url: string;
  public_key?: string;
  public_key_alg?: string;
  status: "active" | "inactive";
  last_seen?: string;
}

export interface Friend {
  id: string;
  username: string;
  display_name?: string;
  status: "pending" | "accepted" | "blocked";
  since?: string;
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  owner: string;
  member_count?: number;
  created_at?: string;
}

export interface GroupMember {
  username: string;
  display_name?: string;
  role: "owner" | "admin" | "member";
  joined_at?: string;
}

export interface RegisterAgentRequest {
  framework: string;
  label: string;
  description?: string;
  capabilities?: string[];
  callback_url: string;
  public_key?: string;
  public_key_alg?: string;
  routing_priority?: number;
  /** Advertise encryption support to the registry */
  supports_encryption?: boolean;
  /** Preferred encryption algorithm */
  encryption_alg?: string;
}

export interface RegisterAgentResponse {
  connection_id: string;
  callback_secret: string;
}

export interface SendMessageRequest {
  recipient: string;
  recipient_type?: "user" | "group";
  recipient_connection_id?: string;
  routing_hints?: {
    labels?: string[];
    tags?: string[];
  };
  message: string;
  context?: string;
  correlation_id?: string;
  idempotency_key?: string;
}

export interface SendMessageResponse {
  message_id: string;
  status: "delivered" | "pending" | "rejected";
  rejection_reason?: string;
}

export interface IncomingMessage {
  message_id: string;
  correlation_id?: string;
  recipient_connection_id?: string;
  sender: string;
  sender_agent: string;
  message: string;
  context?: string;
  timestamp: string;
  /** Group ID if this message was sent to a group */
  group_id?: string;
  /** Group name if this message was sent to a group */
  group_name?: string;
}

// =============================================================================
// Error Types
// =============================================================================

export class MahiloError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number,
  ) {
    super(message);
    this.name = "MahiloError";
  }
}

export const ErrorCodes = {
  NOT_FRIENDS: "NOT_FRIENDS",
  USER_NOT_FOUND: "USER_NOT_FOUND",
  CONNECTION_NOT_FOUND: "CONNECTION_NOT_FOUND",
  GROUP_NOT_FOUND: "GROUP_NOT_FOUND",
  NOT_GROUP_MEMBER: "NOT_GROUP_MEMBER",
  NOT_IMPLEMENTED: "NOT_IMPLEMENTED",
  RATE_LIMITED: "RATE_LIMITED",
  POLICY_VIOLATION: "POLICY_VIOLATION",
  INVALID_API_KEY: "INVALID_API_KEY",
  SIGNATURE_INVALID: "SIGNATURE_INVALID",
  DUPLICATE_MESSAGE: "DUPLICATE_MESSAGE",
  NETWORK_ERROR: "NETWORK_ERROR",
  TIMEOUT: "TIMEOUT",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

// =============================================================================
// Policy Types
// =============================================================================

export interface PolicyResult {
  allowed: boolean;
  reason?: string;
}

// =============================================================================
// LLM Policy Types (fetched from registry)
// =============================================================================

/**
 * LLM policy scope determines when the policy applies:
 * - global: applies to all messages for this user
 * - user: applies to messages to/from specific user
 * - group: applies to messages in specific group
 */
export type LlmPolicyScope = "global" | "user" | "group";

/**
 * LLM policy direction:
 * - outbound: applies to messages being sent
 * - inbound: applies to messages being received
 * - both: applies to both directions
 */
export type LlmPolicyDirection = "outbound" | "inbound" | "both";

/**
 * LLM policy as stored in the registry.
 */
export interface LlmPolicy {
  /** Unique policy ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** The LLM prompt that evaluates the message. Should return allow/block decision. */
  policy_content: string;
  /** Scope of the policy */
  scope: LlmPolicyScope;
  /** Direction the policy applies to */
  direction: LlmPolicyDirection;
  /** Priority (higher = evaluated first, can short-circuit) */
  priority: number;
  /** For user-scoped policies, the target username */
  target_user?: string;
  /** For group-scoped policies, the target group ID */
  target_group?: string;
  /** Whether the policy is enabled */
  enabled: boolean;
  /** Fail behavior: "open" allows on LLM error, "closed" blocks on error */
  fail_behavior?: "open" | "closed";
  /** Created timestamp */
  created_at: string;
  /** Updated timestamp */
  updated_at: string;
}

/**
 * Response from GET /api/v1/policies
 */
export interface GetPoliciesResponse {
  policies: LlmPolicy[];
}

/**
 * LLM policy evaluation result.
 */
export interface LlmPolicyEvaluationResult {
  /** Whether the message is allowed */
  allowed: boolean;
  /** Reason for blocking (if not allowed) */
  reason?: string;
  /** The policy that blocked the message (if any) */
  blocking_policy_id?: string;
  /** The policy name (if blocked) */
  blocking_policy_name?: string;
}

// =============================================================================
// Heuristic Policy Types (fetched from registry)
// =============================================================================

/**
 * Heuristic policy scope (same as LLM policy scope):
 * - global: applies to all messages for this user
 * - user: applies to messages to/from specific user
 * - group: applies to messages in specific group
 */
export type HeuristicPolicyScope = "global" | "user" | "group";

/**
 * Heuristic policy direction:
 * - outbound: applies to messages being sent
 * - inbound: applies to messages being received
 * - both: applies to both directions
 */
export type HeuristicPolicyDirection = "outbound" | "inbound" | "both";

/**
 * Heuristic policy rules (static rule-based filtering).
 */
export interface HeuristicPolicyRules {
  /** Maximum message length */
  maxMessageLength?: number;
  /** Minimum message length */
  minMessageLength?: number;
  /** Blocked keywords (case-insensitive) */
  blockedKeywords?: string[];
  /** Blocked patterns (regex) */
  blockedPatterns?: string[];
  /** Require context for outbound messages */
  requireContext?: boolean;
}

/**
 * Heuristic policy as stored in the registry.
 */
export interface HeuristicPolicy {
  /** Unique policy ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** The heuristic rules to apply */
  rules: HeuristicPolicyRules;
  /** Scope of the policy */
  scope: HeuristicPolicyScope;
  /** Direction the policy applies to */
  direction: HeuristicPolicyDirection;
  /** Priority (higher = evaluated first) */
  priority: number;
  /** For user-scoped policies, the target username */
  target_user?: string;
  /** For group-scoped policies, the target group ID */
  target_group?: string;
  /** Whether the policy is enabled */
  enabled: boolean;
  /** Created timestamp */
  created_at: string;
  /** Updated timestamp */
  updated_at: string;
}

/**
 * Response from GET /api/v1/policies?policy_type=heuristic
 */
export interface GetHeuristicPoliciesResponse {
  policies: HeuristicPolicy[];
}

// =============================================================================
// Policy Source Configuration
// =============================================================================

/**
 * Policy source mode:
 * - local: use only local policies from config
 * - registry: use only registry policies
 * - merged: merge local and registry policies (local takes precedence)
 */
export type PolicySourceMode = "local" | "registry" | "merged";
