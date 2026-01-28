/**
 * LLM Policy Evaluator
 *
 * Evaluates messages against LLM-based policies fetched from the registry.
 * Policies are evaluated locally to keep message content private.
 */

import type { LlmPolicy, LlmPolicyEvaluationResult } from "../types.js";

// Type for the runner function
export type RunnerFunction = (params: Record<string, unknown>) => Promise<{ payloads: Array<{ text?: string }> }>;

// Default runner that dynamically imports the embedded runner
let defaultRunner: RunnerFunction | null = null;

async function getDefaultRunner(): Promise<RunnerFunction> {
  if (!defaultRunner) {
    const mod = await import("../../../../src/agents/pi-embedded-runner.js");
    defaultRunner = mod.runEmbeddedPiAgent as RunnerFunction;
  }
  return defaultRunner;
}

// Collect text from embedded runner payloads
function collectText(payloads: Array<{ text?: string }>): string {
  return payloads
    .filter((p) => p.text)
    .map((p) => p.text)
    .join("");
}

export interface LlmPolicyEvaluatorConfig {
  /** Provider to use for LLM evaluation (e.g., "anthropic", "openai"). */
  provider?: string;
  /** Model to use for evaluation (e.g., "claude-3-5-haiku-20241022"). Default: use fastest/cheapest. */
  model?: string;
  /** Timeout for each policy evaluation in milliseconds. Default: 15000. */
  timeoutMs?: number;
  /** Temperature for LLM calls. Default: 0 (deterministic). */
  temperature?: number;
  /** Max tokens for LLM response. Default: 256. */
  maxTokens?: number;
  /** Directory for temporary session files. */
  tmpDir?: string;
  /** Full moltbot config (for provider resolution). */
  config?: Record<string, unknown>;
  /** Inject a custom runner function (for testing). */
  _runnerFn?: RunnerFunction;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_TEMPERATURE = 0;
const DEFAULT_MAX_TOKENS = 256;

/**
 * Build the system prompt for policy evaluation.
 */
function buildPolicyPrompt(policy: LlmPolicy, message: string, context?: string): string {
  return `You are a message policy evaluator. Your job is to determine if a message should be allowed or blocked based on a policy.

## Policy: ${policy.name}
${policy.policy_content}

## Message to Evaluate
${message}
${context ? `\n## Context\n${context}` : ""}

## Instructions
Evaluate whether this message should be ALLOWED or BLOCKED based on the policy above.

Respond with ONLY a JSON object in this exact format:
{
  "decision": "ALLOW" or "BLOCK",
  "reason": "Brief explanation (only if BLOCK)"
}

Important:
- Be strict about following the policy
- If unsure, lean toward ALLOW (unless the policy says otherwise)
- Keep the reason brief (under 100 chars)
- Return ONLY the JSON, no other text`;
}

/**
 * Parse the LLM response to extract the decision.
 */
function parseDecision(text: string): { allowed: boolean; reason?: string } {
  // Try to find JSON in the response
  const jsonMatch = text.match(/\{[\s\S]*?\}/);
  if (!jsonMatch) {
    // Default to allow if we can't parse
    return { allowed: true };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as { decision?: string; reason?: string };
    const decision = parsed.decision?.toUpperCase();

    if (decision === "BLOCK") {
      return { allowed: false, reason: parsed.reason };
    }

    return { allowed: true };
  } catch {
    // Default to allow on parse error
    return { allowed: true };
  }
}

/**
 * Evaluate a single policy against a message.
 */
export async function evaluatePolicy(
  policy: LlmPolicy,
  message: string,
  context: string | undefined,
  evalConfig: LlmPolicyEvaluatorConfig,
): Promise<{ allowed: boolean; reason?: string; error?: string }> {
  const prompt = buildPolicyPrompt(policy, message, context);
  const timeoutMs = evalConfig.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    // Use injected runner or default
    const runner = evalConfig._runnerFn ?? (await getDefaultRunner());
    const tmpDir = evalConfig.tmpDir ?? "/tmp/mahilo-policy";

    const result = await runner({
      sessionId: `mahilo-policy-${policy.id}-${Date.now()}`,
      sessionFile: `${tmpDir}/policy-${policy.id}.json`,
      workspaceDir: process.cwd(),
      config: evalConfig.config,
      prompt,
      timeoutMs,
      runId: `mahilo-policy-${Date.now()}`,
      provider: evalConfig.provider,
      model: evalConfig.model,
      streamParams: {
        temperature: evalConfig.temperature ?? DEFAULT_TEMPERATURE,
        maxTokens: evalConfig.maxTokens ?? DEFAULT_MAX_TOKENS,
      },
      disableTools: true, // JSON-only mode
    });

    const text = collectText(result.payloads);
    return parseDecision(text);
  } catch (err) {
    // Handle LLM error based on policy's fail_behavior
    const failBehavior = policy.fail_behavior ?? "open";
    const errorMsg = err instanceof Error ? err.message : "Unknown error";

    if (failBehavior === "closed") {
      return { allowed: false, reason: "Policy evaluation failed", error: errorMsg };
    }

    // fail-open: allow the message
    return { allowed: true, error: errorMsg };
  }
}

/**
 * Evaluate a message against multiple policies.
 * Returns as soon as any policy blocks the message.
 *
 * @param policies - Policies to evaluate (should be pre-sorted by priority)
 * @param message - The message to evaluate
 * @param context - Optional context about the message
 * @param evalConfig - Configuration for the LLM evaluator
 * @returns Evaluation result with allow/block decision
 */
export async function evaluatePolicies(
  policies: LlmPolicy[],
  message: string,
  context: string | undefined,
  evalConfig: LlmPolicyEvaluatorConfig,
): Promise<LlmPolicyEvaluationResult> {
  // No policies = allow
  if (policies.length === 0) {
    return { allowed: true };
  }

  // Evaluate policies in priority order (highest first)
  for (const policy of policies) {
    const result = await evaluatePolicy(policy, message, context, evalConfig);

    if (!result.allowed) {
      return {
        allowed: false,
        reason: result.reason ?? "Message blocked by LLM policy",
        blocking_policy_id: policy.id,
        blocking_policy_name: policy.name,
      };
    }

    // Log any errors but continue if fail-open allowed the message
    if (result.error) {
      // Could add logging here if we had access to logger
    }
  }

  return { allowed: true };
}

/**
 * Create a reusable LLM policy evaluator with pre-configured settings.
 */
export function createLlmPolicyEvaluator(defaultConfig: LlmPolicyEvaluatorConfig) {
  return {
    /**
     * Evaluate a single policy.
     */
    async evaluatePolicy(
      policy: LlmPolicy,
      message: string,
      context?: string,
      overrides?: Partial<LlmPolicyEvaluatorConfig>,
    ) {
      return evaluatePolicy(policy, message, context, { ...defaultConfig, ...overrides });
    },

    /**
     * Evaluate multiple policies (short-circuits on first block).
     */
    async evaluatePolicies(
      policies: LlmPolicy[],
      message: string,
      context?: string,
      overrides?: Partial<LlmPolicyEvaluatorConfig>,
    ) {
      return evaluatePolicies(policies, message, context, { ...defaultConfig, ...overrides });
    },
  };
}
