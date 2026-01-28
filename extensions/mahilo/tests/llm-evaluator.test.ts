/**
 * LLM Policy Evaluator Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

import {
  evaluatePolicy,
  evaluatePolicies,
  createLlmPolicyEvaluator,
  type RunnerFunction,
} from "../src/policy/llm-evaluator.js";
import type { LlmPolicy } from "../src/types.js";

// Create mock runner function
function createMockRunner() {
  return vi.fn<Parameters<RunnerFunction>, ReturnType<RunnerFunction>>();
}

const samplePolicy: LlmPolicy = {
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
};

const strictPolicy: LlmPolicy = {
  ...samplePolicy,
  id: "pol_strict",
  name: "Strict confidentiality",
  policy_content: "Block any message containing the word 'secret'.",
  fail_behavior: "closed",
};

describe("evaluatePolicy", () => {
  let mockRunner: ReturnType<typeof createMockRunner>;

  beforeEach(() => {
    mockRunner = createMockRunner();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should allow message when LLM returns ALLOW", async () => {
    mockRunner.mockResolvedValueOnce({
      payloads: [{ text: '{ "decision": "ALLOW" }' }],
    });

    const result = await evaluatePolicy(samplePolicy, "Hello, how are you?", undefined, {
      _runnerFn: mockRunner,
    });

    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("should block message when LLM returns BLOCK", async () => {
    mockRunner.mockResolvedValueOnce({
      payloads: [{ text: '{ "decision": "BLOCK", "reason": "Contains profanity" }' }],
    });

    const result = await evaluatePolicy(samplePolicy, "This is a bad word", undefined, {
      _runnerFn: mockRunner,
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("Contains profanity");
  });

  it("should handle BLOCK decision in lowercase", async () => {
    mockRunner.mockResolvedValueOnce({
      payloads: [{ text: '{ "decision": "block", "reason": "Policy violation" }' }],
    });

    const result = await evaluatePolicy(samplePolicy, "Bad message", undefined, {
      _runnerFn: mockRunner,
    });

    expect(result.allowed).toBe(false);
  });

  it("should allow when JSON is embedded in other text", async () => {
    mockRunner.mockResolvedValueOnce({
      payloads: [
        { text: 'Based on my analysis:\n\n{ "decision": "ALLOW" }\n\nThe message is clean.' },
      ],
    });

    const result = await evaluatePolicy(samplePolicy, "Hello!", undefined, {
      _runnerFn: mockRunner,
    });

    expect(result.allowed).toBe(true);
  });

  it("should default to allow when response cannot be parsed", async () => {
    mockRunner.mockResolvedValueOnce({
      payloads: [{ text: "I cannot determine the policy decision clearly." }],
    });

    const result = await evaluatePolicy(samplePolicy, "Test message", undefined, {
      _runnerFn: mockRunner,
    });

    expect(result.allowed).toBe(true);
  });

  it("should default to allow on invalid JSON", async () => {
    mockRunner.mockResolvedValueOnce({
      payloads: [{ text: '{ invalid json' }],
    });

    const result = await evaluatePolicy(samplePolicy, "Test message", undefined, {
      _runnerFn: mockRunner,
    });

    expect(result.allowed).toBe(true);
  });

  it("should fail-open on LLM error by default", async () => {
    mockRunner.mockRejectedValueOnce(new Error("LLM timeout"));

    const result = await evaluatePolicy(samplePolicy, "Test message", undefined, {
      _runnerFn: mockRunner,
    });

    expect(result.allowed).toBe(true);
    expect(result.error).toBe("LLM timeout");
  });

  it("should fail-closed when policy specifies", async () => {
    mockRunner.mockRejectedValueOnce(new Error("LLM unavailable"));

    const result = await evaluatePolicy(strictPolicy, "Test message", undefined, {
      _runnerFn: mockRunner,
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("Policy evaluation failed");
    expect(result.error).toBe("LLM unavailable");
  });

  it("should pass config to runner", async () => {
    mockRunner.mockResolvedValueOnce({
      payloads: [{ text: '{ "decision": "ALLOW" }' }],
    });

    await evaluatePolicy(samplePolicy, "Hello", "Testing context", {
      _runnerFn: mockRunner,
      provider: "anthropic",
      model: "claude-3-5-haiku-20241022",
      timeoutMs: 10000,
      temperature: 0.5,
      maxTokens: 512,
    });

    expect(mockRunner).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "anthropic",
        model: "claude-3-5-haiku-20241022",
        timeoutMs: 10000,
        disableTools: true,
        streamParams: expect.objectContaining({
          temperature: 0.5,
          maxTokens: 512,
        }),
      }),
    );
  });

  it("should include policy name and content in prompt", async () => {
    mockRunner.mockResolvedValueOnce({
      payloads: [{ text: '{ "decision": "ALLOW" }' }],
    });

    await evaluatePolicy(samplePolicy, "Test message", undefined, {
      _runnerFn: mockRunner,
    });

    expect(mockRunner).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("No profanity"),
      }),
    );
    expect(mockRunner).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Check if the message contains profanity"),
      }),
    );
  });

  it("should include message in prompt", async () => {
    mockRunner.mockResolvedValueOnce({
      payloads: [{ text: '{ "decision": "ALLOW" }' }],
    });

    await evaluatePolicy(samplePolicy, "My test message content", undefined, {
      _runnerFn: mockRunner,
    });

    expect(mockRunner).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("My test message content"),
      }),
    );
  });

  it("should include context when provided", async () => {
    mockRunner.mockResolvedValueOnce({
      payloads: [{ text: '{ "decision": "ALLOW" }' }],
    });

    await evaluatePolicy(samplePolicy, "Test message", "This is some context", {
      _runnerFn: mockRunner,
    });

    expect(mockRunner).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("This is some context"),
      }),
    );
  });
});

describe("evaluatePolicies", () => {
  let mockRunner: ReturnType<typeof createMockRunner>;

  beforeEach(() => {
    mockRunner = createMockRunner();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should allow when no policies are provided", async () => {
    const result = await evaluatePolicies([], "Test message", undefined, {
      _runnerFn: mockRunner,
    });

    expect(result.allowed).toBe(true);
    expect(mockRunner).not.toHaveBeenCalled();
  });

  it("should allow when all policies pass", async () => {
    const policies = [
      { ...samplePolicy, id: "pol_1" },
      { ...samplePolicy, id: "pol_2" },
    ];

    mockRunner
      .mockResolvedValueOnce({ payloads: [{ text: '{ "decision": "ALLOW" }' }] })
      .mockResolvedValueOnce({ payloads: [{ text: '{ "decision": "ALLOW" }' }] });

    const result = await evaluatePolicies(policies, "Clean message", undefined, {
      _runnerFn: mockRunner,
    });

    expect(result.allowed).toBe(true);
    expect(mockRunner).toHaveBeenCalledTimes(2);
  });

  it("should block when any policy blocks", async () => {
    const policies = [
      { ...samplePolicy, id: "pol_1", name: "First Policy" },
      { ...samplePolicy, id: "pol_2", name: "Second Policy" },
    ];

    mockRunner
      .mockResolvedValueOnce({ payloads: [{ text: '{ "decision": "ALLOW" }' }] })
      .mockResolvedValueOnce({
        payloads: [{ text: '{ "decision": "BLOCK", "reason": "Bad content" }' }],
      });

    const result = await evaluatePolicies(policies, "Suspicious message", undefined, {
      _runnerFn: mockRunner,
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("Bad content");
    expect(result.blocking_policy_id).toBe("pol_2");
    expect(result.blocking_policy_name).toBe("Second Policy");
  });

  it("should short-circuit on first block", async () => {
    const policies = [
      { ...samplePolicy, id: "pol_1", name: "First Policy" },
      { ...samplePolicy, id: "pol_2", name: "Second Policy" },
      { ...samplePolicy, id: "pol_3", name: "Third Policy" },
    ];

    mockRunner.mockResolvedValueOnce({
      payloads: [{ text: '{ "decision": "BLOCK", "reason": "Blocked by first" }' }],
    });

    const result = await evaluatePolicies(policies, "Bad message", undefined, {
      _runnerFn: mockRunner,
    });

    expect(result.allowed).toBe(false);
    expect(result.blocking_policy_id).toBe("pol_1");
    // Should not evaluate the remaining policies
    expect(mockRunner).toHaveBeenCalledTimes(1);
  });

  it("should include blocking policy info in result", async () => {
    const blockerPolicy: LlmPolicy = {
      ...samplePolicy,
      id: "pol_blocker",
      name: "The Blocker Policy",
    };

    mockRunner.mockResolvedValueOnce({
      payloads: [{ text: '{ "decision": "BLOCK", "reason": "Violation detected" }' }],
    });

    const result = await evaluatePolicies([blockerPolicy], "Bad message", undefined, {
      _runnerFn: mockRunner,
    });

    expect(result.blocking_policy_id).toBe("pol_blocker");
    expect(result.blocking_policy_name).toBe("The Blocker Policy");
  });

  it("should provide default reason when policy blocks without reason", async () => {
    mockRunner.mockResolvedValueOnce({
      payloads: [{ text: '{ "decision": "BLOCK" }' }],
    });

    const result = await evaluatePolicies([samplePolicy], "Bad message", undefined, {
      _runnerFn: mockRunner,
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("Message blocked by LLM policy");
  });
});

describe("createLlmPolicyEvaluator", () => {
  let mockRunner: ReturnType<typeof createMockRunner>;

  beforeEach(() => {
    mockRunner = createMockRunner();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should create reusable evaluator with default config", async () => {
    const evaluator = createLlmPolicyEvaluator({
      provider: "anthropic",
      model: "claude-3-5-haiku-20241022",
      timeoutMs: 5000,
      _runnerFn: mockRunner,
    });

    mockRunner.mockResolvedValueOnce({
      payloads: [{ text: '{ "decision": "ALLOW" }' }],
    });

    await evaluator.evaluatePolicy(samplePolicy, "Test message");

    expect(mockRunner).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "anthropic",
        model: "claude-3-5-haiku-20241022",
        timeoutMs: 5000,
      }),
    );
  });

  it("should allow overriding default config per call", async () => {
    const evaluator = createLlmPolicyEvaluator({
      provider: "anthropic",
      model: "claude-3-5-haiku-20241022",
      timeoutMs: 5000,
      _runnerFn: mockRunner,
    });

    mockRunner.mockResolvedValueOnce({
      payloads: [{ text: '{ "decision": "ALLOW" }' }],
    });

    await evaluator.evaluatePolicy(samplePolicy, "Test message", undefined, {
      timeoutMs: 10000,
    });

    expect(mockRunner).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "anthropic",
        model: "claude-3-5-haiku-20241022",
        timeoutMs: 10000, // Override
      }),
    );
  });

  it("should evaluate multiple policies", async () => {
    const evaluator = createLlmPolicyEvaluator({
      timeoutMs: 5000,
      _runnerFn: mockRunner,
    });
    const policies = [samplePolicy, { ...samplePolicy, id: "pol_2" }];

    mockRunner
      .mockResolvedValueOnce({ payloads: [{ text: '{ "decision": "ALLOW" }' }] })
      .mockResolvedValueOnce({ payloads: [{ text: '{ "decision": "ALLOW" }' }] });

    const result = await evaluator.evaluatePolicies(policies, "Clean message");

    expect(result.allowed).toBe(true);
    expect(mockRunner).toHaveBeenCalledTimes(2);
  });
});
