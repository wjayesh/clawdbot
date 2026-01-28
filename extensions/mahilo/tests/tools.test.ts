/**
 * Tools Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { createTalkToAgentTool } from "../src/tools/talk-to-agent.js";
import { createTalkToGroupTool } from "../src/tools/talk-to-group.js";
import { createListContactsTool } from "../src/tools/list-contacts.js";
import type { MoltbotPluginApi } from "clawdbot/plugin-sdk";

// Mock the Mahilo client module
vi.mock("../src/client/mahilo-api.js", () => ({
  getMahiloClient: vi.fn(),
  MahiloClient: vi.fn(),
}));

// Mock the LLM evaluator module
vi.mock("../src/policy/llm-evaluator.js", () => ({
  evaluatePolicies: vi.fn(),
  evaluatePolicy: vi.fn(),
  createLlmPolicyEvaluator: vi.fn(),
}));

// Import the mocks after setting them up
import { getMahiloClient } from "../src/client/mahilo-api.js";
import { evaluatePolicies } from "../src/policy/llm-evaluator.js";
import { MahiloError, ErrorCodes } from "../src/types.js";

// Create a mock plugin API
function createMockApi(pluginConfig: Record<string, unknown> = {}): MoltbotPluginApi {
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
    getGroups: vi.fn().mockResolvedValue([]),
    getGroup: vi.fn().mockResolvedValue(null),
    getGroupMembers: vi.fn().mockResolvedValue([]),
    getContactConnections: vi.fn().mockResolvedValue([]),
    getApplicablePolicies: vi.fn().mockResolvedValue([]),
    registerAgent: vi.fn().mockResolvedValue({ connection_id: "c1", callback_secret: "s" }),
    ...overrides,
  };
}

describe("talk_to_agent Tool", () => {
  let tool: ReturnType<typeof createTalkToAgentTool>;
  let mockClient: ReturnType<typeof createMockClient>;
  let mockApi: MoltbotPluginApi;

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

  describe("LLM policy enforcement", () => {
    it("should call LLM policy evaluation when enabled", async () => {
      const api = createMockApi({
        llm_policies: {
          enabled: true,
          provider: "anthropic",
          model: "claude-3-haiku",
        },
      });
      const toolWithLlm = createTalkToAgentTool(api);

      mockClient.getApplicablePolicies.mockResolvedValueOnce([
        {
          id: "policy_1",
          name: "No Spam",
          policy_content: "Block spam messages",
          scope: "global",
          direction: "outbound",
          priority: 100,
          enabled: true,
        },
      ]);

      (evaluatePolicies as any).mockResolvedValueOnce({ allowed: true });

      await toolWithLlm.execute("tool_1", {
        recipient: "alice",
        message: "Hello!",
      });

      expect(mockClient.getApplicablePolicies).toHaveBeenCalledWith({
        direction: "outbound",
        targetUser: "alice",
      });
      expect(evaluatePolicies).toHaveBeenCalled();
    });

    it("should block message when LLM policy rejects", async () => {
      const api = createMockApi({
        llm_policies: {
          enabled: true,
        },
      });
      const toolWithLlm = createTalkToAgentTool(api);

      mockClient.getApplicablePolicies.mockResolvedValueOnce([
        {
          id: "policy_1",
          name: "No Profanity",
          policy_content: "Block profane messages",
          scope: "global",
          direction: "outbound",
          priority: 100,
          enabled: true,
        },
      ]);

      (evaluatePolicies as any).mockResolvedValueOnce({
        allowed: false,
        reason: "Contains inappropriate language",
        blocking_policy_name: "No Profanity",
      });

      const result = await toolWithLlm.execute("tool_1", {
        recipient: "alice",
        message: "Some bad message",
      });

      expect(result.content[0].text).toContain("blocked by content policy");
      expect(result.content[0].text).toContain("No Profanity");
      expect(mockClient.sendMessage).not.toHaveBeenCalled();
    });

    it("should skip LLM evaluation when disabled", async () => {
      const api = createMockApi({
        llm_policies: {
          enabled: false,
        },
      });
      const toolWithLlm = createTalkToAgentTool(api);

      await toolWithLlm.execute("tool_1", {
        recipient: "alice",
        message: "Hello!",
      });

      expect(mockClient.getApplicablePolicies).not.toHaveBeenCalled();
      expect(evaluatePolicies).not.toHaveBeenCalled();
    });

    it("should skip LLM evaluation when no policies apply", async () => {
      const api = createMockApi({
        llm_policies: {
          enabled: true,
        },
      });
      const toolWithLlm = createTalkToAgentTool(api);

      mockClient.getApplicablePolicies.mockResolvedValueOnce([]);

      await toolWithLlm.execute("tool_1", {
        recipient: "alice",
        message: "Hello!",
      });

      expect(mockClient.getApplicablePolicies).toHaveBeenCalled();
      expect(evaluatePolicies).not.toHaveBeenCalled();
      expect(mockClient.sendMessage).toHaveBeenCalled();
    });

    it("should continue on LLM evaluation error (fail-open)", async () => {
      const api = createMockApi({
        llm_policies: {
          enabled: true,
        },
      });
      const toolWithLlm = createTalkToAgentTool(api);

      mockClient.getApplicablePolicies.mockResolvedValueOnce([
        {
          id: "policy_1",
          name: "Test Policy",
          policy_content: "Test",
          scope: "global",
          direction: "outbound",
          priority: 100,
          enabled: true,
        },
      ]);

      (evaluatePolicies as any).mockRejectedValueOnce(new Error("LLM service unavailable"));

      await toolWithLlm.execute("tool_1", {
        recipient: "alice",
        message: "Hello!",
      });

      // Should still send the message despite LLM error
      expect(mockClient.sendMessage).toHaveBeenCalled();
    });

    it("should use configured timeout for LLM evaluation", async () => {
      const api = createMockApi({
        llm_policies: {
          enabled: true,
          timeout_ms: 30000,
        },
      });
      const toolWithLlm = createTalkToAgentTool(api);

      mockClient.getApplicablePolicies.mockResolvedValueOnce([
        {
          id: "policy_1",
          name: "Test",
          policy_content: "Test",
          scope: "global",
          direction: "outbound",
          priority: 100,
          enabled: true,
        },
      ]);

      (evaluatePolicies as any).mockResolvedValueOnce({ allowed: true });

      await toolWithLlm.execute("tool_1", {
        recipient: "alice",
        message: "Hello!",
      });

      // Verify the config passed to evaluatePolicies includes the timeout
      expect(evaluatePolicies).toHaveBeenCalled();
      const lastCall = (evaluatePolicies as any).mock.calls[0];
      expect(lastCall[3]).toHaveProperty("timeoutMs", 30000);
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

describe("talk_to_group Tool", () => {
  let tool: ReturnType<typeof createTalkToGroupTool>;
  let mockClient: ReturnType<typeof createMockClient>;
  let mockApi: MoltbotPluginApi;

  beforeEach(() => {
    mockClient = createMockClient();
    (getMahiloClient as any).mockReturnValue(mockClient);
    mockApi = createMockApi();
    tool = createTalkToGroupTool(mockApi);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("tool metadata", () => {
    it("should have correct name", () => {
      expect(tool.name).toBe("talk_to_group");
    });

    it("should have description", () => {
      expect(tool.description).toContain("Mahilo group");
    });
  });

  describe("successful sends", () => {
    it("should send message to group", async () => {
      const result = await tool.execute("tool_1", {
        group_id: "group_123",
        message: "Hello group!",
      });

      expect(result.content[0].text).toContain("Message sent to group group_123");
      expect(mockClient.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          recipient: "group_123",
          recipient_type: "group",
          message: "Hello group!",
        }),
      );
    });

    it("should include context when provided", async () => {
      await tool.execute("tool_1", {
        group_id: "group_123",
        message: "Hello group!",
        context: "Sharing an update",
      });

      expect(mockClient.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          context: "Sharing an update",
        }),
      );
    });

    it("should handle pending status", async () => {
      mockClient.sendMessage.mockResolvedValueOnce({
        message_id: "msg_456",
        status: "pending",
      });

      const result = await tool.execute("tool_1", {
        group_id: "group_123",
        message: "Hello group!",
      });

      expect(result.content[0].text).toContain("Message queued for group group_123");
      expect(result.content[0].text).toContain("msg_456");
    });

    it("should handle rejected status", async () => {
      mockClient.sendMessage.mockResolvedValueOnce({
        message_id: "msg_789",
        status: "rejected",
        rejection_reason: "Policy violation",
      });

      const result = await tool.execute("tool_1", {
        group_id: "group_123",
        message: "Hello group!",
      });

      expect(result.content[0].text).toContain("Message rejected");
      expect(result.content[0].text).toContain("Policy violation");
    });
  });

  describe("input validation", () => {
    it("should reject empty group id", async () => {
      const result = await tool.execute("tool_1", {
        group_id: "",
        message: "Hello!",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Group id is required");
    });

    it("should reject empty message", async () => {
      const result = await tool.execute("tool_1", {
        group_id: "group_123",
        message: "",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Message is required");
    });
  });

  describe("policy enforcement", () => {
    it("should reject messages blocked by keyword policy", async () => {
      const api = createMockApi({
        local_policies: {
          blockedKeywords: ["password"],
        },
      });
      const toolWithPolicy = createTalkToGroupTool(api);

      const result = await toolWithPolicy.execute("tool_1", {
        group_id: "group_123",
        message: "My password is secret123",
      });

      expect(result.content[0].text).toContain("blocked by local policy");
      expect(mockClient.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe("LLM policy enforcement", () => {
    it("should call LLM policy evaluation for groups when enabled", async () => {
      const api = createMockApi({
        llm_policies: {
          enabled: true,
        },
      });
      const toolWithLlm = createTalkToGroupTool(api);

      mockClient.getApplicablePolicies.mockResolvedValueOnce([
        {
          id: "policy_1",
          name: "Group Content Policy",
          policy_content: "Block inappropriate content",
          scope: "group",
          direction: "outbound",
          priority: 100,
          target_group: "group_123",
          enabled: true,
        },
      ]);

      (evaluatePolicies as any).mockResolvedValueOnce({ allowed: true });

      await toolWithLlm.execute("tool_1", {
        group_id: "group_123",
        message: "Hello group!",
      });

      expect(mockClient.getApplicablePolicies).toHaveBeenCalledWith({
        direction: "outbound",
        targetGroup: "group_123",
      });
      expect(evaluatePolicies).toHaveBeenCalled();
    });

    it("should block group message when LLM policy rejects", async () => {
      const api = createMockApi({
        llm_policies: {
          enabled: true,
        },
      });
      const toolWithLlm = createTalkToGroupTool(api);

      mockClient.getApplicablePolicies.mockResolvedValueOnce([
        {
          id: "policy_1",
          name: "No Spam",
          policy_content: "Block spam",
          scope: "global",
          direction: "outbound",
          priority: 100,
          enabled: true,
        },
      ]);

      (evaluatePolicies as any).mockResolvedValueOnce({
        allowed: false,
        reason: "Looks like spam",
        blocking_policy_name: "No Spam",
      });

      const result = await toolWithLlm.execute("tool_1", {
        group_id: "group_123",
        message: "Buy now!!!",
      });

      expect(result.content[0].text).toContain("blocked by content policy");
      expect(mockClient.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("should handle GROUP_NOT_FOUND error", async () => {
      mockClient.sendMessage.mockRejectedValueOnce(
        new MahiloError("Group not found", ErrorCodes.GROUP_NOT_FOUND, 404),
      );

      const result = await tool.execute("tool_1", {
        group_id: "missing-group",
        message: "Hello!",
      });

      expect(result.content[0].text).toContain('group "missing-group" not found');
    });

    it("should handle NOT_GROUP_MEMBER error", async () => {
      mockClient.sendMessage.mockRejectedValueOnce(
        new MahiloError("Not a member", ErrorCodes.NOT_GROUP_MEMBER, 403),
      );

      const result = await tool.execute("tool_1", {
        group_id: "group_123",
        message: "Hello!",
      });

      expect(result.content[0].text).toContain("not a member of group");
    });

    it("should handle INVALID_API_KEY error", async () => {
      mockClient.sendMessage.mockRejectedValueOnce(
        new MahiloError("Invalid API key", ErrorCodes.INVALID_API_KEY, 401),
      );

      const result = await tool.execute("tool_1", {
        group_id: "group_123",
        message: "Hello!",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("API key");
    });

    it("should handle NOT_IMPLEMENTED error", async () => {
      mockClient.sendMessage.mockRejectedValueOnce(
        new MahiloError("Group messaging not supported", ErrorCodes.NOT_IMPLEMENTED, 501),
      );

      const result = await tool.execute("tool_1", {
        group_id: "group_123",
        message: "Hello!",
      });

      expect(result.content[0].text).toContain("Group messaging is not supported");
    });
  });
});

describe("list_mahilo_contacts Tool", () => {
  let tool: ReturnType<typeof createListContactsTool>;
  let mockClient: ReturnType<typeof createMockClient>;
  let mockApi: MoltbotPluginApi;

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
      mockClient.getGroups.mockResolvedValueOnce([]);

      const result = await tool.execute("tool_1", {});

      expect(result.content[0].text).toContain("no friends or groups on Mahilo yet");
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

  describe("groups support", () => {
    it("should include groups by default", async () => {
      mockClient.getFriends.mockResolvedValueOnce([
        { id: "f1", username: "alice", status: "accepted" },
      ]);
      mockClient.getGroups.mockResolvedValueOnce([
        { id: "grp_1", name: "Team Alpha", owner: "alice", member_count: 5 },
        { id: "grp_2", name: "Project Beta", owner: "bob", description: "Main project channel" },
      ]);

      const result = await tool.execute("tool_1", {});

      expect(result.content[0].text).toContain("**Groups:**");
      expect(result.content[0].text).toContain("Team Alpha");
      expect(result.content[0].text).toContain("grp_1");
      expect(result.content[0].text).toContain("Project Beta");
      expect(result.content[0].text).toContain("Main project channel");
      expect(result.content[0].text).toContain("(5 members)");
    });

    it("should exclude groups when include_groups=false", async () => {
      mockClient.getFriends.mockResolvedValueOnce([
        { id: "f1", username: "alice", status: "accepted" },
      ]);
      mockClient.getGroups.mockResolvedValueOnce([
        { id: "grp_1", name: "Team Alpha", owner: "alice" },
      ]);

      const result = await tool.execute("tool_1", { include_groups: false });

      expect(result.content[0].text).not.toContain("**Groups:**");
      expect(result.content[0].text).not.toContain("Team Alpha");
      expect(mockClient.getGroups).not.toHaveBeenCalled();
    });

    it("should handle groups API error gracefully", async () => {
      mockClient.getFriends.mockResolvedValueOnce([
        { id: "f1", username: "alice", status: "accepted" },
      ]);
      mockClient.getGroups.mockRejectedValueOnce(new Error("Groups API error"));

      const result = await tool.execute("tool_1", {});

      // Should still show friends even if groups fail
      expect(result.content[0].text).toContain("alice");
      expect(result.content[0].text).not.toContain("**Groups:**");
    });

    it("should show empty message when no friends or groups", async () => {
      mockClient.getFriends.mockResolvedValueOnce([]);
      mockClient.getGroups.mockResolvedValueOnce([]);

      const result = await tool.execute("tool_1", {});

      expect(result.content[0].text).toContain("no friends or groups on Mahilo yet");
    });

    it("should show only groups when no friends", async () => {
      mockClient.getFriends.mockResolvedValueOnce([]);
      mockClient.getGroups.mockResolvedValueOnce([
        { id: "grp_1", name: "Team Alpha", owner: "alice", member_count: 3 },
      ]);

      const result = await tool.execute("tool_1", {});

      expect(result.content[0].text).toContain("**Groups:**");
      expect(result.content[0].text).toContain("Team Alpha");
      expect(result.content[0].text).not.toContain("**Friends:**");
    });

    it("should display group ID on separate line", async () => {
      mockClient.getFriends.mockResolvedValueOnce([]);
      mockClient.getGroups.mockResolvedValueOnce([
        { id: "grp_test_123", name: "Test Group", owner: "alice" },
      ]);

      const result = await tool.execute("tool_1", {});

      expect(result.content[0].text).toContain("ID: grp_test_123");
    });

    it("should handle groups without member_count", async () => {
      mockClient.getFriends.mockResolvedValueOnce([]);
      mockClient.getGroups.mockResolvedValueOnce([
        { id: "grp_1", name: "Team Alpha", owner: "alice" },
      ]);

      const result = await tool.execute("tool_1", {});

      expect(result.content[0].text).toContain("Team Alpha");
      expect(result.content[0].text).not.toContain("members)");
    });
  });
});
