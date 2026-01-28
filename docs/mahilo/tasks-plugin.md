# Clawdbot Mahilo Plugin: Task Plan

> **Project**: Clawdbot Mahilo Plugin (Extension)  
> **Phase**: 1 - Core Integration (mostly complete) + 2 - Secure Messaging and Registry Integration  
> **Goal**: Enable Clawdbot to send/receive messages via the Mahilo network with a phased path to E2E encryption, group messaging, and trusted routing

---

## Status Legend

| Status | Meaning |
|--------|---------|
| `pending` | Not started |
| `in-progress` | Currently being worked on |
| `blocked` | Waiting on something |
| `review` | Ready for review |
| `done` | Completed |

---

## Task List

## Phase 1 - Core Integration

### 1. Plugin Scaffold

#### 1.1 Create Plugin Directory Structure
- **ID**: `PLG-001`
- **Status**: `done`
- **Priority**: P0
- **Notes**: 
  - Create `extensions/mahilo/` directory
  - Follow existing plugin structure (see `extensions/discord/` for reference)
  - Subdirs: src/tools, src/webhook, src/client, src/policy
- **Acceptance Criteria**:
  - [ ] Directory structure created
  - [ ] Follows Clawdbot plugin conventions

#### 1.2 Create Plugin Manifest
- **ID**: `PLG-002`
- **Status**: `done`
- **Priority**: P0
- **Notes**: 
  - `moltbot.plugin.json` with:
    - id (required)
    - configSchema (required, JSON Schema)
    - name/description/version (optional metadata)
  - Tools, HTTP routes, hooks, and services are registered in code via the plugin API (not in the manifest)
- **Acceptance Criteria**:
  - [ ] Valid plugin manifest
  - [ ] Config schema for API key, URL, etc.
  - [ ] Manifest includes id + configSchema

#### 1.3 Create package.json
- **ID**: `PLG-003`
- **Status**: `done`
- **Priority**: P0
- **Notes**: 
  - Dependencies: HTTP client (undici/fetch), crypto
  - DevDependencies: types, vitest
  - Keep dependencies minimal
  - clawdbot in peerDependencies
- **Acceptance Criteria**:
  - [ ] Valid package.json
  - [ ] Minimal dependency footprint

#### 1.4 Create Plugin Entry Point
- **ID**: `PLG-004`
- **Status**: `done`
- **Priority**: P0
- **Notes**: 
  - `index.ts` default-exports the plugin definition
  - Register tools/routes in `register(api)`
  - Use `api.on("gateway_start")` / `api.on("gateway_stop")` for lifecycle hooks
- **Acceptance Criteria**:
  - [ ] Plugin loads without errors
  - [ ] Exports are correct

---

### 2. Configuration

#### 2.1 Define Configuration Schema
- **ID**: `PLG-005`
- **Status**: `done`
- **Priority**: P0
- **Notes**: 
  - Required: mahilo_api_key
  - Optional: mahilo_api_url, callback_path, callback_url_override, auto_register, local_policies
  - Add: connection_label, connection_description, connection_capabilities
  - Add: inbound_policies
  - Use TypeBox or Zod for schema
- **Acceptance Criteria**:
  - [ ] Schema defined with types
  - [ ] Defaults set correctly
  - [ ] Validation works

#### 2.2 Config Loading and Validation
- **ID**: `PLG-006`
- **Status**: `done`
- **Priority**: P0
- **Notes**: 
  - Load config from Clawdbot config system
  - Validate on plugin load
  - Clear error messages for missing/invalid config
  - Config lives under plugins.entries.<id>.config
- **Acceptance Criteria**:
  - [ ] Config loads from Clawdbot
  - [ ] Validation errors are clear
  - [ ] Plugin fails gracefully without API key

---

### 3. Mahilo API Client

#### 3.1 HTTP Client Setup
- **ID**: `PLG-007`
- **Status**: `done`
- **Priority**: P0
- **Notes**: 
  - Use fetch (native) or undici
  - Base URL from config
  - Auth header injection
  - Error handling wrapper
- **Acceptance Criteria**:
  - [ ] Client makes authenticated requests
  - [ ] Handles errors consistently
  - [ ] Timeout configured

#### 3.2 Implement sendMessage()
- **ID**: `PLG-008`
- **Status**: `done`
- **Priority**: P0
- **Notes**: 
  - POST /api/v1/messages/send
  - Payload: recipient, recipient_connection_id, message, context, correlation_id
  - Support: idempotency_key, recipient_type, routing_hints
  - Handle response statuses: delivered, pending, rejected
  - Map API errors to meaningful messages
- **Acceptance Criteria**:
  - [ ] Sends message to Mahilo
  - [ ] Parses response correctly
  - [ ] Returns typed result

