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
