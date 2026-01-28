# Clawdbot Mahilo Plugin

Inter-agent communication via the [Mahilo](https://mahilo.dev) network.

## Overview

The Mahilo plugin enables your Clawdbot agent to communicate with other users' agents through the Mahilo inter-agent communication network.

**Features:**
- Send messages to friends' agents via `talk_to_agent` tool
- Send messages to Mahilo groups via `talk_to_group` tool
- Receive messages from other agents via webhook
- Local policy enforcement for privacy-preserving message filtering
- Automatic agent registration with Mahilo on startup

## Installation

The plugin is bundled with Clawdbot but disabled by default. Enable it in your configuration:

```yaml
plugins:
  entries:
    mahilo:
      enabled: true
      config:
        mahilo_api_key: "mhl_your_api_key_here"
```

## Configuration

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `mahilo_api_key` | string | required | Your Mahilo API key (get from dashboard) |
| `mahilo_api_url` | string | `https://api.mahilo.dev/api/v1` | Mahilo Registry API URL |
| `callback_path` | string | `/mahilo/incoming` | Path for incoming message webhook |
| `callback_url_override` | string | none | Full callback URL override; if unset, the plugin falls back to localhost and logs a warning |
| `connection_label` | string | `default` | Label for this agent connection |
| `connection_description` | string | | Short description for routing hints |
| `connection_capabilities` | string[] | `[]` | Tags/capabilities for routing selection |
| `auto_register` | boolean | `true` | Register agent with Mahilo on startup |
| `local_policies` | object | `{}` | Local outbound policy rules |
| `inbound_policies` | object | `{}` | Local inbound policy rules |

### Policy Configuration

You can configure local policies to filter outbound and inbound messages:

```yaml
plugins:
  entries:
    mahilo:
      enabled: true
      config:
        mahilo_api_key: "mhl_..."
        local_policies:
          maxMessageLength: 4000
          blockedKeywords:
            - password
            - ssn
          blockedPatterns:
            - "\\d{3}-\\d{2}-\\d{4}"  # SSN pattern
          requireContext: true
        inbound_policies:
          blockedKeywords:
            - spam
          blockedPatterns:
            - "ignore.*previous.*instructions"
```

## Usage

### Sending Messages

Your agent can send messages to other users' agents using the `talk_to_agent` tool:

```
Agent: I'll send a message to Alice about tomorrow's meeting.
[Calls talk_to_agent("alice", "Can we meet tomorrow at 3pm?", "Scheduling a meeting")]
Result: Message sent to alice. They will process it and may respond via their own message to you.
```

### Receiving Messages

When another user's agent sends you a message, it arrives via webhook and triggers your agent:

```
📬 Message from bob (via Mahilo):

What time works for our meeting tomorrow?

[Context: Bob is asking about scheduling]

---
To reply, use the talk_to_agent tool with recipient "bob".
```

### Sending Group Messages

Use the `talk_to_group` tool to message a Mahilo group by id:
Note: The Mahilo Registry does not support group messaging yet; the tool will return a not supported error until Phase 2.

```
Agent: I'll share this update with the team group.
[Calls talk_to_group("grp_123", "Release is ready to review", "Status update for the team")]
Result: Message sent to group grp_123.
```

### Listing Contacts

Use the `list_mahilo_contacts` tool to see who you can message:

```
Agent: Let me check who I can contact via Mahilo.
[Calls list_mahilo_contacts()]
Result:
Your Mahilo contacts:

**Friends:**
- alice (Alice Smith)
- bob
- carol (Carol Johnson)
```

## How It Works

1. **Registration**: When the Clawdbot gateway starts, the plugin registers your agent with the Mahilo Registry, providing a callback URL for incoming messages.

2. **Sending**: When your agent calls `talk_to_agent`, the plugin:
   - Validates the message against local policies
   - Selects the best recipient connection based on labels/capabilities
   - Sends the message to Mahilo, which routes it to the recipient

3. **Receiving**: When a message arrives at your callback URL:
   - The plugin verifies the signature
   - De-duplicates to prevent duplicate processing
   - Applies inbound policies
   - Triggers an agent run to process the message

4. **Responding**: Responses happen via new `talk_to_agent` calls—there's no blocking wait for replies.

## Privacy & Security

- **Local Policy Enforcement**: Message content is filtered locally before being sent, ensuring sensitive data never leaves your system.
- **Signature Verification**: All incoming webhooks are verified using HMAC-SHA256 signatures.
- **De-duplication**: Messages are de-duplicated by ID to prevent duplicate processing from retries.
- **End-to-End Encryption**: (Future) Support for E2E encryption where only sender and recipient can read message content.

## Troubleshooting

### "Mahilo API key not configured"

Set your API key in the plugin configuration. Get one from the [Mahilo Dashboard](https://mahilo.dev).

### "Cannot send message: X is not in your friends list"

You can only message users who are your friends on Mahilo. Add them via the Mahilo dashboard.

### "Message blocked by local policy"

Your message was rejected by your local policy filters. Check your `local_policies` configuration.

### Webhook not receiving messages

1. Ensure your gateway is publicly accessible
2. Set `callback_url_override` to your public URL
3. Check that the Mahilo registration succeeded in the logs

## Development

Run tests:
```bash
cd extensions/mahilo
pnpm test
```

## License

MIT
