/**
 * Mahilo API Client Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { MahiloClient, getMahiloClient } from "../src/client/mahilo-api.js";
import { MahiloError, ErrorCodes } from "../src/types.js";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("MahiloClient", () => {
  let client: MahiloClient;
  const apiKey = "test-api-key";
  const baseUrl = "https://api.mahilo.dev/api/v1";

  beforeEach(() => {
    client = new MahiloClient({ apiKey, baseUrl });
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // sendMessage Tests
  // ==========================================================================

  describe("sendMessage", () => {
    it("should send message successfully", async () => {
      const response = {
        message_id: "msg_123",
        status: "delivered",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(response),
      });

      const result = await client.sendMessage({
        recipient: "alice",
        message: "Hello!",
      });

      expect(result).toEqual(response);
      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/messages/send`,
        expect.objectContaining({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ recipient: "alice", message: "Hello!" }),
        }),
      );
    });

    it("should handle pending status", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          message_id: "msg_456",
          status: "pending",
        }),
      });

      const result = await client.sendMessage({
        recipient: "bob",
        message: "Hello!",
      });

      expect(result.status).toBe("pending");
    });

    it("should handle rejected status", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          message_id: "msg_789",
          status: "rejected",
          rejection_reason: "Policy violation",
        }),
      });

      const result = await client.sendMessage({
        recipient: "carol",
        message: "Hello!",
      });

      expect(result.status).toBe("rejected");
      expect(result.rejection_reason).toBe("Policy violation");
    });

    it("should include all optional parameters", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message_id: "msg_123", status: "delivered" }),
      });

      await client.sendMessage({
        recipient: "alice",
        message: "Hello!",
        context: "greeting",
        recipient_connection_id: "conn_123",
        idempotency_key: "key_123",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/messages/send`,
        expect.objectContaining({
          body: JSON.stringify({
            recipient: "alice",
            message: "Hello!",
            context: "greeting",
            recipient_connection_id: "conn_123",
            idempotency_key: "key_123",
          }),
        }),
      );
    });

    it("should throw NOT_FRIENDS error for 403", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        json: () => Promise.resolve({ error: "Not friends", code: "NOT_FRIENDS" }),
      });

      try {
        await client.sendMessage({ recipient: "stranger", message: "Hi" });
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(MahiloError);
        expect((err as MahiloError).code).toBe("NOT_FRIENDS");
      }
    });

    it("should throw USER_NOT_FOUND error for 404", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
        json: () => Promise.resolve({ error: "User not found" }),
      });

      await expect(
        client.sendMessage({ recipient: "nobody", message: "Hi" }),
      ).rejects.toThrow(MahiloError);
    });

    it("should throw RATE_LIMITED error for 429", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        json: () => Promise.resolve({ error: "Rate limited" }),
      });

      await expect(
        client.sendMessage({ recipient: "alice", message: "spam" }),
      ).rejects.toThrow(MahiloError);
    });
  });

  // ==========================================================================
  // getFriends Tests
  // ==========================================================================

  describe("getFriends", () => {
    it("should fetch friends list", async () => {
      const friends = [
        { id: "f1", username: "alice", status: "accepted" },
        { id: "f2", username: "bob", status: "accepted" },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(friends),
      });

      const result = await client.getFriends("accepted");

      expect(result).toEqual(friends);
      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/friends?status=accepted`,
        expect.anything(),
      );
    });

    it("should handle empty friends list", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });

      const result = await client.getFriends();

      expect(result).toEqual([]);
    });

    it("should fetch all friends without status filter", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await client.getFriends();

      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/friends`,
        expect.anything(),
      );
    });
  });

  // ==========================================================================
  // getContactConnections Tests
  // ==========================================================================

  describe("getContactConnections", () => {
    it("should fetch contact connections", async () => {
      const connections = [
        { id: "conn_1", framework: "clawdbot", label: "default", status: "active" },
        { id: "conn_2", framework: "clawdbot", label: "work", status: "active" },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(connections),
      });

      const result = await client.getContactConnections("alice");

      expect(result).toEqual(connections);
      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/contacts/alice/connections`,
        expect.anything(),
      );
    });

    it("should handle no connections", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });

      const result = await client.getContactConnections("newuser");

      expect(result).toEqual([]);
    });
  });

  // ==========================================================================
  // registerAgent Tests
  // ==========================================================================

  describe("registerAgent", () => {
    it("should register agent successfully", async () => {
      const response = {
        connection_id: "conn_new",
        callback_secret: "secret_123",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(response),
      });

      const result = await client.registerAgent({
        framework: "clawdbot",
        label: "default",
        callback_url: "https://example.com/mahilo/incoming",
      });

      expect(result).toEqual(response);
      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/agents`,
        expect.objectContaining({
          method: "POST",
        }),
      );
    });

    it("should include optional fields", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ connection_id: "conn_1", callback_secret: "s" }),
      });

      await client.registerAgent({
        framework: "clawdbot",
        label: "sports",
        description: "Sports-focused agent",
        capabilities: ["sports", "schedule"],
        callback_url: "https://example.com/mahilo/incoming",
        routing_priority: 10,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/agents`,
        expect.objectContaining({
          body: JSON.stringify({
            framework: "clawdbot",
            label: "sports",
            description: "Sports-focused agent",
            capabilities: ["sports", "schedule"],
            callback_url: "https://example.com/mahilo/incoming",
            routing_priority: 10,
          }),
        }),
      );
    });

    it("should throw INVALID_API_KEY for 401", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        json: () => Promise.resolve({ error: "Invalid API key" }),
      });

      await expect(
        client.registerAgent({
          framework: "clawdbot",
          label: "default",
          callback_url: "https://example.com",
        }),
      ).rejects.toThrow(MahiloError);
    });
  });

  // ==========================================================================
  // Error Handling Tests
  // ==========================================================================

  describe("error handling", () => {
    it("should handle network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      await expect(client.getFriends()).rejects.toThrow(MahiloError);

      try {
        await client.getFriends();
      } catch (err) {
        expect((err as MahiloError).code).toBe(ErrorCodes.NETWORK_ERROR);
      }
    });

    it("should handle timeout", async () => {
      mockFetch.mockImplementationOnce(() => {
        const error = new Error("Aborted");
        error.name = "AbortError";
        return Promise.reject(error);
      });

      try {
        await client.getFriends();
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(MahiloError);
        expect((err as MahiloError).code).toBe(ErrorCodes.TIMEOUT);
      }
    });

    it("should retry on server errors (5xx)", async () => {
      // First two calls fail with 500, third succeeds
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
          json: () => Promise.resolve({ error: "Server error" }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
          json: () => Promise.resolve({ error: "Server error" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]),
        });

      const result = await client.getFriends();

      expect(result).toEqual([]);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("should not retry on client errors (4xx)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: () => Promise.resolve({ error: "Bad request" }),
      });

      await expect(client.getFriends()).rejects.toThrow(MahiloError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should parse error response with code", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        json: () => Promise.resolve({ error: "Not friends", code: "NOT_FRIENDS" }),
      });

      try {
        await client.sendMessage({ recipient: "alice", message: "hi" });
      } catch (err) {
        expect((err as MahiloError).code).toBe("NOT_FRIENDS");
        expect((err as MahiloError).message).toBe("Not friends");
        expect((err as MahiloError).statusCode).toBe(403);
      }
    });

    it("should handle malformed error response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: () => Promise.reject(new Error("Invalid JSON")),
      });

      // Should exhaust retries and throw
      await expect(client.getFriends()).rejects.toThrow(MahiloError);
    });
  });

  // ==========================================================================
  // deleteAgentConnection Tests
  // ==========================================================================

  describe("deleteAgentConnection", () => {
    it("should delete connection successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const result = await client.deleteAgentConnection("conn_123");

      expect(result).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/agents/conn_123`,
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  // ==========================================================================
  // sendFriendRequest Tests
  // ==========================================================================

  describe("sendFriendRequest", () => {
    it("should send friend request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ friendship_id: "f_123", status: "pending" }),
      });

      const result = await client.sendFriendRequest("newuser");

      expect(result).toEqual({ friendship_id: "f_123", status: "pending" });
    });
  });

  // ==========================================================================
  // Group Methods Tests
  // ==========================================================================

  describe("getGroups", () => {
    it("should fetch groups list", async () => {
      const groups = [
        { id: "grp_1", name: "Team Alpha", owner: "alice", member_count: 5 },
        { id: "grp_2", name: "Project Beta", owner: "bob", member_count: 3 },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(groups),
      });

      const result = await client.getGroups();

      expect(result).toEqual(groups);
      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/groups`,
        expect.anything(),
      );
    });

    it("should handle empty groups list", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });

      const result = await client.getGroups();

      expect(result).toEqual([]);
    });
  });

  describe("getGroup", () => {
    it("should fetch single group details", async () => {
      const group = {
        id: "grp_1",
        name: "Team Alpha",
        description: "Main team channel",
        owner: "alice",
        member_count: 5,
        created_at: "2025-01-01T00:00:00Z",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(group),
      });

      const result = await client.getGroup("grp_1");

      expect(result).toEqual(group);
      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/groups/grp_1`,
        expect.anything(),
      );
    });

    it("should throw GROUP_NOT_FOUND for 404", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
        json: () => Promise.resolve({ error: "Group not found", code: "GROUP_NOT_FOUND" }),
      });

      await expect(client.getGroup("nonexistent")).rejects.toThrow(MahiloError);
    });
  });

  describe("getGroupMembers", () => {
    it("should fetch group members", async () => {
      const members = [
        { username: "alice", display_name: "Alice", role: "owner", joined_at: "2025-01-01T00:00:00Z" },
        { username: "bob", display_name: "Bob", role: "admin", joined_at: "2025-01-02T00:00:00Z" },
        { username: "charlie", role: "member", joined_at: "2025-01-03T00:00:00Z" },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(members),
      });

      const result = await client.getGroupMembers("grp_1");

      expect(result).toEqual(members);
      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/groups/grp_1/members`,
        expect.anything(),
      );
    });

    it("should throw NOT_GROUP_MEMBER for 403", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        json: () => Promise.resolve({ error: "Not a group member", code: "NOT_GROUP_MEMBER" }),
      });

      await expect(client.getGroupMembers("grp_secret")).rejects.toThrow(MahiloError);
    });
  });

  describe("sendMessage to group", () => {
    it("should send group message with recipient_type", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message_id: "msg_grp_123", status: "delivered" }),
      });

      const result = await client.sendMessage({
        recipient: "grp_1",
        recipient_type: "group",
        message: "Hello team!",
      });

      expect(result.status).toBe("delivered");
      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/messages/send`,
        expect.objectContaining({
          body: JSON.stringify({
            recipient: "grp_1",
            recipient_type: "group",
            message: "Hello team!",
          }),
        }),
      );
    });
  });
});

// =============================================================================
// getMahiloClient Tests
// =============================================================================

describe("getMahiloClient", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("should throw without API key", () => {
    expect(() => getMahiloClient({})).toThrow(MahiloError);
    expect(() => getMahiloClient({})).toThrow("Mahilo API key not configured");
  });

  it("should create client with API key", () => {
    const client = getMahiloClient({ mahilo_api_key: "test-key" });
    expect(client).toBeInstanceOf(MahiloClient);
  });

  it("should use default API URL", () => {
    const client = getMahiloClient({ mahilo_api_key: "test-key" });
    // Verify through a request
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });

    client.getFriends();

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("https://api.mahilo.dev/api/v1"),
      expect.anything(),
    );
  });

  it("should use custom API URL", () => {
    const client = getMahiloClient({
      mahilo_api_key: "test-key",
      mahilo_api_url: "https://custom.api.com/v1",
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });

    client.getFriends();

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("https://custom.api.com/v1"),
      expect.anything(),
    );
  });

  it("should strip trailing slash from URL", () => {
    const client = getMahiloClient({
      mahilo_api_key: "test-key",
      mahilo_api_url: "https://api.example.com/v1/",
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });

    client.getFriends();

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/v1/friends",
      expect.anything(),
    );
  });
});

// =============================================================================
// getLlmPolicies Tests
// =============================================================================

describe("MahiloClient - LLM Policies", () => {
  let client: MahiloClient;
  const apiKey = "test-api-key";
  const baseUrl = "https://api.mahilo.dev/api/v1";

  beforeEach(() => {
    client = new MahiloClient({ apiKey, baseUrl, policyCacheTtl: 1000 });
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const samplePolicies = [
    {
      id: "pol_1",
      name: "No profanity",
      policy_content: "Check if the message contains profanity. Return BLOCK if it does.",
      scope: "global",
      direction: "both",
      priority: 100,
      enabled: true,
      fail_behavior: "open",
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
    },
    {
      id: "pol_2",
      name: "Confidential for Bob",
      policy_content: "Block messages containing confidential info to bob.",
      scope: "user",
      direction: "outbound",
      priority: 50,
      target_user: "bob",
      enabled: true,
      fail_behavior: "closed",
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
    },
    {
      id: "pol_3",
      name: "Disabled policy",
      policy_content: "This is disabled",
      scope: "global",
      direction: "both",
      priority: 200,
      enabled: false,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
    },
  ];

  describe("getLlmPolicies", () => {
    it("should fetch LLM policies from registry", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ policies: samplePolicies }),
      });

      const result = await client.getLlmPolicies();

      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/policies?policy_type=llm`,
        expect.anything(),
      );
      // Should only return enabled policies
      expect(result).toHaveLength(2);
      expect(result.every((p) => p.enabled)).toBe(true);
    });

    it("should filter out disabled policies", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ policies: samplePolicies }),
      });

      const result = await client.getLlmPolicies();

      expect(result.find((p) => p.id === "pol_3")).toBeUndefined();
    });

    it("should sort policies by priority (descending)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ policies: samplePolicies }),
      });

      const result = await client.getLlmPolicies();

      // pol_1 has priority 100, pol_2 has priority 50
      expect(result[0].id).toBe("pol_1");
      expect(result[1].id).toBe("pol_2");
    });

    it("should cache policies", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ policies: samplePolicies }),
      });

      // First call fetches
      await client.getLlmPolicies();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second call uses cache
      await client.getLlmPolicies();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should refresh cache after TTL expires", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ policies: samplePolicies }),
      });

      // First call
      await client.getLlmPolicies();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Wait for TTL to expire (using small TTL of 1000ms)
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Second call should refresh
      await client.getLlmPolicies();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should force refresh when requested", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ policies: samplePolicies }),
      });

      await client.getLlmPolicies();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      await client.getLlmPolicies({ forceRefresh: true });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should use stale cache on registry error", async () => {
      // First call succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ policies: samplePolicies }),
      });
      await client.getLlmPolicies();

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Second call fails
      mockFetch.mockRejectedValueOnce(new Error("Network error"));
      const result = await client.getLlmPolicies();

      // Should return stale cached data
      expect(result).toHaveLength(2);
    });

    it("should throw on registry error without cache", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      await expect(client.getLlmPolicies()).rejects.toThrow();
    });

    it("should handle empty policies array", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ policies: [] }),
      });

      const result = await client.getLlmPolicies();
      expect(result).toEqual([]);
    });

    it("should handle missing policies field", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const result = await client.getLlmPolicies();
      expect(result).toEqual([]);
    });

    it("should clear cache manually", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ policies: samplePolicies }),
      });

      await client.getLlmPolicies();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      client.clearPolicyCache();

      await client.getLlmPolicies();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("getApplicablePolicies", () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ policies: samplePolicies }),
      });
    });

    it("should return global policies for any context", async () => {
      const result = await client.getApplicablePolicies({
        direction: "outbound",
      });

      // Should include pol_1 (global) but not pol_2 (user-scoped, no target match)
      expect(result.some((p) => p.id === "pol_1")).toBe(true);
      expect(result.some((p) => p.id === "pol_2")).toBe(false);
    });

    it("should include user-scoped policies when target matches", async () => {
      const result = await client.getApplicablePolicies({
        direction: "outbound",
        targetUser: "bob",
      });

      // Should include both pol_1 (global) and pol_2 (user-scoped for bob)
      expect(result.some((p) => p.id === "pol_1")).toBe(true);
      expect(result.some((p) => p.id === "pol_2")).toBe(true);
    });

    it("should filter by direction", async () => {
      const result = await client.getApplicablePolicies({
        direction: "inbound",
        targetUser: "bob",
      });

      // pol_1 is "both" so it applies
      // pol_2 is "outbound" only, should not apply
      expect(result.some((p) => p.id === "pol_1")).toBe(true);
      expect(result.some((p) => p.id === "pol_2")).toBe(false);
    });

    it("should return policies in priority order", async () => {
      const result = await client.getApplicablePolicies({
        direction: "outbound",
        targetUser: "bob",
      });

      // pol_1 (priority 100) should come before pol_2 (priority 50)
      const pol1Index = result.findIndex((p) => p.id === "pol_1");
      const pol2Index = result.findIndex((p) => p.id === "pol_2");
      expect(pol1Index).toBeLessThan(pol2Index);
    });

    it("should handle group-scoped policies", async () => {
      const groupPolicy = {
        id: "pol_group",
        name: "Group policy",
        policy_content: "Block spam in group",
        scope: "group",
        direction: "both",
        priority: 75,
        target_group: "group_123",
        enabled: true,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      };

      mockFetch.mockReset();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ policies: [...samplePolicies, groupPolicy] }),
      });
      client.clearPolicyCache();

      const result = await client.getApplicablePolicies({
        direction: "inbound",
        targetGroup: "group_123",
      });

      expect(result.some((p) => p.id === "pol_group")).toBe(true);
    });

    it("should not include group policies without matching target", async () => {
      const groupPolicy = {
        id: "pol_group",
        name: "Group policy",
        policy_content: "Block spam in group",
        scope: "group",
        direction: "both",
        priority: 75,
        target_group: "group_123",
        enabled: true,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      };

      mockFetch.mockReset();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ policies: [...samplePolicies, groupPolicy] }),
      });
      client.clearPolicyCache();

      const result = await client.getApplicablePolicies({
        direction: "inbound",
        targetGroup: "different_group",
      });

      expect(result.some((p) => p.id === "pol_group")).toBe(false);
    });
  });
});