#### 3.3 Implement getFriends()
- **ID**: `PLG-009`
- **Status**: `done`
- **Priority**: P1
- **Notes**: 
  - GET /api/v1/friends?status=accepted
  - For list_mahilo_contacts tool
  - Consider caching (5-minute TTL)
  - Add getContactConnections() for routing selection
- **Acceptance Criteria**:
  - [ ] Fetches friends list
  - [ ] Returns typed array
  - [ ] Handles empty list

#### 3.4 Implement registerAgent()
- **ID**: `PLG-010`
- **Status**: `done`
- **Priority**: P0
- **Notes**: 
  - POST /api/v1/agents
  - Triggered on gateway_start if auto_register=true
  - Payload: framework="clawdbot", callback_url, label, description, capabilities
  - Registry requires public_key + public_key_alg; generate/persist an ed25519 keypair in state
  - Store callback_secret for verification (in memory; persistence is future work)
- **Acceptance Criteria**:
  - [ ] Registers agent with Mahilo
  - [ ] Includes connection label/capabilities
  - [ ] Stores callback_secret
  - [ ] Handles already-registered case

#### 3.5 Callback URL Detection
- **ID**: `PLG-011`
- **Status**: `done`
- **Priority**: P0
- **Notes**: 
  - Allow manual override via config
  - Default to localhost for development and warn
  - Public URL auto-detection is future work
- **Acceptance Criteria**:
  - [ ] Uses config override when set
  - [ ] Works in dev (localhost)

---

### 4. Tools Implementation

#### 4.1 Implement talk_to_agent Tool
- **ID**: `PLG-012`
- **Status**: `done`
- **Priority**: P0
- **Notes**: 
  - Parameters: recipient, message, context
  - Steps:
    1. Input validation
    2. Resolve recipient connections + select target
    3. Local policy check
    4. Call mahiloClient.sendMessage() with recipient_connection_id
    5. Format result for agent
  - Handle all error cases gracefully
- **Acceptance Criteria**:
  - [ ] Tool callable by agent
  - [ ] Validates inputs
  - [ ] Selects recipient connection (label/tags)
  - [ ] Applies local policies
  - [ ] Returns clear messages

#### 4.2 Tool Response Formatting
- **ID**: `PLG-013`
- **Status**: `done`
- **Priority**: P0
- **Notes**: 
  - Success: "Message sent to X. They will process and may respond later."
  - Rejected: "Message rejected: [reason]"
  - Error: "Failed to send: [specific error]"
  - Include actionable guidance
- **Acceptance Criteria**:
  - [ ] Clear success messages
  - [ ] Helpful error messages
  - [ ] Actionable guidance

#### 4.3 Implement list_mahilo_contacts Tool (Optional)
- **ID**: `PLG-014`
- **Status**: `done`
- **Priority**: P2
- **Notes**: 
  - Lists friends (and groups in Phase 2)
  - Helps agent know who it can contact
  - Consider making this automatic in system prompt
- **Acceptance Criteria**:
  - [ ] Lists friends with usernames
  - [ ] Clear formatting

#### 4.4 Implement talk_to_group Tool (Optional)
- **ID**: `PLG-038`
- **Status**: `done`
- **Priority**: P2
- **Notes**:
  - Parameters: group_id, message, context
  - Use recipient_type: "group"
  - Apply local policies before sending
  - Handle group errors (GROUP_NOT_FOUND, NOT_GROUP_MEMBER)
- **Acceptance Criteria**:
  - [ ] Tool callable by agent
  - [ ] Validates inputs
  - [ ] Applies local policies
  - [ ] Returns clear messages

#### 4.5 Tool Registration with Clawdbot
- **ID**: `PLG-015`
- **Status**: `done`
- **Priority**: P0
- **Notes**: 
  - Register tools via plugin SDK
  - Ensure tools appear in agent's available tools
  - Test tool invocation works
- **Acceptance Criteria**:
  - [ ] Tools registered on load
  - [ ] Agent can call tools
  - [ ] Tools appear in tool list

---

### 5. Webhook Handler

#### 5.1 Signature Verification Implementation
- **ID**: `PLG-016`
- **Status**: `done`
- **Priority**: P0
- **Notes**: 
  - HMAC-SHA256 signature verification
  - Format: X-Mahilo-Signature: sha256=<hex>
  - Signed payload: `${timestamp}.${body}`
  - Use raw request body bytes (not JSON.stringify)
  - Timing-safe comparison
  - Timestamp validation (±5 minutes)
- **Acceptance Criteria**:
  - [ ] Verifies valid signatures
  - [ ] Rejects invalid signatures
  - [ ] Rejects old timestamps
  - [ ] Uses timing-safe comparison

#### 5.2 Webhook Route Registration
- **ID**: `PLG-017`
- **Status**: `done`
- **Priority**: P0
- **Notes**: 
  - Register /mahilo/incoming via api.registerHttpRoute (path-only)
  - Enforce HTTP method inside handler if needed
  - Handle route already exists (plugin reload)
