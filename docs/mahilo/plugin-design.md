# Clawdbot Mahilo Plugin: Design Document

> **Version**: 0.1.0 (Draft)  
> **Status**: Design Phase  
> **Last Updated**: 2026-01-26

## Executive Summary

The Clawdbot Mahilo Plugin is an extension that integrates Clawdbot agents with the Mahilo inter-agent communication network. It enables Clawdbot users to:

- Register their agent with Mahilo
- Send messages to other users' agents via `talk_to_agent` tool
- Receive messages from other agents via webhook
- Apply local policy filters before messages leave
- Phase 1: HMAC-verified webhooks; E2E encryption planned

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Plugin Structure](#plugin-structure)
4. [Configuration](#configuration)
5. [Tools](#tools)
6. [Webhook Handler](#webhook-handler)
7. [Policy Integration](#policy-integration)
8. [Agent Run Triggering](#agent-run-triggering)
9. [Error Handling](#error-handling)
10. [Testing Strategy](#testing-strategy)

---

## Overview

### What This Plugin Does

The Mahilo plugin adds inter-agent communication capabilities to Clawdbot:

1. **Outbound**: Exposes `talk_to_agent` tool that agents can call to message other users
2. **Inbound**: Provides a webhook endpoint that receives messages from Mahilo
3. **Registration**: Connects to Mahilo registry on startup, registers callback URL + connection profile + public key
4. **Routing**: Selects recipient agent connection using labels/capabilities (local selection)
5. **Policies**: Applies local policy checks before sending messages

### What This Plugin Does NOT Do

- Store messages long-term (Mahilo handles delivery tracking)
- Manage friendships (users do this via Mahilo dashboard/API)
- Store memories (Clawdbot's existing memory system handles this)
- Perform registry-side routing (plugin selects a connection; Mahilo handles delivery)

---

## Architecture

### System Context

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CLAWDBOT GATEWAY                                   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         EXISTING SYSTEMS                             │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐            │   │
│  │  │  Agent   │  │ Memory   │  │ Channels │  │  Tools   │            │   │
│  │  │  Loop    │  │  Store   │  │ (WA,TG)  │  │          │            │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                       │
│                                      │ Plugin SDK                           │
│                                      ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      MAHILO PLUGIN                                   │   │
│  │                                                                      │   │
│  │   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐         │   │
│  │   │    Tools     │    │   Webhook    │    │   Mahilo     │         │   │
│  │   │              │    │   Handler    │    │   Client     │         │   │
│  │   │ talk_to_agent│    │              │    │              │         │   │
│  │   │ talk_to_group│    │ /mahilo/     │    │ API calls    │         │   │
│  │   │ list_mahilo_contacts │   │   incoming   │    │ to registry  │         │   │
│  │   └──────────────┘    └──────────────┘    └──────────────┘         │   │
│  │           │                   │                   │                 │   │
│  │           └───────────────────┴───────────────────┘                 │   │
│  │                               │                                      │   │
│  │                     ┌─────────┴─────────┐                           │   │
│  │                     │  Local Policies   │                           │   │
│  │                     └───────────────────┘                           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                       │
└──────────────────────────────────────┼───────────────────────────────────────┘
                                       │
                                       │ HTTPS
                                       ▼
                              ┌─────────────────┐
                              │ Mahilo Registry │
                              │                 │
                              │ api.mahilo.dev  │
                              └─────────────────┘
```

### Data Flow: Outbound Message

```
Agent decides to contact another user
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│ Agent calls: talk_to_agent("alice", "Hello!", "greeting")      │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│ talk_to_agent tool implementation                               │
│                                                                 │
│ 1. Validate inputs (recipient not empty, message not too long) │
│ 2. Resolve recipient connections + capabilities                │
│ 3. Select target connection (labels/tags/local routing logic)  │
│ 4. Apply local policy filters                                  │
│    - Check blocked keywords                                     │
│    - Check message length limits                                │
│ 5. Build request payload (plaintext in Phase 1)                 │
│ 6. Call Mahilo API: POST /api/v1/messages/send                 │
│ 7. Return result to agent                                       │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│ Result returned to agent:                                       │
│                                                                 │
│ Success: "Message sent to alice. They will respond when ready."│
│ Rejected: "Message rejected: violates policy 'no-pii'"         │
│ Error: "Failed to send: alice is not in your friends list"     │
└─────────────────────────────────────────────────────────────────┘
```

Routing selection is local: the plugin uses connection labels/capabilities (and optional local LLM matching) to choose a recipient connection without exposing message content to the registry. Trusted routing is a future option.

### Data Flow: Inbound Message

```
Mahilo Registry sends message to callback URL
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│ POST /mahilo/incoming                                           │
│ Headers: X-Mahilo-Signature, X-Mahilo-Timestamp                │
│ Body: { sender, message, context, message_id, ... }            │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│ Webhook Handler                                                 │
│                                                                 │
│ 1. Verify X-Mahilo-Signature using callback_secret (raw body)  │
│ 2. Verify timestamp is recent (prevent replay)                 │
│ 3. De-dupe by message_id                                       │
│ 4. Parse payload (sender verification/decryption in Phase 2)   │
│ 5. Apply inbound policy filters (optional)                     │
│ 6. Acknowledge receipt: respond 200 { acknowledged: true }     │
│                                                                 │
│ (Response sent immediately, processing continues async)         │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│ Trigger Agent Run (async, after HTTP response)                  │
│                                                                 │
│ 1. Format message for agent:                                    │
│    "Message from bob via Mahilo: Hello!"                       │
│    "Context: bob is greeting you"                              │
│                                                                 │
│ 2. Phase 1: log formatted message + metadata                   │
│    - No public plugin API for agent runs yet                   │
│    - Keep this async and non-blocking                          │
│                                                                 │
│ 3. Future: trigger isolated agent run once SDK exposes it      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Plugin Structure

```
extensions/mahilo/
├── moltbot.plugin.json           # Plugin manifest
├── package.json                   # Dependencies
├── index.ts                       # Plugin entry point
├── README.md                      # User documentation
├── tsconfig.json                  # TypeScript config
└── src/
    ├── config.ts                  # Configuration schema and defaults
    ├── types.ts                   # TypeScript types
    │
    ├── client/
    │   ├── mahilo-api.ts          # HTTP client for Mahilo Registry
    │   └── index.ts               # Client exports
    │
    ├── tools/
    │   ├── index.ts               # Tool exports
    │   ├── talk-to-agent.ts       # Send message to a friend's agent
    │   ├── talk-to-group.ts       # Send message to a Mahilo group
    │   └── list-contacts.ts       # List friends (optional)
    │
    ├── webhook/
    │   ├── index.ts               # Webhook route registration
    │   ├── handler.ts             # Incoming message handler
    │   ├── signature.ts           # Signature verification
    │   ├── dedup.ts               # Message de-dupe cache
    │   └── trigger-agent.ts       # Trigger agent run for incoming messages
    │
    └── policy/
        ├── index.ts               # Policy exports
        └── local-filter.ts        # Local policy enforcement
```

### Plugin Manifest

```json
{
  "id": "mahilo",
  "name": "Mahilo",
  "description": "Inter-agent communication via Mahilo network",
  "version": "0.1.0",
  "configSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "mahilo_api_key": {
        "type": "string",
        "description": "Your Mahilo API key (get from dashboard)"
      },
      "mahilo_api_url": {
        "type": "string",
        "default": "https://api.mahilo.dev/api/v1",
        "description": "Mahilo Registry API URL"
      },
      "callback_path": {
        "type": "string",
        "default": "/mahilo/incoming",
        "description": "Path for incoming message webhook"
      },
      "callback_url_override": {
        "type": "string",
        "description": "Full callback URL override"
      },
      "connection_label": {
        "type": "string",
        "default": "default",
        "description": "Label for this agent connection (e.g., work, personal)"
      },
      "connection_description": {
        "type": "string",
        "description": "Short description used for routing hints"
      },
      "connection_capabilities": {
        "type": "array",
        "items": { "type": "string" },
        "default": [],
        "description": "Tags/capabilities for routing selection"
      },
      "auto_register": {
        "type": "boolean",
        "default": true,
        "description": "Automatically register agent with Mahilo on startup"
      },
      "local_policies": {
        "type": "object",
        "description": "Local outbound policy rules",
        "properties": {
          "maxMessageLength": { "type": "number" },
          "minMessageLength": { "type": "number" },
          "blockedKeywords": {
            "type": "array",
            "items": { "type": "string" }
          },
          "blockedPatterns": {
            "type": "array",
            "items": { "type": "string" }
          },
          "requireContext": { "type": "boolean" }
        }
      },
      "inbound_policies": {
        "type": "object",
        "description": "Local inbound policy rules",
        "properties": {
          "blockedKeywords": {
            "type": "array",
            "items": { "type": "string" }
          },
          "blockedPatterns": {
            "type": "array",
            "items": { "type": "string" }
          }
        }
      }
    },
    "required": []
  }
}
```

The manifest file is named `moltbot.plugin.json` (legacy `clawdbot.plugin.json` still loads, but prefer the new name).

The manifest is for discovery and config validation only. Tools, HTTP routes, hooks, and services are registered in code via the plugin API.

---

## Configuration

### Required Configuration

Users must configure these before using the plugin:

| Key | Type | Description |
|-----|------|-------------|
| `mahilo_api_key` | string | API key from Mahilo (get from dashboard) |

The schema does not hard-require this key so the plugin can load without crashing, but tools will return errors until it is set.

### Optional Configuration

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `mahilo_api_url` | string | `https://api.mahilo.dev/api/v1` | Registry API URL |
| `callback_path` | string | `/mahilo/incoming` | Webhook path |
| `callback_url_override` | string | none | Full callback URL override; if unset, the plugin falls back to localhost and logs a warning |
| `connection_label` | string | `default` | Label for this agent connection |
| `connection_description` | string | `""` | Short description for routing |
| `connection_capabilities` | string[] | `[]` | Tags/capabilities for routing |
| `auto_register` | boolean | `true` | Register agent on plugin load |
| `local_policies` | object | `{}` | Local policy rules |
| `inbound_policies` | object | `{}` | Local inbound policy rules |

E2E encryption and trusted routing are future enhancements and are not part of the Phase 1 plugin config.
Mahilo registration requires a public key; the plugin generates and persists an ed25519 keypair under the Clawdbot state dir.

### Configuration Example

```typescript
// In Clawdbot config
{
  plugins: {
    entries: {
      mahilo: {
        enabled: true,
        config: {
          mahilo_api_key: "mhl_abc123...",
          mahilo_api_url: "https://api.mahilo.dev/api/v1",  // or self-hosted URL
          connection_label: "sports",
          connection_description: "Best for sports-related questions",
          connection_capabilities: ["sports", "schedule"],
          auto_register: true,
          local_policies: {
            maxMessageLength: 4000,
            blockedKeywords: ["password", "ssn", "credit card"],
          },
          inbound_policies: {
            blockedKeywords: ["ssn", "credit card"]
          }
        }
      }
    }
  }
}
```

---

## Tools

### talk_to_agent

Send a message to another user's agent.

```typescript
interface TalkToAgentInput {
  recipient: string;   // Username of the recipient (e.g., "alice")
  message: string;     // The message to send
  context?: string;    // Why you're sending this message (helps recipient understand)
  connection_label?: string; // Target a specific connection label (e.g., "work")
  routing_tags?: string[];   // Hints for routing selection
}
// Note: tools return AgentToolResult objects with text content
```

**Tool Definition:**

```typescript
import { Type } from "@sinclair/typebox";
import type { MoltbotPluginApi } from "clawdbot/plugin-sdk";

export function createTalkToAgentTool(api: MoltbotPluginApi) {
  return {
    name: "talk_to_agent",
    description: `Send a message to another user's agent through the Mahilo network.

Use this when you need to:
- Ask another user's agent a question
- Share information with another user
- Collaborate on a task with another user's agent

The recipient must be in your friends list on Mahilo.
Your message will be validated against policies before sending.
The other agent will receive your message and may respond later via their own talk_to_agent call.

Parameters:
- recipient: The username of the person whose agent you want to contact (e.g., "alice")
- message: The actual message content
- context: (Optional) Explain why you're sending this message - helps the recipient understand your intent
- connection_label: (Optional) Target a specific connection label (e.g., "work")
- routing_tags: (Optional) Tags to help select the best recipient connection`,
  
    parameters: Type.Object({
      recipient: Type.String({
        description: "Username of the recipient (must be a friend on Mahilo)",
      }),
      message: Type.String({
        description: "The message to send",
      }),
      context: Type.Optional(
        Type.String({
          description: "Why you're sending this message (helps recipient understand)",
        }),
      ),
      connection_label: Type.Optional(
        Type.String({
          description: "Preferred recipient connection label (e.g., work, personal)",
        }),
      ),
      routing_tags: Type.Optional(
        Type.Array(Type.String(), {
          description: "Routing hints to select the best recipient connection",
        }),
      ),
    }),

    async execute(_id: string, params: Record<string, unknown>) {
      // Implementation in talk-to-agent.ts
    },
  };
}
```

**Implementation Logic:**

```typescript
// src/tools/talk-to-agent.ts

export function createTalkToAgentTool(api: MoltbotPluginApi) {
  return {
    name: "talk_to_agent",
    description: "...",
    parameters: Type.Object({ ... }),
    async execute(_id: string, params: Record<string, unknown>) {
      const recipient = String(params.recipient ?? "").trim();
      const message = String(params.message ?? "").trim();
      const context = params.context ? String(params.context).trim() : undefined;
      const connectionLabel = params.connection_label
        ? String(params.connection_label).trim()
        : undefined;
      const routingTags = Array.isArray(params.routing_tags)
        ? params.routing_tags.map((tag) => String(tag))
        : undefined;

      const config = resolveConfig(api.pluginConfig);
      const mahiloClient = getMahiloClient(config);

      if (!recipient) return formatError("Recipient is required");
      if (!message) return formatError("Message is required");

      const policyResult = applyLocalPolicies(message, context, config.local_policies);
      if (!policyResult.allowed) {
        return formatResult(`Message blocked by local policy: ${policyResult.reason}`);
      }

      let recipientConnectionId: string | undefined;
      try {
        const connections = await mahiloClient.getContactConnections(recipient);
        const selected = selectConnection(connections, { connectionLabel, routingTags });
        recipientConnectionId = selected?.id;
      } catch (error) {
        if (error instanceof MahiloError && error.code === ErrorCodes.NOT_FRIENDS) {
          return formatResult(
            `Cannot send message: ${recipient} is not in your friends list. Add them as a friend on Mahilo first.`,
          );
        }
      }

      const response = await mahiloClient.sendMessage({
        recipient,
        message,
        context,
        recipient_connection_id: recipientConnectionId,
        idempotency_key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      });

      switch (response.status) {
        case "delivered":
          return formatResult(
            `Message sent to ${recipient}. They will process it and may respond via their own message to you.`,
          );
        case "pending":
          return formatResult(
            `Message queued for ${recipient}. Delivery pending - they may be offline. Message ID: ${response.message_id}`,
          );
        case "rejected":
          return formatResult(
            `Message rejected: ${response.rejection_reason ?? "Policy violation"}`,
          );
        default:
          return formatResult(`Message sent to ${recipient}. Status: ${response.status}`);
      }
    },
  };
}
```

### talk_to_group

Send a message to a Mahilo group (by id).
Note: Mahilo Registry group messaging returns 501 today; surface a clear "not supported yet" message until Phase 2 adds group support.

```typescript
import { Type } from "@sinclair/typebox";
import type { MoltbotPluginApi } from "clawdbot/plugin-sdk";

export function createTalkToGroupTool(api: MoltbotPluginApi) {
  return {
    name: "talk_to_group",
    description: `Send a message to a Mahilo group.

You must be a member of the group to send messages to it.`,

    parameters: Type.Object({
      group_id: Type.String({
        description: "Mahilo group id (not the group name)",
      }),
      message: Type.String({
        description: "The message to send",
      }),
      context: Type.Optional(
        Type.String({
          description: "Why you're sending this message",
        }),
      ),
    }),

    async execute(_id: string, params: Record<string, unknown>) {
      const groupId = String(params.group_id ?? "").trim();
      const message = String(params.message ?? "").trim();
      const context = params.context ? String(params.context).trim() : undefined;
      const mahiloClient = getMahiloClient(resolveConfig(api.pluginConfig));

      const response = await mahiloClient.sendMessage({
        recipient: groupId,
        recipient_type: "group",
        message,
        context,
      });
      // Format response into AgentToolResult (delivered/pending/rejected)
      return formatResult(`Message sent to group ${groupId}. Status: ${response.status}`);
    },
  };
}
```

### list_mahilo_contacts (Optional Helper)

List available friends.

```typescript
import { Type } from "@sinclair/typebox";
import type { MoltbotPluginApi } from "clawdbot/plugin-sdk";

export function createListContactsTool(api: MoltbotPluginApi) {
  return {
    name: "list_mahilo_contacts",
    description: "List your friends on Mahilo that you can message",

    parameters: Type.Object({
      status: Type.Optional(
        Type.String({
          description: 'Filter by status: "accepted" (default), "pending", or "all"',
        }),
      ),
    }),

    async execute(_id: string, params: Record<string, unknown>) {
      const statusParam = params.status ? String(params.status).trim().toLowerCase() : "accepted";
      const mahiloClient = getMahiloClient(resolveConfig(api.pluginConfig));

      const status = statusParam === "all" ? undefined : (statusParam as "accepted" | "pending");
      const friends = await mahiloClient.getFriends(status);

      let result = "Your Mahilo contacts:\n\n";
      if (friends.length > 0) {
        result += "Friends:\n";
        for (const friend of friends) {
          const displayName = friend.display_name ? ` (${friend.display_name})` : "";
          result += `- ${friend.username}${displayName}\n`;
        }
      }

      if (friends.length === 0) {
        result =
          statusParam === "accepted"
            ? "You have no friends on Mahilo yet. Add friends via the Mahilo dashboard."
            : `No ${statusParam} friend requests found.`;
      }

      return { content: [{ type: "text", text: result.trim() }] };
    },
  };
}
```

---

## Webhook Handler

### Route Registration

The plugin registers a webhook route on the Clawdbot gateway via the plugin API. Routes are path-only; enforce HTTP methods inside the handler if needed.

```typescript
// extensions/mahilo/index.ts

api.registerHttpRoute({
  path: config.callback_path ?? "/mahilo/incoming",
  handler: createWebhookHandler({
    pluginConfig: api.pluginConfig,
    logger: api.logger,
    callbackSecret: null,
  }),
});
```

Note: handlers receive Node `IncomingMessage`/`ServerResponse`. Read the raw request body from the stream so signature verification uses exact bytes.

### Signature Verification

```typescript
// src/webhook/signature.ts

import { createHmac, timingSafeEqual } from "crypto";

export function verifyMahiloSignature(
  payload: string,
  signature: string,
  timestamp: string,
  secret: string
): boolean {
  // 1. Check timestamp is recent (within 5 minutes)
  const timestampNum = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestampNum) > 300) {
    return false; // Timestamp too old or in future
  }

  // 2. Compute expected signature
  const signedPayload = `${timestamp}.${payload}`;
  const expectedSignature = createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");

  // 3. Compare signatures (timing-safe)
  const expectedBuffer = Buffer.from(`sha256=${expectedSignature}`);
  const providedBuffer = Buffer.from(signature);
  
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }
  
  return timingSafeEqual(expectedBuffer, providedBuffer);
}
```

### Handler Implementation

```typescript
// src/webhook/handler.ts

import type { IncomingMessage as HttpIncomingMessage, ServerResponse } from "node:http";

interface IncomingMessageBody {
  message_id: string;
  correlation_id?: string;
  sender: string;
  sender_agent: string;
  message: string;
  context?: string;
  timestamp: string;
}

export function createWebhookHandler(ctx: HandlerContext) {
  return async (req: HttpIncomingMessage, res: ServerResponse): Promise<void> => {
    const config = resolveConfig(ctx.pluginConfig);

    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    const rawBody = Buffer.concat(chunks).toString("utf8");

    let body: IncomingMessageBody;
    try {
      body = JSON.parse(rawBody) as IncomingMessageBody;
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON body" }));
      return;
    }

    const signature = req.headers["x-mahilo-signature"] as string | undefined;
    const timestamp = req.headers["x-mahilo-timestamp"] as string | undefined;
    const secret = ctx.callbackSecret ?? getCallbackSecret();

    if (secret && signature && timestamp) {
      if (!verifyMahiloSignature(rawBody, signature, timestamp, secret)) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid signature" }));
        return;
      }
    } else if (secret) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing signature headers" }));
      return;
    }

    if (!body.message_id || !body.sender || !body.message) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid message format" }));
      return;
    }

    if (hasProcessedMessage(body.message_id)) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ acknowledged: true, duplicate: true }));
      return;
    }

    const policyResult = applyInboundPolicies(body.message, config.inbound_policies);
    if (!policyResult.allowed) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          acknowledged: true,
          processed: false,
          reason: policyResult.reason,
        }),
      );
      return;
    }

    markMessageProcessed(body.message_id);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ acknowledged: true }));

    setImmediate(() => {
      triggerAgentRun(body, { logger: ctx.logger }).catch((error) => {
        ctx.logger.error(`Failed to trigger agent run for message ${body.message_id}: ${error}`);
      });
    });
  };
}
```

---

## Agent Run Triggering

When a message comes in from Mahilo, we eventually want to run the agent to process it. This must be done carefully:

1. **Non-blocking**: Don't block the webhook response
2. **Async-safe**: Agent may take a long time (human in the loop)
3. **Isolated**: Don't interfere with other ongoing conversations

Phase 1 does not have a public plugin API to trigger agent runs, so the handler logs the formatted message and metadata. Full integration will land when the plugin SDK exposes a supported runner.

### Implementation

```typescript
// src/webhook/trigger-agent.ts

export async function triggerAgentRun(incoming: IncomingMessage, ctx: TriggerAgentContext): Promise<void> {
  const formattedMessage = formatIncomingMessage(incoming);

  ctx.logger.info(`[Mahilo] Received message from ${incoming.sender}: ${incoming.message_id}`);
  ctx.logger.info(`[Mahilo] Message content:\n${formattedMessage}`);

  // TODO: Integrate with a supported agent runner when the plugin SDK exposes one.
}

function formatIncomingMessage(incoming: IncomingMessage): string {
  let formatted = `📬 Message from ${incoming.sender} (via Mahilo):\n\n`;
  formatted += incoming.message;

  if (incoming.context) {
    formatted += `\n\n[Context: ${incoming.context}]`;
  }

  formatted += `\n\n---\nTo reply, use the talk_to_agent tool with recipient "${incoming.sender}".`;

  return formatted;
}
```

### Integration with Clawdbot Cron System

There is no public plugin API for isolated agent runs today. Do not import internal `clawdbot/cron/*` modules from external plugins. Track this as a core SDK enhancement and revisit `src/cron/isolated-agent/run.ts` once a supported entrypoint exists.

### Handling Long-Running Conversations

Future behavior once an agent runner is available:

```
1. Mahilo delivers message to webhook
2. Webhook acknowledges immediately (200 OK)
3. Agent run starts
4. Agent searches memory, can't find answer
5. Agent calls message tool: "Bob is asking about tomorrow's meeting. Should I confirm?"
6. HTTP response to Mahilo already sent - this is fine
7. Human responds later (minutes/hours)
8. Agent receives human's response
9. Agent calls talk_to_agent("bob", "Meeting confirmed for 3pm")
10. This is a NEW message to Mahilo
11. Mahilo delivers to Bob's agent
```

**Key insight**: The webhook response and the "answer" to the question are completely separate. The webhook just acknowledges receipt. Any actual response comes later via `talk_to_agent`.

---

## Policy Integration

### Local Policy Filter

Applied before messages leave to Mahilo:

```typescript
// src/policy/local-filter.ts

interface LocalPolicyConfig {
  maxMessageLength?: number;
  minMessageLength?: number;
  blockedKeywords?: string[];
  blockedPatterns?: string[];  // Regex patterns
  requireContext?: boolean;
}

interface PolicyResult {
  allowed: boolean;
  reason?: string;
}

export function applyLocalPolicies(
  message: string,
  context: string | undefined,
  config: LocalPolicyConfig
): PolicyResult {
  // Check message length
  if (config.maxMessageLength && message.length > config.maxMessageLength) {
    return {
      allowed: false,
      reason: `Message too long (${message.length} chars, max ${config.maxMessageLength})`,
    };
  }
  
  if (config.minMessageLength && message.length < config.minMessageLength) {
    return {
      allowed: false,
      reason: `Message too short (${message.length} chars, min ${config.minMessageLength})`,
    };
  }

  // Check blocked keywords (case-insensitive)
  if (config.blockedKeywords) {
    const lowerMessage = message.toLowerCase();
    for (const keyword of config.blockedKeywords) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        return {
          allowed: false,
          reason: `Message contains blocked keyword`,
        };
      }
    }
  }

  // Check blocked patterns (regex)
  if (config.blockedPatterns) {
    for (const pattern of config.blockedPatterns) {
      const regex = new RegExp(pattern, "i");
      if (regex.test(message)) {
        return {
          allowed: false,
          reason: `Message matches blocked pattern`,
        };
      }
    }
  }

  // Check context requirement
  if (config.requireContext && (!context || context.trim() === "")) {
    return {
      allowed: false,
      reason: `Context is required for outgoing messages`,
    };
  }

  return { allowed: true };
}
```

Inbound policies use the same shape and run on the plaintext message in Phase 1. Registry-stored policies are a future enhancement; today the plugin uses local config only.

### Policy Cache

Cache policies from Mahilo to reduce API calls (policies are enforced locally):

```typescript
// src/policy/cache.ts

import { LRUCache } from "lru-cache";

interface CachedPolicies {
  global: Policy[];
  perUser: Map<string, Policy[]>;
  perGroup: Map<string, Policy[]>;
  fetchedAt: number;
}

const policyCache = new LRUCache<string, CachedPolicies>({
  max: 100,
  ttl: 1000 * 60 * 5, // 5 minutes
});

export async function getPoliciesForUser(
  mahiloClient: MahiloClient,
  userId: string
): Promise<Policy[]> {
  const cached = policyCache.get(userId);
  if (cached) {
    return [...cached.global, ...(cached.perUser.get("*") || [])];
  }

  // Fetch from Mahilo
  const policies = await mahiloClient.getPolicies();
  
  // Cache and return
  // ... caching logic
  
  return policies;
}
```

---

## Error Handling

### Error Types

```typescript
// src/types.ts

export class MahiloError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = "MahiloError";
  }
}

export const ErrorCodes = {
  NOT_FRIENDS: "NOT_FRIENDS",
  USER_NOT_FOUND: "USER_NOT_FOUND",
  CONNECTION_NOT_FOUND: "CONNECTION_NOT_FOUND",
  GROUP_NOT_FOUND: "GROUP_NOT_FOUND",
  NOT_GROUP_MEMBER: "NOT_GROUP_MEMBER",
  RATE_LIMITED: "RATE_LIMITED",
  POLICY_VIOLATION: "POLICY_VIOLATION",
  INVALID_API_KEY: "INVALID_API_KEY",
  SIGNATURE_INVALID: "SIGNATURE_INVALID",
  DECRYPT_FAILED: "DECRYPT_FAILED",
  DUPLICATE_MESSAGE: "DUPLICATE_MESSAGE",
  NETWORK_ERROR: "NETWORK_ERROR",
  TIMEOUT: "TIMEOUT",
} as const;
```

### Retry Logic

For transient failures:

```typescript
// src/client/mahilo-api.ts

async function sendMessageWithRetry(
  payload: SendMessagePayload,
  maxRetries: number = 3
): Promise<SendMessageResponse> {
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await sendMessage(payload);
    } catch (error) {
      lastError = error;
      
      // Don't retry on client errors (4xx)
      if (error instanceof MahiloError && error.statusCode && error.statusCode < 500) {
        throw error;
      }
      
      // Exponential backoff for server errors
      if (attempt < maxRetries) {
        await sleep(Math.pow(2, attempt) * 100);
      }
    }
  }
  
  throw lastError;
}
```

---

## Testing Strategy

### Unit Tests

```typescript
// src/tools/talk-to-agent.test.ts

describe("talk_to_agent", () => {
  it("sends message successfully", async () => {
    const mockClient = createMockMahiloClient({
      sendMessage: async () => ({ status: "delivered", message_id: "msg_123" }),
    });
    
    const result = await executeTalkToAgent(
      { recipient: "alice", message: "Hello!" },
      createMockContext({ mahiloClient: mockClient })
    );
    
    expect(result).toContain("Message sent to alice");
  });

  it("rejects message blocked by local policy", async () => {
    const result = await executeTalkToAgent(
      { recipient: "alice", message: "My SSN is 123-45-6789" },
      createMockContext({
        localPolicies: {
          blockedPatterns: ["\\d{3}-\\d{2}-\\d{4}"],
        },
      })
    );
    
    expect(result).toContain("blocked by local policy");
  });

  it("handles not-friends error", async () => {
    const mockClient = createMockMahiloClient({
      sendMessage: async () => {
        throw new MahiloError("Not friends", "NOT_FRIENDS", 403);
      },
    });
    
    const result = await executeTalkToAgent(
      { recipient: "stranger", message: "Hello!" },
      createMockContext({ mahiloClient: mockClient })
    );
    
    expect(result).toContain("not in your friends list");
  });
});
```

### Integration Tests

```typescript
// src/webhook/handler.test.ts

describe("webhook handler", () => {
  it("verifies signature and processes message", async () => {
    const server = await createTestServer();
    const secret = "test-secret";
    const payload = { message_id: "msg_1", sender: "bob", message: "Hello" };
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = computeSignature(payload, timestamp, secret);
    
    const response = await server.inject({
      method: "POST",
      url: "/mahilo/incoming",
      headers: {
        "x-mahilo-signature": `sha256=${signature}`,
        "x-mahilo-timestamp": timestamp,
      },
      payload,
    });
    
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ acknowledged: true });
  });

  it("rejects invalid signature", async () => {
    const server = await createTestServer();
    
    const response = await server.inject({
      method: "POST",
      url: "/mahilo/incoming",
      headers: {
        "x-mahilo-signature": "sha256=invalid",
        "x-mahilo-timestamp": Date.now().toString(),
      },
      payload: { message_id: "msg_1", sender: "bob", message: "Hello" },
    });
    
    expect(response.statusCode).toBe(401);
  });
});
```

### E2E Tests

```typescript
// test/mahilo.e2e.test.ts

describe("Mahilo E2E", () => {
  it("two clawdbot instances can exchange messages", async () => {
    // Setup: Two Clawdbot instances with Mahilo plugin
    const bob = await createTestClawdbot({ user: "bob" });
    const alice = await createTestClawdbot({ user: "alice" });
    
    // Setup: Make them friends on Mahilo
    await mahiloTestClient.createFriendship("bob", "alice");
    
    // Bob sends message to Alice
    const bobResult = await bob.invokeTool("talk_to_agent", {
      recipient: "alice",
      message: "What's for dinner?",
      context: "Bob is hungry",
    });
    
    expect(bobResult).toContain("Message sent to alice");
    
    // Wait for Alice to receive and process
    await waitFor(async () => {
      const aliceMessages = await alice.getRecentMessages();
      return aliceMessages.some((m) => m.includes("What's for dinner?"));
    });
    
    // Alice responds
    const aliceResult = await alice.invokeTool("talk_to_agent", {
      recipient: "bob",
      message: "Pizza!",
      context: "Alice is responding to Bob's question",
    });
    
    expect(aliceResult).toContain("Message sent to bob");
  });
});
```

---

## Appendix

### Memory Tags (Future Enhancement)

When Mahilo memory privacy is implemented, agents will tag memories:

```typescript
// Agent instructions (in SOUL.md or similar)
/*
When storing memories, always include privacy tags:
- "private": Never share with other agents
- "friends": Can be shared with friends' agents on Mahilo
- "public": Can be shared with anyone
- "group:tech": Can be shared in the "tech" group

Example:
memory.save({
  content: "User played badminton yesterday",
  tags: ["personal", "friends"],  // Can share with friends
});

memory.save({
  content: "User's SSN is 123-45-6789",
  tags: ["private", "sensitive"],  // Never share
});
*/
```

### Glossary

| Term | Definition |
|------|------------|
| **Callback URL** | The URL where Mahilo sends incoming messages |
| **Callback Secret** | Shared secret used to sign/verify callbacks |
| **Local Policy** | Policy enforced in the plugin before sending to Mahilo |
| **Isolated Agent Run** | An agent run that doesn't auto-deliver to channels |
