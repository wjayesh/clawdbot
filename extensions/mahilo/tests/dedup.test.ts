/**
 * Message Deduplication Tests
 */

import { describe, it, expect, beforeEach } from "vitest";

import {
  hasProcessedMessage,
  markMessageProcessed,
  clearProcessedMessages,
} from "../src/webhook/dedup.js";

describe("Message Deduplication", () => {
  beforeEach(() => {
    clearProcessedMessages();
  });

  describe("hasProcessedMessage", () => {
    it("should return false for new message", () => {
      const result = hasProcessedMessage("msg_new_123");
      expect(result).toBe(false);
    });

    it("should return true for processed message", () => {
      markMessageProcessed("msg_processed_123");
      const result = hasProcessedMessage("msg_processed_123");
      expect(result).toBe(true);
    });

    it("should return false for different message IDs", () => {
      markMessageProcessed("msg_1");
      const result = hasProcessedMessage("msg_2");
      expect(result).toBe(false);
    });
  });

  describe("markMessageProcessed", () => {
    it("should mark message as processed", () => {
      expect(hasProcessedMessage("msg_test")).toBe(false);
      markMessageProcessed("msg_test");
      expect(hasProcessedMessage("msg_test")).toBe(true);
    });

    it("should handle multiple messages", () => {
      markMessageProcessed("msg_1");
      markMessageProcessed("msg_2");
      markMessageProcessed("msg_3");

      expect(hasProcessedMessage("msg_1")).toBe(true);
      expect(hasProcessedMessage("msg_2")).toBe(true);
      expect(hasProcessedMessage("msg_3")).toBe(true);
      expect(hasProcessedMessage("msg_4")).toBe(false);
    });

    it("should handle duplicate markings", () => {
      markMessageProcessed("msg_dup");
      markMessageProcessed("msg_dup"); // Mark again
      expect(hasProcessedMessage("msg_dup")).toBe(true);
    });
  });

  describe("clearProcessedMessages", () => {
    it("should clear all processed messages", () => {
      markMessageProcessed("msg_1");
      markMessageProcessed("msg_2");

      expect(hasProcessedMessage("msg_1")).toBe(true);
      expect(hasProcessedMessage("msg_2")).toBe(true);

      clearProcessedMessages();

      expect(hasProcessedMessage("msg_1")).toBe(false);
      expect(hasProcessedMessage("msg_2")).toBe(false);
    });
  });
});