- **Acceptance Criteria**:
  - [ ] Route registered on gateway
  - [ ] Accessible from external
  - [ ] Handles reload gracefully

#### 5.3 Incoming Message Handler
- **ID**: `PLG-018`
- **Status**: `done`
- **Priority**: P0
- **Notes**: 
  - Steps:
    1. Verify signature
    2. Validate body schema
    3. De-dupe by message_id
    4. Apply inbound policies (optional)
    5. Send immediate 200 response
    6. Trigger agent run async (Phase 1 logs only)
  - Must not block on agent processing
- **Acceptance Criteria**:
  - [ ] Verifies signature
  - [ ] De-dupes by message_id
  - [ ] Applies inbound policies
  - [ ] Responds immediately
  - [ ] Triggers async processing

#### 5.4 Incoming Message Body Parsing
- **ID**: `PLG-019`
- **Status**: `done`
- **Priority**: P0
- **Notes**: 
  - Expected body:
    ```
    {
      message_id: string
      correlation_id?: string
      recipient_connection_id?: string
      sender: string
      sender_agent: string
      message: string
      context?: string
      timestamp: string
    }
    ```
  - Validate all required fields
- **Acceptance Criteria**:
  - [ ] Parses valid bodies
  - [ ] Rejects invalid bodies with 400
  - [ ] Types are correct

---

### 6. Agent Run Triggering

#### 6.1 Format Incoming Message for Agent
- **ID**: `PLG-020`
- **Status**: `done`
- **Priority**: P0
- **Notes**: 
  - Format message clearly for agent:
    ```
    📬 Message from bob (via Mahilo):
    
    [message content]
    
    [Context: ...]
    
    ---
    To reply, use talk_to_agent with recipient "bob".
    ```
- **Acceptance Criteria**:
  - [ ] Clear formatting
  - [ ] Includes sender info
  - [ ] Includes reply instructions

