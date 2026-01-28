/**
 * Mahilo Registry API Client
 */

import type {
  AgentConnection,
  Friend,
  GetPoliciesResponse,
  Group,
  GroupMember,
  LlmPolicy,
  MahiloPluginConfig,
  RegisterAgentRequest,
  RegisterAgentResponse,
  SendMessageRequest,
  SendMessageResponse,
} from "../types.js";
import { ErrorCodes, MahiloError } from "../types.js";

const DEFAULT_TIMEOUT = 30_000;
const MAX_RETRIES = 3;
const DEFAULT_POLICY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface MahiloClientOptions {
  apiKey: string;
  baseUrl: string;
  timeout?: number;
  policyCacheTtl?: number;
}

interface PolicyCache {
  policies: LlmPolicy[];
  fetchedAt: number;
}

export class MahiloClient {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;
  private policyCacheTtl: number;
  private policyCache: PolicyCache | null = null;

  constructor(options: MahiloClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl.replace(/\/$/, ""); // Remove trailing slash
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
    this.policyCacheTtl = options.policyCacheTtl ?? DEFAULT_POLICY_CACHE_TTL;
  }

  /**
   * Clear the policy cache (useful for testing or forcing refresh).
   */
  clearPolicyCache(): void {
    this.policyCache = null;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    retries = MAX_RETRIES,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await this.parseErrorResponse(response);
        // Don't retry client errors (4xx)
        if (response.status >= 400 && response.status < 500) {
          throw error;
        }
        // Retry server errors
        if (retries > 0) {
          await this.sleep(Math.pow(2, MAX_RETRIES - retries) * 100);
          return this.request<T>(method, path, body, retries - 1);
        }
        throw error;
      }

