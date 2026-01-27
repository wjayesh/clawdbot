# Agent Triggering and Message Delivery

This document explains how to trigger agents, control message delivery to channels, and build flows where agents can optionally message users.

## Overview

Clawdbot agents can be triggered through multiple input channels and have flexible control over whether their output is delivered to messaging channels (WhatsApp, Telegram, etc.) or returned directly to the caller.

## Input Channels for Triggering Agents

| Method | Endpoint | Description |
|--------|----------|-------------|
| **HTTP API** | `POST /v1/responses` | OpenResponses-compatible HTTP endpoint |
| **WebSocket** | `chat.send` | Gateway WebSocket RPC |
| **Cron Jobs** | `cron.add` / `cron.run` | Scheduled or on-demand execution |
| **Messaging Channels** | WhatsApp, Telegram, etc. | Direct user messages |

## Delivery Control

### Cron Jobs

Cron job payloads have a `deliver` parameter that controls channel delivery:

```typescript
{
  kind: "agentTurn",
  message: "Your prompt here",
  deliver: false,  // true | false | undefined
  channel: "whatsapp",  // optional
  to: "+1234567890"     // optional
}
```

**Delivery modes:**
- `deliver: true` → Always deliver to channel
- `deliver: false` → Never deliver (agent runs silently)
- `deliver: undefined` → Auto-mode: deliver only if `to` is specified

### HTTP API (`/v1/responses`)

The HTTP API **does not auto-deliver** to messaging channels. The response returns directly to the HTTP caller.

```bash
POST /v1/responses
{
  "model": "claude-sonnet",
  "input": "Do some work",
  "stream": false
}
# Response comes back to YOU, not to WhatsApp/Telegram
```

## Agent Tool Calls for Messaging

Agents have access to the `message` tool, which can send messages to any configured channel.

### Message Tool Usage

```json
{
  "action": "send",
  "channel": "whatsapp",
  "target": "+1234567890",
  "message": "Hello from the agent!"
}
```

Supported channels: `whatsapp`, `telegram`, `discord`, `slack`, `signal`, `imessage`, etc.

## Pattern: Try Tools, Fall Back to User Message

A common pattern is having an agent attempt to answer via tools, then message the user if it cannot.

### Prompt Structure

```
POST /v1/responses
{
  "model": "claude-sonnet",
  "instructions": "Try to answer using available tools. If you cannot find the answer, use the message tool to ask the user on WhatsApp at +1234567890.",
  "input": [{ "type": "message", "role": "user", "content": "What's in the sales report?" }]
}
```

### Flow

```
HTTP Request → Agent runs → Tries tools →
  ├─ Success: Returns answer in HTTP response
  └─ Failure: Calls message tool → Sends to WhatsApp → Returns confirmation in HTTP response
```

## Key Files

| File | Purpose |
|------|---------|
| `src/cron/isolated-agent/run.ts` | Cron job agent execution and delivery logic |
| `src/cron/types.ts` | Cron job payload types (`CronPayload`) |
| `src/gateway/openresponses-http.ts` | HTTP API handler |
| `src/agents/tools/message-tool.ts` | Message tool implementation |
| `src/infra/outbound/deliver.ts` | Channel delivery logic |

## Quick Reference

### Run Agent Without Channel Delivery

**Via Cron:**
```typescript
// Create job with deliver: false
{ method: "cron.add", params: { 
  name: "background-task",
  schedule: { kind: "cron", expr: "0 * * * *" },
  sessionTarget: "isolated",
  wakeMode: "now",
  payload: { kind: "agentTurn", message: "Process data", deliver: false }
}}
```

**Via HTTP:**
```bash
# HTTP API doesn't auto-deliver; response returns to caller
curl -X POST http://localhost:18789/v1/responses \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"model":"claude-sonnet","input":"Do work"}'
```

### Let Agent Decide to Message User

```bash
curl -X POST http://localhost:18789/v1/responses \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "model": "claude-sonnet",
    "instructions": "Use tools to answer. If unable, message user on whatsapp at +1234567890.",
    "input": [{"type":"message","role":"user","content":"Find the report"}]
  }'
```

The agent will either return the answer directly or call the `message` tool to contact the user.
