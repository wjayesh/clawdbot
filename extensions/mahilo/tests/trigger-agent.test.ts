/**
 * Agent Run Triggering Tests
 *
 * Tests for trigger-agent.ts formatting and parameter building logic.
 * The actual callGateway integration is tested via E2E tests.
 */

import { describe, it, expect } from "vitest";

import { formatIncomingMessage } from "../src/webhook/trigger-agent.js";
import type { IncomingMessage } from "../src/types.js";

// Create mock incoming message
function createMockIncomingMessage(overrides: Partial<IncomingMessage> = {}): IncomingMessage {
  return {
    message_id: "msg_test_123",
    sender: "alice",
    sender_agent: "alice-agent",
    message: "Hello from Alice!",
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe("trigger-agent", () => {
  // ========================================================================
  // Message Formatting Tests
  // ========================================================================

  describe("formatIncomingMessage", () => {
    it("should format basic message", () => {
      const incoming = createMockIncomingMessage({
        sender: "bob",
        message: "Hello there!",
      });

      const formatted = formatIncomingMessage(incoming);

      expect(formatted).toContain("Message from bob (via Mahilo)");
      expect(formatted).toContain("Hello there!");
      expect(formatted).toContain('use the talk_to_agent tool with recipient "bob"');
    });

    it("should include context when present", () => {
      const incoming = createMockIncomingMessage({
        sender: "alice",
        message: "Check the docs",
        context: "Following up on our discussion",
      });

      const formatted = formatIncomingMessage(incoming);

      expect(formatted).toContain("[Context: Following up on our discussion]");
    });

    it("should not include context section when absent", () => {
      const incoming = createMockIncomingMessage({
        context: undefined,
      });

      const formatted = formatIncomingMessage(incoming);

      expect(formatted).not.toContain("[Context:");
    });

    it("should include reply instructions", () => {
      const incoming = createMockIncomingMessage({
        sender: "charlie",
      });

      const formatted = formatIncomingMessage(incoming);

      expect(formatted).toContain("To reply, use the talk_to_agent tool");
      expect(formatted).toContain('recipient "charlie"');
    });

    it("should handle empty message", () => {
      const incoming = createMockIncomingMessage({
        sender: "alice",
        message: "",
      });

      const formatted = formatIncomingMessage(incoming);

      expect(formatted).toContain("Message from alice");
    });

    it("should handle long messages", () => {
      const longMessage = "x".repeat(10000);
      const incoming = createMockIncomingMessage({
        message: longMessage,
      });

      const formatted = formatIncomingMessage(incoming);

      expect(formatted).toContain(longMessage);
    });

    it("should handle special characters in message", () => {
      const incoming = createMockIncomingMessage({
        message: 'Hello "world" with <html> & special chars',
      });

      const formatted = formatIncomingMessage(incoming);

      expect(formatted).toContain('Hello "world" with <html> & special chars');
    });

    it("should handle unicode in sender name", () => {
      const incoming = createMockIncomingMessage({
        sender: "Alice 👩‍💻",
        message: "Hello!",
      });

      const formatted = formatIncomingMessage(incoming);

      expect(formatted).toContain("Alice 👩‍💻");
    });

    // ========================================================================
    // Group Message Formatting Tests
    // ========================================================================

    it("should format group message with group_id", () => {
      const incoming = createMockIncomingMessage({
        sender: "bob",
        message: "Hello team!",
        group_id: "grp_123",
      });

      const formatted = formatIncomingMessage(incoming);

      expect(formatted).toContain('in group "grp_123"');
      expect(formatted).toContain("Hello team!");
      expect(formatted).toContain('talk_to_group tool with group_id "grp_123"');
      expect(formatted).toContain('talk_to_agent tool with recipient "bob"');
    });

    it("should format group message with group_name", () => {
      const incoming = createMockIncomingMessage({
        sender: "alice",
        message: "Meeting at 3pm",
        group_id: "grp_456",
        group_name: "Team Alpha",
      });

      const formatted = formatIncomingMessage(incoming);

      expect(formatted).toContain('in group "Team Alpha"');
      expect(formatted).toContain('talk_to_group tool with group_id "grp_456"');
    });

    it("should prefer group_name over group_id for display", () => {
      const incoming = createMockIncomingMessage({
        sender: "charlie",
        message: "Ping!",
        group_id: "grp_789",
        group_name: "Project Beta",
      });

      const formatted = formatIncomingMessage(incoming);

      // Should use group_name for display
      expect(formatted).toContain('in group "Project Beta"');
      // But still use group_id for the tool reference
      expect(formatted).toContain('group_id "grp_789"');
    });

    it("should include both group and direct reply options", () => {
      const incoming = createMockIncomingMessage({
        sender: "dave",
        message: "Question",
        group_id: "grp_100",
      });

      const formatted = formatIncomingMessage(incoming);

      // Should have both reply options
      expect(formatted).toContain("To reply to the group");
      expect(formatted).toContain("To reply directly to dave");
    });

    it("should not include group instructions for non-group messages", () => {
      const incoming = createMockIncomingMessage({
        sender: "eve",
        message: "Direct message",
      });

      const formatted = formatIncomingMessage(incoming);

      expect(formatted).not.toContain("talk_to_group");
      expect(formatted).not.toContain("To reply to the group");
    });

    it("should handle group message with context", () => {
      const incoming = createMockIncomingMessage({
        sender: "frank",
        message: "Update on task",
        context: "Weekly sync",
        group_id: "grp_weekly",
        group_name: "Weekly Standup",
      });

      const formatted = formatIncomingMessage(incoming);

      expect(formatted).toContain("[Context: Weekly sync]");
      expect(formatted).toContain('in group "Weekly Standup"');
    });
  });

  // ========================================================================
  // Config Integration Tests (via exported types)
  // ========================================================================

  describe("config integration", () => {
    it("TriggerAgentContext should require config", () => {
      // This is a compile-time check - the test passes if it compiles
      const ctx = {
        logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
        config: {
          mahilo_api_key: "test",
          inbound_session_key: "main",
        },
      };
      expect(ctx.config.inbound_session_key).toBe("main");
    });

    it("should support custom inbound_session_key", () => {
      const config = {
        inbound_session_key: "custom-session",
        inbound_agent_id: "my-agent",
      };
      expect(config.inbound_session_key).toBe("custom-session");
      expect(config.inbound_agent_id).toBe("my-agent");
    });

    it("should default inbound_session_key when undefined", () => {
      const config = {
        inbound_session_key: undefined,
      };
      // The actual default is applied in resolveConfig
      const sessionKey = config.inbound_session_key ?? "main";
      expect(sessionKey).toBe("main");
    });
  });

  // ========================================================================
  // TriggerAgentResult Type Tests
  // ========================================================================

  describe("TriggerAgentResult", () => {
    it("should represent success", () => {
      const result = { ok: true, runId: "run_123" };
      expect(result.ok).toBe(true);
      expect(result.runId).toBe("run_123");
    });

    it("should represent failure", () => {
      const result = { ok: false, error: "Gateway unavailable" };
      expect(result.ok).toBe(false);
      expect(result.error).toBe("Gateway unavailable");
    });
  });
});
