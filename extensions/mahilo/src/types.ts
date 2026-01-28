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

export interface RegisterAgentRequest {
  framework: string;
  label: string;
  description?: string;
  capabilities?: string[];
  callback_url: string;
  public_key?: string;
  public_key_alg?: string;
  routing_priority?: number;
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
