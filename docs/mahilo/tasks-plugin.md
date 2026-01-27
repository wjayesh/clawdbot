# Clawdbot Mahilo Plugin: Phase 1 Tasks

> **Project**: Clawdbot Mahilo Plugin (Extension)  
> **Phase**: 1 - Core Integration  
> **Goal**: Enable Clawdbot to send/receive messages via Mahilo network

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
  - `clawdbot.plugin.json` with:
    - name, version, description
    - tools definitions
    - config schema
    - routes for webhook
    - hooks (onLoad, onUnload)
- **Acceptance Criteria**:
  - [ ] Valid plugin manifest
  - [ ] Config schema for API key, URL, etc.

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
  - `index.ts` exports:
    - tools
    - webhook handler
    - onLoad hook (registration)
    - onUnload hook (cleanup)
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
  - Optional: mahilo_api_url, callback_path, auto_register, local_policies
  - Add: connection_label, connection_description, connection_capabilities
  - Add: message_privacy_mode (e2e or trusted), inbound_policies
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
  - Support: payload_type, encryption metadata, sender_signature, idempotency_key
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
  - For list_contacts tool
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
  - Called on plugin load if auto_register=true
  - Payload: framework="clawdbot", callback_url, label, description, capabilities, public_key, public_key_alg
  - Generate/store keypair locally for E2E
  - Store callback_secret for verification
- **Acceptance Criteria**:
  - [ ] Registers agent with Mahilo
  - [ ] Includes connection label/capabilities and public key
  - [ ] Stores callback_secret
  - [ ] Handles already-registered case

#### 3.5 Callback URL Detection
- **ID**: `PLG-011`
- **Status**: `done`
- **Priority**: P0
- **Notes**: 
  - Auto-detect public URL for callback
  - Use gateway's public URL if available
  - Allow manual override via config
  - Handle localhost for development
- **Acceptance Criteria**:
  - [ ] Detects public URL
  - [ ] Falls back to config override
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
    4. Encrypt + sign payload (E2E mode)
    5. Call mahiloClient.sendMessage() with recipient_connection_id
    6. Format result for agent
  - Handle all error cases gracefully
- **Acceptance Criteria**:
  - [ ] Tool callable by agent
  - [ ] Validates inputs
  - [ ] Selects recipient connection (label/tags)
  - [ ] Applies local policies
  - [ ] Encrypts payload in E2E mode
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

#### 4.3 Implement list_contacts Tool (Optional)
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

#### 4.4 Tool Registration with Clawdbot
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
  - Register POST /mahilo/incoming on gateway
  - Use plugin route registration API
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
    4. Verify sender signature + decrypt payload (E2E mode)
    5. Send immediate 200 response
    6. Trigger agent run async
  - Must not block on agent processing
- **Acceptance Criteria**:
  - [ ] Verifies signature
  - [ ] De-dupes by message_id
  - [ ] Verifies sender signature + decrypts payload
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
      payload_type?: string
      encryption?: object
      sender_signature?: object
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
  - Phase 1: Logs messages for processing (infrastructure exposes cron API to plugins in future)
  - Use isolated-agent/cron infrastructure (requires plugin SDK enhancement)
  - Set deliver: false (don't auto-send to channels)
  - Pass metadata (mahilo_message_id, etc.)
  - Non-blocking (use setImmediate/nextTick)
- **Acceptance Criteria**:
  - [ ] Triggers agent run
  - [ ] Agent receives message
  - [ ] Doesn't block webhook

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

#### 8.1 onLoad Hook Implementation
- **ID**: `PLG-026`
- **Status**: `done`
- **Priority**: P0
- **Notes**: 
  - Called when plugin loads
  - Steps:
    1. Load and validate config
    2. Initialize Mahilo client
    3. Register agent with Mahilo (if auto_register)
    4. Register webhook route
    5. Register tools
- **Acceptance Criteria**:
  - [ ] All initialization complete
  - [ ] Errors handled gracefully
  - [ ] Plugin usable after load

#### 8.2 onUnload Hook Implementation
- **ID**: `PLG-027`
- **Status**: `done`
- **Priority**: P1
- **Notes**: 
  - Called when plugin unloads
  - Cleanup:
    - Unregister webhook route (if possible)
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
  - Test routing selection + encryption metadata
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
  - Test agent triggering
  - Use test server
  - Test de-dupe and decryption path
- **Acceptance Criteria**:
  - [ ] Full webhook flow tested
  - [ ] Agent run triggered

#### 9.6 E2E Test: Full Message Exchange
- **ID**: `PLG-034`
- **Status**: `pending`
- **Priority**: P0
- **Blocked By**: Mahilo Registry ready
- **Notes**: 
  - Requires running Mahilo Registry
  - Two Clawdbot instances
  - Send message, verify receipt, verify response
- **Acceptance Criteria**:
  - [ ] Full roundtrip works
  - [ ] Both instances receive messages

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

## Summary

| Priority | Total | Pending | In Progress | Done |
|----------|-------|---------|-------------|------|
| P0       | 27    | 1       | 0           | 26   |
| P1       | 8     | 0       | 0           | 8    |
| P2       | 2     | 1       | 0           | 1    |
| **Total**| 37    | 2       | 0           | 35   |

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

| Task | Depends On |
|------|------------|
| PLG-010 (registerAgent) | REG-013 (Register Agent Endpoint) |
| PLG-008 (sendMessage) | REG-021 (Send Message Endpoint) |
| PLG-009 (getFriends) | REG-019 (List Friends Endpoint) |
| PLG-034 (E2E Test) | Full Mahilo Registry |

---

## Notes

### Integration Points with Clawdbot

1. **Plugin SDK**: Use existing plugin infrastructure for registration
2. **Route Registration**: Hook into gateway's route system
3. **Tool Registration**: Follow existing tool patterns
4. **Agent Triggering**: Use isolated-agent/cron infrastructure
5. **Config System**: Use Clawdbot's config loading

### Files to Reference

- `extensions/discord/` - Similar plugin structure
- `src/cron/isolated-agent/run.ts` - Agent triggering
- `src/gateway/` - Route registration patterns
- `src/tools/` - Tool implementation patterns