#### 6.2 Integrate with Clawdbot Agent Runner
- **ID**: `PLG-021`
- **Status**: `done`
- **Priority**: P0
- **Notes**:
  - Uses `callGateway({ method: "agent", ... })` to trigger actual agent runs
  - Set deliver: false (don't auto-send to channels)
  - Pass metadata (mahilo_message_id, etc.)
  - Non-blocking (uses setImmediate after webhook response)
  - Supports configurable inbound_session_key and inbound_agent_id
- **Acceptance Criteria**:
  - [x] Triggers actual agent run via callGateway
  - [x] Doesn't block webhook
  - [x] Agent processes and can respond via talk_to_agent

#### 6.3 Handle Agent Run Errors
- **ID**: `PLG-022`
- **Status**: `done`
- **Priority**: P1
- **Notes**: 
  - Log errors (don't crash)
  - Consider notifying user/admin
  - Don't affect webhook response (already sent)
- **Acceptance Criteria**:
  - [ ] Errors logged
  - [ ] Webhook unaffected
  - [ ] Doesn't crash gateway

---

### 7. Local Policy Filter

#### 7.1 Implement Basic Policy Checks
- **ID**: `PLG-023`
- **Status**: `done`
- **Priority**: P0
- **Notes**: 
  - Checks before sending and for inbound payloads:
    - maxMessageLength
    - minMessageLength
    - blockedKeywords (case-insensitive)
    - blockedPatterns (regex)
  - Fast, synchronous
- **Acceptance Criteria**:
  - [ ] Length checks work
  - [ ] Keyword blocking works
  - [ ] Pattern blocking works

#### 7.2 Policy Configuration
- **ID**: `PLG-024`
- **Status**: `done`
- **Priority**: P1
- **Notes**: 
  - Load policy rules from plugin config
  - Merge with registry-stored policies (cached)
  - Default rules (sensible defaults)
  - Example:
    ```
    local_policies: {
      maxMessageLength: 4000,
      blockedKeywords: ["password", "ssn"]
    }
    ```
- **Acceptance Criteria**:
  - [ ] Config loading works
  - [ ] Defaults applied
  - [ ] Custom rules work

#### 7.3 Policy Violation Feedback
- **ID**: `PLG-025`
- **Status**: `done`
- **Priority**: P0
- **Notes**: 
  - Return clear reason to agent
  - Don't expose sensitive info about rules
  - Example: "Message blocked: contains sensitive keyword"
- **Acceptance Criteria**:
  - [ ] Clear rejection messages
  - [ ] Doesn't leak rule details

---

### 8. Plugin Lifecycle

#### 8.1 Plugin Register Implementation
- **ID**: `PLG-026`
- **Status**: `done`
- **Priority**: P0
- **Notes**: 
  - Executed inside plugin register(api)
  - Steps:
    1. Load and validate config
    2. Initialize Mahilo client
    3. Register webhook route
    4. Register tools
    5. Register gateway_start hook for auto_register
- **Acceptance Criteria**:
  - [ ] All initialization complete
  - [ ] Errors handled gracefully
  - [ ] Plugin usable after load

#### 8.2 Shutdown Hook Implementation
- **ID**: `PLG-027`
- **Status**: `done`
- **Priority**: P1
- **Notes**: 
  - Use `api.on("gateway_stop")` for cleanup
  - Cleanup:
    - Stop dedupe cleanup timer
    - Close any connections
    - Clear caches
- **Acceptance Criteria**:
  - [ ] Clean shutdown
  - [ ] No resource leaks

#### 8.3 Graceful Degradation
- **ID**: `PLG-028`
- **Status**: `done`
- **Priority**: P1
- **Notes**: 
  - Handle Mahilo registry unavailable
  - Handle network errors
  - Tools should return helpful errors, not crash
  - Log warnings for connectivity issues
- **Acceptance Criteria**:
  - [ ] Plugin loads even if Mahilo down
  - [ ] Tools fail gracefully
  - [ ] Warnings logged

---

### 9. Testing

#### 9.1 Unit Tests: Mahilo Client
- **ID**: `PLG-029`
- **Status**: `done`
- **Priority**: P0
- **Notes**: 
  - Mock HTTP responses
  - Test: sendMessage, getFriends, registerAgent
  - Test: getContactConnections, routing selection
  - Test error handling
- **Acceptance Criteria**:
  - [ ] All client methods tested
  - [ ] Error cases covered

#### 9.2 Unit Tests: Signature Verification
- **ID**: `PLG-030`
- **Status**: `done`
- **Priority**: P0
- **Notes**: 
  - Test valid signatures
  - Test invalid signatures
  - Test expired timestamps
  - Test raw-body signature verification
  - Test timing-safe comparison
- **Acceptance Criteria**:
  - [ ] All verification paths tested
  - [ ] Security edge cases covered

#### 9.3 Unit Tests: Local Policies
- **ID**: `PLG-031`
- **Status**: `done`
- **Priority**: P0
- **Notes**: 
  - Test each policy type
  - Test combinations
  - Test edge cases (empty message, etc.)
  - Test inbound policy application
- **Acceptance Criteria**:
  - [ ] All policy types tested
  - [ ] Edge cases covered

#### 9.4 Unit Tests: Tools
- **ID**: `PLG-032`
- **Status**: `done`
- **Priority**: P0
- **Notes**: 
  - Test talk_to_agent with mock client
  - Test all result types
  - Test error handling
  - Test routing selection + idempotency key handling
- **Acceptance Criteria**:
  - [ ] Tool execution tested
  - [ ] All response types tested

#### 9.5 Integration Tests: Webhook Handler
- **ID**: `PLG-033`
- **Status**: `done`
- **Priority**: P0
- **Notes**: 
  - Test with valid signature
  - Test with invalid signature
  - Test agent trigger logging
  - Use test server
  - Test de-dupe and inbound policy path
- **Acceptance Criteria**:
  - [ ] Full webhook flow tested
  - [ ] Agent trigger invoked

#### 9.6 E2E Test: Full Message Exchange
- **ID**: `PLG-034`
- **Status**: `done`
- **Priority**: P0
- **Notes**:
  - Requires running Mahilo Registry
  - Two Clawdbot instances
  - Send message, verify receipt, verify response
  - Full message flow verified in Session 7 (2026-01-28)
- **Acceptance Criteria**:
  - [x] Full roundtrip works
  - [x] Both instances receive messages

---

### 10. Documentation

#### 10.1 Plugin README
- **ID**: `PLG-035`
- **Status**: `done`
- **Priority**: P0
- **Notes**: 
  - Installation instructions
  - Configuration guide
  - Usage examples
  - Troubleshooting
- **Acceptance Criteria**:
  - [ ] Clear installation steps
  - [ ] Config explained
  - [ ] Examples provided

#### 10.2 Tool Documentation
- **ID**: `PLG-036`
- **Status**: `done`
- **Priority**: P1
- **Notes**: 
  - Document each tool
  - Parameters explained
  - Example outputs
  - Error handling
- **Acceptance Criteria**:
  - [ ] Each tool documented
  - [ ] Examples for each

#### 10.3 Agent Instructions Template
- **ID**: `PLG-037`
- **Status**: `done`
- **Priority**: P1
- **Notes**: 
  - Template for SOUL.md additions
  - How to use Mahilo tools
  - When to contact other agents
  - Privacy considerations
- **Acceptance Criteria**:
  - [ ] Template provided
  - [ ] Guidance on usage

---

## Phase 2 - Secure Messaging + Registry Integration

### 11. Secure Messaging (E2E + Sender Verification)

#### 11.1 Define Encrypted Payload Schema + Versioning
- **ID**: `PLG-039`
- **Status**: `blocked`
- **Priority**: P0
- **Notes**:
  - Align with Mahilo registry encrypted payload spec (cipher suite, key agreement, metadata fields).
  - Define envelope versioning for backward compatibility.
  - Document which fields remain plaintext (routing hints, recipient id).
- **Acceptance Criteria**:
  - [ ] Payload schema documented with field definitions
  - [ ] Envelope versioning defined
  - [ ] Plaintext vs encrypted field rules are explicit

#### 11.2 Key Management + Discovery
- **ID**: `PLG-040`
- **Status**: `blocked`
- **Priority**: P0
- **Notes**:
  - Persist local private key(s) in plugin state (reuse ed25519 keypair or migrate as required).
  - Fetch recipient public keys from registry with caching + TTL.
  - Define key rotation and invalid-key handling.
- **Acceptance Criteria**:
  - [ ] Local key storage + retrieval implemented
  - [ ] Recipient key lookup with cache + TTL
  - [ ] Rotation or invalid key handling defined

#### 11.3 Outbound Encryption + Signing
- **ID**: `PLG-041`
- **Status**: `blocked`
- **Priority**: P0
- **Notes**:
  - Encrypt message + context for recipient.
  - Attach sender signature for authenticity.
  - Allow plaintext fallback only when config permits.
- **Acceptance Criteria**:
  - [ ] Outbound payloads encrypted when enabled
  - [ ] Sender signature attached and verifiable
  - [ ] Clear error when strict encryption is required

#### 11.4 Inbound Decryption + Sender Verification
- **ID**: `PLG-042`
- **Status**: `blocked`
- **Priority**: P0
- **Notes**:
  - Verify sender signature using registry-provided public key.
  - Decrypt before policy checks and formatting.
  - Handle decryption failures without crashing the gateway.
- **Acceptance Criteria**:
  - [ ] Encrypted payloads decrypted and verified
  - [ ] Policies run on decrypted plaintext
  - [ ] Failure paths logged safely

#### 11.5 Encryption Config + Capability Negotiation
- **ID**: `PLG-043`
- **Status**: `done`
- **Priority**: P1
- **Notes**:
  - Add config options: encryption_mode (off/opportunistic/required), allow_plaintext_fallback.
  - Advertise encryption capability during registration.
  - Update tool behavior based on mode.
- **Acceptance Criteria**:
  - [ ] Config schema updated with encryption settings
  - [ ] Registration advertises encryption capability
  - [ ] Tools respect mode + fallback rules

#### 11.6 Encryption Test Coverage
- **ID**: `PLG-044`
- **Status**: `blocked`
- **Priority**: P0
- **Notes**:
  - Unit tests for encrypt/decrypt helpers and signature verification.
  - Integration tests for encrypted webhook flow.
  - Negative tests for bad signatures, wrong keys, and replay.
- **Acceptance Criteria**:
  - [ ] Unit tests cover crypto helpers
  - [ ] Webhook integration tests cover encrypted payloads
  - [ ] Error paths covered

#### 11.7 Encryption Documentation
- **ID**: `PLG-045`
- **Status**: `blocked`
- **Priority**: P1
- **Notes**:
  - Document encryption modes, key requirements, and fallback behavior.
  - Add key rotation guidance + troubleshooting.
- **Acceptance Criteria**:
  - [ ] Docs explain encryption modes
  - [ ] Examples show config + expected behavior

---

### 12. Group Messaging (Registry Phase 2)

> **Note**: Registry already fully supports groups (`recipient_type: "group"`, fan-out delivery).
> Plugin just needs to wire up the client and tools.

#### 12.1 Mahilo Client: Group Endpoints
- **ID**: `PLG-046`
- **Status**: `done`
- **Priority**: P1
- **Notes**:
  - Registry already supports: `GET /api/v1/groups`, `POST /api/v1/messages/send` with `recipient_type: "group"`
  - Add client methods for listGroups, group membership, and sendGroupMessage
  - Normalize group-related error codes
- **Acceptance Criteria**:
  - [x] Client exposes group methods
  - [x] Group errors mapped to typed results

#### 12.2 talk_to_group: Real Group Support
- **ID**: `PLG-047`
- **Status**: `done`
- **Priority**: P1
- **Notes**:
  - Use group ids (not names) per registry guidance
  - The existing talk_to_group tool already uses registry with `recipient_type: "group"`
  - Apply local + registry policies to group payloads
- **Acceptance Criteria**:
  - [x] Group messages send via registry
  - [x] Membership errors handled clearly
  - [x] Policies enforced for group sends

#### 12.3 Webhook: Group Payload Handling
- **ID**: `PLG-048`
- **Status**: `done`
- **Priority**: P1
- **Notes**:
  - Parse group_id/group_name metadata in inbound payloads
  - Format agent message with group context
- **Acceptance Criteria**:
  - [x] Group fields parsed and validated
  - [x] Formatted message includes group context

#### 12.4 list_mahilo_contacts: Include Groups
- **ID**: `PLG-049`
- **Status**: `done`
- **Priority**: P2
- **Notes**:
  - Add option to include groups alongside friends
  - Keep output readable (separate users vs groups)
- **Acceptance Criteria**:
  - [x] Groups listed with ids + names
  - [x] Output remains readable

#### 12.5 Group Messaging Tests
- **ID**: `PLG-050`
- **Status**: `done`
- **Priority**: P1
- **Notes**:
  - Tests for talk_to_group success + error cases
  - Webhook tests for inbound group message formatting
- **Acceptance Criteria**:
  - [x] Tool tests cover group flows
  - [x] Webhook tests cover group payloads

#### 12.6 Group Messaging Docs
- **ID**: `PLG-051`
- **Status**: `done`
- **Priority**: P2
- **Notes**:
  - Document group setup, ids, and limitations
  - Update examples and troubleshooting
- **Acceptance Criteria**:
  - [x] Docs include group setup + usage
  - [x] Limitations documented

---

### 13. LLM-Based Policy Enforcement

> **Architecture**: Policies are managed on the Mahilo Registry (via dashboard/API).
> Plugin fetches policies and runs LLM evaluation locally (keeps message content private).

#### 13.1 Fetch LLM Policies from Registry
- **ID**: `PLG-067`
- **Status**: `done`
- **Priority**: P0
- **Notes**:
  - Registry already supports LLM policies: `POST /api/v1/policies` with `policy_type: "llm"`
  - Plugin needs to fetch: `GET /api/v1/policies` (filter by policy_type=llm)
  - Cache policies with TTL (e.g., 5 minutes)
  - Fetch applicable policies for sender/recipient/group
- **Acceptance Criteria**:
  - [x] Client method to fetch LLM policies
  - [x] Caching with configurable TTL
  - [x] Handle registry unavailable gracefully

#### 13.2 LLM Policy Evaluation Engine
- **ID**: `PLG-068`
- **Status**: `done`
- **Priority**: P0
- **Notes**:
  - Evaluate message against LLM policy prompt
  - Call format: `policy_content` (prompt) + message → allow/block
  - Use configurable model (default to fast/cheap model like haiku)
  - Evaluate both outbound and inbound messages
  - Return clear allow/block decision with optional reason
- **Acceptance Criteria**:
  - [x] LLM evaluator implemented
  - [x] Configurable model selection
  - [x] Works for outbound and inbound messages
  - [x] Handles LLM errors gracefully (fail-open or fail-closed configurable)

#### 13.3 LLM Policy Integration with Message Flow
- **ID**: `PLG-069`
- **Status**: `done`
- **Priority**: P1
- **Notes**:
  - Integrate into talk_to_agent and talk_to_group tools
  - Integrate into inbound webhook handler
  - Run after static policies (cheaper to filter obvious stuff first)
  - Clear rejection messages that don't leak policy details
  - Evaluation order: sender global → per-recipient → group policies
- **Acceptance Criteria**:
  - [x] Tools check LLM policies before sending
  - [x] Webhook checks LLM policies on inbound
  - [x] Rejection messages are helpful but not revealing
  - [x] Respects policy priority ordering

#### 13.4 LLM Policy Tests
- **ID**: `PLG-070`
- **Status**: `done`
- **Priority**: P1
- **Notes**:
  - Unit tests with mocked LLM responses
  - Test policy fetching and caching
  - Test evaluation ordering (global → user → group)
  - Test rejection message formatting
- **Acceptance Criteria**:
  - [x] Policy fetch and cache tested
  - [x] Evaluation logic tested with mocks
  - [x] Integration with tools/webhook tested

---

### 14. Registry Policy Sync

> **Note**: Registry already has full policy CRUD (`GET/POST/PATCH/DELETE /api/v1/policies`).
> Plugin just needs to fetch and merge with local policies.

#### 14.1 Mahilo Client: Policies API
- **ID**: `PLG-052`
- **Status**: `done`
- **Priority**: P1
- **Notes**:
  - Registry already supports: `GET /api/v1/policies?scope=global|user|group`
  - Add client methods to fetch heuristic + LLM policies
  - Add caching with TTL (5 min) and safe fallback
- **Acceptance Criteria**:
  - [x] Policies fetched + cached
  - [x] Client errors handled gracefully

#### 14.2 Policy Merge + Precedence
- **ID**: `PLG-053`
- **Status**: `done`
- **Priority**: P1
- **Notes**:
  - Merge local policies with registry policies
  - Precedence: local policies first, then registry policies
  - For heuristic: merge rules (e.g., take stricter maxLength)
  - For LLM: evaluate all in priority order
- **Acceptance Criteria**:
  - [x] Merge rules defined and documented
  - [x] Inbound/outbound enforcement uses merged policies

#### 14.3 Policy Config Controls
- **ID**: `PLG-054`
- **Status**: `done`
- **Priority**: P1
- **Notes**:
  - Add config option: `policy_source: "local" | "registry" | "merged"`
  - Default to "merged" for full functionality
- **Acceptance Criteria**:
  - [x] Config schema updated
  - [x] Behavior matches selected mode

#### 14.4 Policy Sync Tests
- **ID**: `PLG-055`
- **Status**: `done`
- **Priority**: P1
- **Notes**:
  - Tests for caching, TTL, and precedence rules
  - Tests for registry unavailable (fallback to local)
- **Acceptance Criteria**:
  - [x] Policy cache and merge tested
  - [x] Error cases covered

#### 14.5 Policy Sync Docs
- **ID**: `PLG-056`
- **Status**: `done`
- **Priority**: P2
- **Notes**:
  - Document policy sources and precedence
  - Provide example configs
- **Acceptance Criteria**:
  - [x] Docs cover policy sync options
  - [x] Example configs included

---

### 15. Trusted Routing (Optional)

> **Note**: Registry already does routing by default when `recipient_connection_id` is not provided.
> It picks the highest-priority connection and supports `routing_hints` (labels, tags).
> This section is about adding explicit config controls in the plugin.

#### 15.1 Trusted Routing Config + Guardrails
- **ID**: `PLG-057`
- **Status**: `pending`
- **Priority**: P2
- **Notes**:
  - Currently plugin always fetches connections and picks locally
  - Add config to let registry do the routing (simpler, but registry sees routing decision)
  - Block trusted routing when encryption is required (E2E needs sender to know recipient key)
  - Log privacy warnings when enabled
- **Acceptance Criteria**:
  - [ ] Config flag present with warnings
  - [ ] Guardrails enforced when encryption required

#### 15.2 Registry-Selected Connection Flow
- **ID**: `PLG-058`
- **Status**: `pending`
- **Priority**: P2
- **Notes**:
  - When enabled, skip local connection fetch
  - Just pass recipient username + routing_hints to registry
  - Registry picks best connection based on priority/hints
- **Acceptance Criteria**:
  - [ ] Registry can select connection when enabled
  - [ ] Sender-side routing remains default when disabled

#### 15.3 Trusted Routing Tests + Docs
- **ID**: `PLG-059`
- **Status**: `pending`
- **Priority**: P2
- **Notes**:
  - Tests for trusted routing toggle + fallback
  - Docs explaining privacy trade-offs
- **Acceptance Criteria**:
  - [ ] Tests cover trusted routing on/off
  - [ ] Docs updated with privacy guidance

---

### 16. Agent Runner Integration

#### 15.1 SDK Agent Runner Hook
- **ID**: `PLG-060`
- **Status**: `done`
- **Priority**: P0
- **Notes**:
  - Implemented using `callGateway({ method: "agent", ... })` - same pattern as sessions_send tool.
  - No core modifications needed - uses existing gateway infrastructure.
  - Preserve non-blocking webhook behavior via setImmediate.
- **Acceptance Criteria**:
  - [x] Inbound messages trigger actual agent runs
  - [x] Webhook remains non-blocking

#### 15.2 Inbound Routing Config
- **ID**: `PLG-061`
- **Status**: `done`
- **Priority**: P1
- **Notes**:
  - Added `inbound_session_key` (default: "main") and `inbound_agent_id` to config.
  - Configurable target session for inbound messages.
- **Acceptance Criteria**:
  - [x] Config schema supports inbound target selection
  - [x] Messages route to expected session

#### 15.3 Agent Runner Tests
- **ID**: `PLG-062`
- **Status**: `done`
- **Priority**: P1
- **Notes**:
  - 13 unit tests for formatting and config integration.
  - E2E test verifies full flow (requires working registry).
- **Acceptance Criteria**:
  - [x] Agent run path covered by tests
  - [x] Failure cases handled

---

### 17. Operational Hardening

#### 17.1 Callback URL Auto-Detection
- **ID**: `PLG-063`
- **Status**: `done`
- **Priority**: P1
- **Notes**:
  - Detect public gateway URL (not localhost) when available.
  - Validate scheme/host and warn on unsafe values.
- **Acceptance Criteria**:
  - [x] Auto-detection uses gateway/runtime config
  - [x] Validation + warnings in logs

#### 17.2 Persist callback_secret
- **ID**: `PLG-064`
- **Status**: `done`
- **Priority**: P1
- **Notes**:
  - Store callback_secret in plugin state storage.
  - Reuse on startup to avoid re-register unless missing.
- **Acceptance Criteria**:
  - [x] callback_secret persisted and loaded
  - [x] Re-register only when missing or invalid

#### 17.3 Callback Secret Rotation + Recovery
- **ID**: `PLG-065`
- **Status**: `pending`
- **Priority**: P2
- **Notes**:
  - Registry already supports: `POST /api/v1/agents` with `rotate_secret: true`
  - Add CLI command or config flag to trigger rotation
  - Update local state with new secret
- **Acceptance Criteria**:
  - [ ] Rotation updates registry + local state
  - [ ] Recovery path documented

#### 17.4 Callback Secret Tests
- **ID**: `PLG-066`
- **Status**: `pending`
- **Priority**: P2
- **Notes**:
  - Tests for persistence, reload, and rotation
- **Acceptance Criteria**:
  - [ ] Persistence tests cover restart scenarios
  - [ ] Rotation tests cover re-register fallback

---

## Summary

### Phase 1 - Core Integration

| Priority | Total | Pending | Blocked | In Progress | Done |
|----------|-------|---------|---------|-------------|------|
| P0       | 29    | 0       | 0       | 0           | 29   |
| P1       | 7     | 0       | 0       | 0           | 7    |
| P2       | 2     | 0       | 0       | 0           | 2    |
| **Total**| 38    | 0       | 0       | 0           | 38   |

### Phase 2 - Secure Messaging + Registry Integration

| Priority | Total | Pending | Blocked | In Progress | Done |
|----------|-------|---------|---------|-------------|------|
| P0       | 8     | 0       | 5       | 0           | 3    |
| P1       | 16    | 0       | 0       | 0           | 16   |
| P2       | 8     | 5       | 0       | 0           | 3    |
| **Total**| 32    | 5       | 5       | 0           | 22   |

**High Priority (P0 Pending)**:
- All P0 tasks complete (except blocked encryption tasks)

**Completed (this session)**:
- PLG-052-056: Registry Policy Sync (all 5 tasks done)

**Pending (registry already supports these)**:
- PLG-057-059: Trusted Routing (registry does routing by default)
- PLG-065-066: Callback Secret Rotation (registry has `rotate_secret`)

**Blocked (waiting on registry features)**:
- PLG-039-042, PLG-044-045: E2E Encryption (needs encryption spec)

---

## Dependencies

### Internal Dependencies

```
PLG-001 (Directory Structure)
    └── PLG-002 (Manifest)
    └── PLG-003 (package.json)
    └── PLG-004 (Entry Point)
            │
            ├── PLG-005, PLG-006 (Config)
            │
            ├── PLG-007 to PLG-011 (Mahilo Client)
            │       │
            │       └── PLG-012 to PLG-015 (Tools)
            │
            ├── PLG-016 to PLG-019 (Webhook)
            │       │
            │       └── PLG-020 to PLG-022 (Agent Triggering)
            │
            ├── PLG-023 to PLG-025 (Local Policies)
            │
            └── PLG-026 to PLG-028 (Lifecycle)
```

### External Dependencies

Phase 1:
- PLG-008 (sendMessage) depends on the registry send message endpoint
- PLG-009 (getFriends) depends on the registry friends endpoint
- PLG-010 (registerAgent) depends on the registry agents endpoint
- PLG-034 (E2E Test) depends on a running registry

Phase 2:
- PLG-039 to PLG-045: E2E encryption - **BLOCKED** waiting on registry encryption spec
- PLG-046 to PLG-051: Group messaging - **DONE** (client, tools, webhook, tests, docs)
- PLG-052 to PLG-056: Policy sync - **DONE** (client, merge, config, tests, docs)
- PLG-057 to PLG-059: Trusted routing - **PENDING** (registry already does routing by default!)
- PLG-060 to PLG-062: Agent runner - **DONE** (uses callGateway)
- PLG-065 to PLG-066: Secret rotation - **PENDING** (registry supports `rotate_secret: true`!)
- PLG-067 to PLG-070: LLM policies - **DONE** (fetch, evaluate, integrate into tools/webhook)

---

## Notes

### Integration Points with Clawdbot

1. **Plugin SDK**: Use existing plugin infrastructure for registration
2. **Route Registration**: Use `api.registerHttpRoute` and Node req/res handling
3. **Tool Registration**: Follow existing tool patterns (TypeBox + `execute(_id, params)`)
4. **Agent Triggering**: Uses `callGateway({ method: "agent", ... })` to trigger actual agent runs
5. **Config System**: Use Clawdbot's config loading

### Files to Reference

- `extensions/discord/` - Similar plugin structure
- `extensions/llm-task/` - Tool implementation patterns
- `src/gateway/server/plugins-http.ts` - Route registration behavior
- `src/plugins/types.ts` - Plugin API surface
