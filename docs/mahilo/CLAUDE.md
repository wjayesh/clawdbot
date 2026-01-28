# Mahilo Plugin Development Instructions

You are building the Clawdbot Mahilo Plugin - an extension that enables Clawdbot agents to send and receive messages via the Mahilo inter-agent communication network.

---

## CRITICAL: Documentation Maintenance

**THIS IS NON-NEGOTIABLE.** After EVERY task completion, you MUST update:

### 1. `docs/mahilo/tasks-plugin.md`
- Change task status from `pending` to `done`
- Check off ALL acceptance criteria with `[x]`
- Update the summary table counts (Pending, Done columns)
- Update the External Dependencies section if status changed

### 2. `docs/mahilo/progress.txt`
- Update the Phase 2 status line (e.g., "11/32 tasks complete")
- Update the summary table counts
- Move completed tasks from "Pending" to "Completed" section
- Add a session log entry describing what you did

### 3. Verify Consistency
Before committing, grep for the task IDs and verify:
- Status is `done` in tasks-plugin.md
- Task is in "Completed" section in progress.txt
- Summary counts match in BOTH files
- No stale "PENDING" references for completed tasks

### 4. Commit Docs WITH Code
Always include doc updates in the same commit or immediately after.

---

## Key Files

| File | Purpose |
|------|---------|
| `docs/mahilo/tasks-plugin.md` | Task list with IDs, status, priorities, acceptance criteria |
| `docs/mahilo/progress.txt` | Progress tracking, session logs, what works today |
| `docs/mahilo/plugin-design.md` | Full design specification |
| `extensions/mahilo/` | Plugin source code |

## How to Work

### 1. Check Progress
Read `docs/mahilo/progress.txt` to see current status and next steps.

### 2. Pick the Next Task
Look at `docs/mahilo/tasks-plugin.md` - find next pending P1 task (P0s are done or blocked).

Current priority order:
1. Group Messaging (PLG-046-051) - P1
2. Policy Sync (PLG-052-056) - P1
3. Trusted Routing (PLG-057-059) - P2
4. E2E Encryption (PLG-039-045) - P0 but BLOCKED on registry spec

### 3. Implement the Task
- Read task requirements and acceptance criteria
- Follow existing patterns in `extensions/mahilo/`
- Write tests alongside implementation
- Run `pnpm vitest run extensions/mahilo/tests` to verify

### 4. Update Documentation (CRITICAL)
See the "Documentation Maintenance" section above. Do this BEFORE committing.

### 5. Commit
```bash
git add <files> docs/mahilo/progress.txt docs/mahilo/tasks-plugin.md
git commit -m "feat(mahilo): <description> (PLG-XXX)"
```

## Plugin Structure

```
extensions/mahilo/
├── index.ts                     # Plugin entry point
├── moltbot.plugin.json          # Plugin manifest
├── package.json                 # Dependencies
├── src/
│   ├── types.ts                 # Type definitions
│   ├── config.ts                # Configuration handling
│   ├── keys.ts                  # Ed25519 keypair management
│   ├── state.ts                 # Plugin state persistence
│   ├── callback-url.ts          # Callback URL detection
│   ├── client/
│   │   └── mahilo-api.ts        # Mahilo Registry client
│   ├── tools/
│   │   ├── talk-to-agent.ts     # talk_to_agent tool
│   │   ├── talk-to-group.ts     # talk_to_group tool
│   │   └── list-contacts.ts     # list_mahilo_contacts tool
│   ├── webhook/
│   │   ├── handler.ts           # Webhook request handler
│   │   ├── signature.ts         # HMAC signature verification
│   │   ├── dedup.ts             # Message deduplication
│   │   └── trigger-agent.ts     # Agent run triggering
│   └── policy/
│       ├── local-filter.ts      # Local policy enforcement
│       └── llm-evaluator.ts     # LLM-based policy evaluation
└── tests/                       # 239 tests
```

## Current Status

**Phase 1**: 38/38 complete (100%)
**Phase 2**: 11/32 complete (34%) - 16 pending, 5 blocked

### What Works
- Full message exchange loop (send, receive, trigger agent, respond)
- Local policy filtering (keywords, patterns, length)
- LLM policy evaluation (fetch from registry, evaluate locally)
- Signature verification, deduplication
- Callback URL detection, state persistence

### What's Next
- Group messaging (registry supports it, plugin needs wiring)
- Policy sync (fetch and merge registry policies)
- Trusted routing config controls

### What's Blocked
- E2E encryption (waiting on registry encryption spec)

## Learnings

- Plugin `register(api)` must be synchronous
- `registerHttpRoute` matches paths only; enforce HTTP methods in handler
- Tool handlers use `execute(_id, params)` returning `AgentToolResult`
- Tool factories read config from `api.pluginConfig`
- Mahilo registration requires `public_key` + `public_key_alg`
- Use `callGateway({ method: "agent" })` to trigger agent runs

## Completion Criteria

When ALL tasks in `docs/mahilo/tasks-plugin.md` are `done`, output `COMPLETE`.