      return (await response.json()) as T;
    } catch (err) {
      clearTimeout(timeoutId);

      if (err instanceof MahiloError) {
        throw err;
      }

      if (err instanceof Error) {
        if (err.name === "AbortError") {
          throw new MahiloError("Request timed out", ErrorCodes.TIMEOUT);
        }
        throw new MahiloError(err.message, ErrorCodes.NETWORK_ERROR);
      }

      throw new MahiloError("Unknown error", ErrorCodes.NETWORK_ERROR);
    }
  }

  private async parseErrorResponse(response: Response): Promise<MahiloError> {
    try {
      const body = (await response.json()) as { error?: string; code?: string };
      const code = body.code ?? this.statusToErrorCode(response.status);
      return new MahiloError(body.error ?? response.statusText, code, response.status);
    } catch {
      return new MahiloError(
        response.statusText,
        this.statusToErrorCode(response.status),
        response.status,
      );
    }
  }

  private statusToErrorCode(status: number): string {
    switch (status) {
      case 401:
        return ErrorCodes.INVALID_API_KEY;
      case 403:
        return ErrorCodes.NOT_FRIENDS;
      case 404:
        return ErrorCodes.USER_NOT_FOUND;
      case 429:
        return ErrorCodes.RATE_LIMITED;
      case 501:
        return ErrorCodes.NOT_IMPLEMENTED;
      default:
        return ErrorCodes.NETWORK_ERROR;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // =========================================================================
  // Agent Connection Methods
  // =========================================================================

  async registerAgent(request: RegisterAgentRequest): Promise<RegisterAgentResponse> {
    return this.request<RegisterAgentResponse>("POST", "/agents", request);
  }

  async getAgentConnections(): Promise<AgentConnection[]> {
    return this.request<AgentConnection[]>("GET", "/agents");
  }

  async deleteAgentConnection(connectionId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>("DELETE", `/agents/${connectionId}`);
  }

  // =========================================================================
  // Friends Methods
  // =========================================================================

  async getFriends(status?: "pending" | "accepted" | "blocked"): Promise<Friend[]> {
    const query = status ? `?status=${status}` : "";
    return this.request<Friend[]>("GET", `/friends${query}`);
  }

  async getContactConnections(username: string): Promise<AgentConnection[]> {
    return this.request<AgentConnection[]>("GET", `/contacts/${username}/connections`);
  }

  async sendFriendRequest(username: string): Promise<{ friendship_id: string; status: string }> {
    return this.request<{ friendship_id: string; status: string }>("POST", "/friends/request", {
      username,
    });
  }

  // =========================================================================
  // Group Methods
  // =========================================================================

  /**
   * Get all groups the authenticated user is a member of.
   */
  async getGroups(): Promise<Group[]> {
    return this.request<Group[]>("GET", "/groups");
  }

  /**
   * Get details of a specific group.
   */
  async getGroup(groupId: string): Promise<Group> {
    return this.request<Group>("GET", `/groups/${groupId}`);
  }

  /**
   * Get members of a specific group.
   * Requires membership in the group.
   */
  async getGroupMembers(groupId: string): Promise<GroupMember[]> {
    return this.request<GroupMember[]>("GET", `/groups/${groupId}/members`);
  }

  // =========================================================================
  // Message Methods
  // =========================================================================

  async sendMessage(request: SendMessageRequest): Promise<SendMessageResponse> {
    return this.request<SendMessageResponse>("POST", "/messages/send", request);
  }

  // =========================================================================
  // Policy Methods
  // =========================================================================

  /**
   * Fetch LLM policies from the registry with caching.
   * Filters to only LLM-type policies that are enabled.
   */
  async getLlmPolicies(options?: { forceRefresh?: boolean }): Promise<LlmPolicy[]> {
    const now = Date.now();

    // Return cached policies if valid and not forcing refresh
    if (
      !options?.forceRefresh &&
      this.policyCache &&
      now - this.policyCache.fetchedAt < this.policyCacheTtl
    ) {
      return this.policyCache.policies;
    }

    try {
      // Fetch policies from registry, filtered by policy_type=llm
      const response = await this.request<GetPoliciesResponse>(
        "GET",
        "/policies?policy_type=llm",
      );

      // Filter to enabled policies only and sort by priority (descending)
      const enabledPolicies = (response.policies ?? [])
        .filter((p) => p.enabled)
        .sort((a, b) => b.priority - a.priority);

      // Update cache
      this.policyCache = {
        policies: enabledPolicies,
        fetchedAt: now,
      };

      return enabledPolicies;
    } catch (err) {
      // If registry is unavailable and we have stale cache, use it
      if (this.policyCache) {
        return this.policyCache.policies;
      }
      // Otherwise, throw the error (caller can handle gracefully)
      throw err;
    }
  }

  /**
   * Get policies applicable to a specific context.
   * Returns policies in priority order (highest first).
   */
  async getApplicablePolicies(context: {
    direction: "outbound" | "inbound";
    targetUser?: string;
    targetGroup?: string;
  }): Promise<LlmPolicy[]> {
    const allPolicies = await this.getLlmPolicies();

    return allPolicies.filter((policy) => {
      // Check direction
      if (policy.direction !== "both" && policy.direction !== context.direction) {
        return false;
      }

      // Check scope
      switch (policy.scope) {
        case "global":
          return true;

        case "user":
          // User-scoped policies need a target user match
          return context.targetUser && policy.target_user === context.targetUser;

        case "group":
          // Group-scoped policies need a target group match
          return context.targetGroup && policy.target_group === context.targetGroup;

        default:
          return false;
      }
    });
  }
}

// Singleton client instance
let clientInstance: MahiloClient | null = null;

export function getMahiloClient(config: MahiloPluginConfig): MahiloClient {
  if (!config.mahilo_api_key) {
    throw new MahiloError(
      "Mahilo API key not configured. Set mahilo_api_key in plugin config.",
      ErrorCodes.INVALID_API_KEY,
    );
  }

  // Create new instance if config changed
  if (
    !clientInstance ||
    clientInstance["apiKey"] !== config.mahilo_api_key ||
    clientInstance["baseUrl"] !== config.mahilo_api_url
  ) {
    clientInstance = new MahiloClient({
      apiKey: config.mahilo_api_key,
      baseUrl: config.mahilo_api_url ?? "https://api.mahilo.dev/api/v1",
    });
  }

  return clientInstance;
}
