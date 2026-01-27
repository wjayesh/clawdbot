/**
 * Tools Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { createTalkToAgentTool } from "../src/tools/talk-to-agent.js";
import { createListContactsTool } from "../src/tools/list-contacts.js";
import type { ClawdbotPluginApi } from "../../../src/plugins/types.js";

// Mock the Mahilo client module
vi.mock("../src/client/mahilo-api.js", () => ({
  getMahiloClient: vi.fn(),
  MahiloClient: vi.fn(),
}));

// Import the mock after setting it up
import { getMahiloClient } from "../src/client/mahilo-api.js";
import { MahiloError, ErrorCodes } from "../src/types.js";

// Create a mock plugin API
function createMockApi(pluginConfig: Record<string, unknown> = {}): ClawdbotPluginApi {
  return {
    id: "mahilo",
    name: "Mahilo",
    source: "test",
    config: {} as any,
    pluginConfig: {
      mahilo_api_key: "test-key",
      ...pluginConfig,
    },
    runtime: {} as any,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    registerTool: vi.fn(),
    registerHook: vi.fn(),
    registerHttpHandler: vi.fn(),
    registerHttpRoute: vi.fn(),
    registerChannel: vi.fn(),
    registerGatewayMethod: vi.fn(),
    registerCli: vi.fn(),
    registerService: vi.fn(),
    registerProvider: vi.fn(),
    registerCommand: vi.fn(),
    resolvePath: vi.fn((p) => p),
    on: vi.fn(),
  };
}

// Create a mock Mahilo client
function createMockClient(overrides: Record<string, any> = {}) {
  return {
    sendMessage: vi.fn().mockResolvedValue({ message_id: "msg_123", status: "delivered" }),
    getFriends: vi.fn().mockResolvedValue([]),
    getContactConnections: vi.fn().mockResolvedValue([]),
    registerAgent: vi.fn().mockResolvedValue({ connection_id: "c1", callback_secret: "s" }),
    ...overrides,
  };
}

describe("talk_to_agent Tool", () => {
  let tool: ReturnType<typeof createTalkToAgentTool>;
  let mockClient: ReturnType<typeof createMockClient>;
  let mockApi: ClawdbotPluginApi;

  beforeEach(() => {
    mockClient = createMockClient();
    (getMahiloClient as any).mockReturnValue(mockClient);
    mockApi = createMockApi();
    tool = createTalkToAgentTool(mockApi);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("tool metadata", () => {
    it("should have correct name", () => {
      expect(tool.name).toBe("talk_to_agent");
    });

    it("should have description", () => {
      expect(tool.description).toContain("Send a message");
      expect(tool.description).toContain("Mahilo network");
    });

    it("should have required parameters", () => {
      expect(tool.parameters).toBeDefined();
    });
  });

  describe("successful sends", () => {
    it("should send message successfully", async () => {
      mockClient.sendMessage.mockResolvedValueOnce({
        message_id: "msg_123",
        status: "delivered",
      });

      const result = await tool.execute("tool_1", {
        recipient: "alice",
        message: "Hello!",
      });

      expect(result.content[0].text).toContain("Message sent to alice");
      expect(mockClient.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          recipient: "alice",
          message: "Hello!",
        }),
      );
    });

    it("should include context when provided", async () => {
      await tool.execute("tool_1", {
        recipient: "alice",
        message: "Hello!",
        context: "Just saying hi",
      });

      expect(mockClient.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          context: "Just saying hi",
        }),
      );
    });

    it("should handle pending status", async () => {
      mockClient.sendMessage.mockResolvedValueOnce({
        message_id: "msg_456",
        status: "pending",
      });

      const result = await tool.execute("tool_1", {
        recipient: "bob",
        message: "Hello!",
      });

      expect(result.content[0].text).toContain("Message queued for bob");
      expect(result.content[0].text).toContain("msg_456");
    });

    it("should handle rejected status", async () => {
      mockClient.sendMessage.mockResolvedValueOnce({
        message_id: "msg_789",
        status: "rejected",
        rejection_reason: "Policy violation",
      });

      const result = await tool.execute("tool_1", {
        recipient: "carol",
        message: "Hello!",
      });

      expect(result.content[0].text).toContain("Message rejected");
      expect(result.content[0].text).toContain("Policy violation");
    });
  });

  describe("connection selection", () => {
    it("should select connection by label", async () => {
      mockClient.getContactConnections.mockResolvedValueOnce([
        { id: "conn_1", label: "personal", status: "active" },
        { id: "conn_2", label: "work", status: "active" },
      ]);

      await tool.execute("tool_1", {
        recipient: "alice",
        message: "Hello!",
        connection_label: "work",
      });

      expect(mockClient.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          recipient_connection_id: "conn_2",
        }),
      );
    });

    it("should select connection by routing tags", async () => {
      mockClient.getContactConnections.mockResolvedValueOnce([
        { id: "conn_1", label: "default", status: "active", capabilities: ["general"] },
        { id: "conn_2", label: "sports", status: "active", capabilities: ["sports", "schedule"] },
      ]);

      await tool.execute("tool_1", {
        recipient: "alice",
        message: "What's the game schedule?",
        routing_tags: ["sports"],
      });

      expect(mockClient.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          recipient_connection_id: "conn_2",
        }),
      );
    });

    it("should fall back to highest priority connection", async () => {
      mockClient.getContactConnections.mockResolvedValueOnce([
        { id: "conn_1", label: "default", status: "active", routing_priority: 1 },
        { id: "conn_2", label: "primary", status: "active", routing_priority: 10 },
      ]);

      await tool.execute("tool_1", {
        recipient: "alice",
        message: "Hello!",
      });

      expect(mockClient.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          recipient_connection_id: "conn_2",
        }),
      );
    });

    it("should skip inactive connections", async () => {
      mockClient.getContactConnections.mockResolvedValueOnce([
        { id: "conn_1", label: "work", status: "inactive" },
        { id: "conn_2", label: "personal", status: "active" },
      ]);

      await tool.execute("tool_1", {
        recipient: "alice",
        message: "Hello!",
        connection_label: "work",
      });

      // Should use active connection since requested one is inactive
      expect(mockClient.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          recipient_connection_id: "conn_2",
        }),
      );
    });
  });

  describe("input validation", () => {
    it("should reject empty recipient", async () => {
      const result = await tool.execute("tool_1", {
        recipient: "",
        message: "Hello!",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Recipient is required");
    });

    it("should reject empty message", async () => {
      const result = await tool.execute("tool_1", {
        recipient: "alice",
        message: "",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Message is required");
    });

    it("should trim whitespace from inputs", async () => {
      await tool.execute("tool_1", {
        recipient: "  alice  ",
        message: "  Hello!  ",
      });

      expect(mockClient.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          recipient: "alice",
          message: "Hello!",
        }),
      );
    });
  });

  describe("policy enforcement", () => {
    it("should reject messages blocked by keyword policy", async () => {
      const api = createMockApi({
        local_policies: {
          blockedKeywords: ["password"],
        },
      });
      const toolWithPolicy = createTalkToAgentTool(api);

      const result = await toolWithPolicy.execute("tool_1", {
        recipient: "alice",
        message: "My password is secret123",
      });

      expect(result.content[0].text).toContain("blocked by local policy");
      expect(mockClient.sendMessage).not.toHaveBeenCalled();
    });

    it("should reject messages exceeding length limit", async () => {
      const api = createMockApi({
        local_policies: {
          maxMessageLength: 10,
        },
      });
      const toolWithPolicy = createTalkToAgentTool(api);

      const result = await toolWithPolicy.execute("tool_1", {
        recipient: "alice",
        message: "This message is way too long",
      });

      expect(result.content[0].text).toContain("blocked by local policy");
    });

    it("should reject messages matching blocked pattern", async () => {
      const api = createMockApi({
        local_policies: {
          blockedPatterns: ["\\d{3}-\\d{2}-\\d{4}"], // SSN pattern
        },
      });
      const toolWithPolicy = createTalkToAgentTool(api);

      const result = await toolWithPolicy.execute("tool_1", {
        recipient: "alice",
        message: "My SSN is 123-45-6789",
      });

      expect(result.content[0].text).toContain("blocked by local policy");
    });
  });

  describe("error handling", () => {
    it("should handle NOT_FRIENDS error", async () => {
      mockClient.sendMessage.mockRejectedValueOnce(
        new MahiloError("Not friends", ErrorCodes.NOT_FRIENDS, 403),
      );

      const result = await tool.execute("tool_1", {
        recipient: "stranger",
        message: "Hello!",
      });

      expect(result.content[0].text).toContain("not in your friends list");
    });

    it("should handle USER_NOT_FOUND error", async () => {
      mockClient.sendMessage.mockRejectedValueOnce(
        new MahiloError("User not found", ErrorCodes.USER_NOT_FOUND, 404),
      );

      const result = await tool.execute("tool_1", {
        recipient: "nobody",
        message: "Hello!",
      });

      expect(result.content[0].text).toContain('User "nobody" not found');
    });

    it("should handle RATE_LIMITED error", async () => {
      mockClient.sendMessage.mockRejectedValueOnce(
        new MahiloError("Too many requests", ErrorCodes.RATE_LIMITED, 429),
      );

      const result = await tool.execute("tool_1", {
        recipient: "alice",
        message: "spam",
      });

      expect(result.content[0].text).toContain("sending too many messages");
    });

    it("should handle INVALID_API_KEY error", async () => {
      mockClient.sendMessage.mockRejectedValueOnce(
        new MahiloError("Invalid API key", ErrorCodes.INVALID_API_KEY, 401),
      );

      const result = await tool.execute("tool_1", {
        recipient: "alice",
        message: "Hello!",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("API key");
    });

    it("should handle connection lookup failure gracefully", async () => {
      mockClient.getContactConnections.mockRejectedValueOnce(
        new Error("Network error"),
      );

      // Should still send message even if connection lookup fails
      await tool.execute("tool_1", {
        recipient: "alice",
        message: "Hello!",
      });

      expect(mockClient.sendMessage).toHaveBeenCalled();
    });

    it("should handle missing API key", async () => {
      (getMahiloClient as any).mockImplementationOnce(() => {
        throw new MahiloError("API key not configured", ErrorCodes.INVALID_API_KEY);
      });

      const result = await tool.execute("tool_1", {
        recipient: "alice",
        message: "Hello!",
      });

      expect(result.isError).toBe(true);
    });
  });
});

describe("list_mahilo_contacts Tool", () => {
  let tool: ReturnType<typeof createListContactsTool>;
  let mockClient: ReturnType<typeof createMockClient>;
  let mockApi: ClawdbotPluginApi;

  beforeEach(() => {
    mockClient = createMockClient();
    (getMahiloClient as any).mockReturnValue(mockClient);
    mockApi = createMockApi();
    tool = createListContactsTool(mockApi);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("tool metadata", () => {
    it("should have correct name", () => {
      expect(tool.name).toBe("list_mahilo_contacts");
    });

    it("should have description", () => {
      expect(tool.description).toContain("List your friends");
    });
  });

  describe("listing contacts", () => {
    it("should list accepted friends by default", async () => {
      mockClient.getFriends.mockResolvedValueOnce([
        { id: "f1", username: "alice", status: "accepted" },
        { id: "f2", username: "bob", status: "accepted", display_name: "Bobby" },
      ]);

      const result = await tool.execute("tool_1", {});

      expect(result.content[0].text).toContain("alice");
      expect(result.content[0].text).toContain("bob");
      expect(result.content[0].text).toContain("(Bobby)");
      expect(mockClient.getFriends).toHaveBeenCalledWith("accepted");
    });

    it("should handle empty friends list", async () => {
      mockClient.getFriends.mockResolvedValueOnce([]);

      const result = await tool.execute("tool_1", {});

      expect(result.content[0].text).toContain("no friends on Mahilo yet");
    });

    it("should filter by pending status", async () => {
      mockClient.getFriends.mockResolvedValueOnce([
        { id: "f1", username: "carol", status: "pending" },
      ]);

      const result = await tool.execute("tool_1", { status: "pending" });

      expect(mockClient.getFriends).toHaveBeenCalledWith("pending");
    });

    it("should show all contacts when status=all", async () => {
      mockClient.getFriends.mockResolvedValueOnce([
        { id: "f1", username: "alice", status: "accepted" },
        { id: "f2", username: "carol", status: "pending" },
      ]);

      const result = await tool.execute("tool_1", { status: "all" });

      expect(result.content[0].text).toContain("alice");
      expect(result.content[0].text).toContain("carol");
      expect(result.content[0].text).toContain("Pending Requests");
      expect(mockClient.getFriends).toHaveBeenCalledWith(undefined);
    });

    it("should format output with sections", async () => {
      mockClient.getFriends.mockResolvedValueOnce([
        { id: "f1", username: "alice", status: "accepted" },
        { id: "f2", username: "bob", status: "accepted" },
        { id: "f3", username: "carol", status: "pending" },
      ]);

      const result = await tool.execute("tool_1", { status: "all" });

      expect(result.content[0].text).toContain("**Friends:**");
      expect(result.content[0].text).toContain("**Pending Requests:**");
    });
  });

  describe("error handling", () => {
    it("should handle INVALID_API_KEY error", async () => {
      mockClient.getFriends.mockRejectedValueOnce(
        new MahiloError("Invalid API key", ErrorCodes.INVALID_API_KEY, 401),
      );

      const result = await tool.execute("tool_1", {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("API key");
    });

    it("should handle network errors", async () => {
      mockClient.getFriends.mockRejectedValueOnce(
        new MahiloError("Network error", ErrorCodes.NETWORK_ERROR),
      );

      const result = await tool.execute("tool_1", {});

      expect(result.content[0].text).toContain("Failed to fetch contacts");
    });

    it("should handle missing API key", async () => {
      (getMahiloClient as any).mockImplementationOnce(() => {
        throw new MahiloError("API key not configured", ErrorCodes.INVALID_API_KEY);
      });

      const result = await tool.execute("tool_1", {});

      expect(result.isError).toBe(true);
    });

    it("should handle generic errors", async () => {
      mockClient.getFriends.mockRejectedValueOnce(new Error("Unknown error"));

      const result = await tool.execute("tool_1", {});

      expect(result.content[0].text).toContain("Failed to fetch contacts");
    });
  });
});
