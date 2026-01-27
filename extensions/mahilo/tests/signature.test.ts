/**
 * Signature Verification Tests
 */

import { describe, it, expect, beforeEach } from "vitest";

import {
  verifyMahiloSignature,
  computeSignature,
} from "../src/webhook/signature.js";

describe("Signature Verification", () => {
  const secret = "test-secret-key";
  const body = '{"message_id":"msg_123","sender":"bob","message":"Hello"}';

  describe("verifyMahiloSignature", () => {
    it("should verify valid signature", () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = `sha256=${computeSignature(body, timestamp, secret)}`;

      const result = verifyMahiloSignature(body, signature, timestamp, secret);
      expect(result).toBe(true);
    });

    it("should reject invalid signature", () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = "sha256=invalid-signature";

      const result = verifyMahiloSignature(body, signature, timestamp, secret);
      expect(result).toBe(false);
    });

    it("should reject expired timestamp (too old)", () => {
      const oldTimestamp = (Math.floor(Date.now() / 1000) - 400).toString(); // 400 seconds ago
      const signature = `sha256=${computeSignature(body, oldTimestamp, secret)}`;

      const result = verifyMahiloSignature(body, signature, oldTimestamp, secret);
      expect(result).toBe(false);
    });

    it("should reject future timestamp", () => {
      const futureTimestamp = (Math.floor(Date.now() / 1000) + 400).toString(); // 400 seconds in future
      const signature = `sha256=${computeSignature(body, futureTimestamp, secret)}`;

      const result = verifyMahiloSignature(body, signature, futureTimestamp, secret);
      expect(result).toBe(false);
    });

    it("should reject invalid timestamp format", () => {
      const signature = `sha256=${computeSignature(body, "not-a-number", secret)}`;

      const result = verifyMahiloSignature(body, signature, "not-a-number", secret);
      expect(result).toBe(false);
    });

    it("should reject signature with wrong length", () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = "sha256=short";

      const result = verifyMahiloSignature(body, signature, timestamp, secret);
      expect(result).toBe(false);
    });

    it("should be timing-safe against different secrets", () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = `sha256=${computeSignature(body, timestamp, "wrong-secret")}`;

      const result = verifyMahiloSignature(body, signature, timestamp, secret);
      expect(result).toBe(false);
    });

    it("should verify with raw body bytes (HIGH-1 fix)", () => {
      // This tests that we use the exact raw body, not JSON.stringify
      const rawBody = '{"message_id":"msg_123","sender":"bob","message":"Hello"}';
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = `sha256=${computeSignature(rawBody, timestamp, secret)}`;

      const result = verifyMahiloSignature(rawBody, signature, timestamp, secret);
      expect(result).toBe(true);

      // Different JSON formatting should fail
      const reformatted = '{ "message_id": "msg_123", "sender": "bob", "message": "Hello" }';
      const result2 = verifyMahiloSignature(reformatted, signature, timestamp, secret);
      expect(result2).toBe(false);
    });
  });

  describe("computeSignature", () => {
    it("should compute consistent signatures", () => {
      const timestamp = "1234567890";
      const sig1 = computeSignature(body, timestamp, secret);
      const sig2 = computeSignature(body, timestamp, secret);

      expect(sig1).toBe(sig2);
    });

    it("should produce different signatures for different bodies", () => {
      const timestamp = "1234567890";
      const sig1 = computeSignature(body, timestamp, secret);
      const sig2 = computeSignature('{"different":"body"}', timestamp, secret);

      expect(sig1).not.toBe(sig2);
    });

    it("should produce different signatures for different timestamps", () => {
      const sig1 = computeSignature(body, "1234567890", secret);
      const sig2 = computeSignature(body, "1234567891", secret);

      expect(sig1).not.toBe(sig2);
    });

    it("should produce different signatures for different secrets", () => {
      const timestamp = "1234567890";
      const sig1 = computeSignature(body, timestamp, secret);
      const sig2 = computeSignature(body, timestamp, "different-secret");

      expect(sig1).not.toBe(sig2);
    });
  });
});
