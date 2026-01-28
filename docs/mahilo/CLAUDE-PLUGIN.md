# Mahilo Plugin Development Instructions

You are building the Clawdbot Mahilo Plugin - an extension that enables Clawdbot agents to send and receive messages via the Mahilo inter-agent communication network.

## Your Mission

Implement the Mahilo Plugin based on the design document and task list. Work through tasks systematically, starting with P0 (highest priority) tasks.

## Key Files to Read First

1. `docs/mahilo/plugin-design.md` - Full design specification
2. `docs/mahilo/tasks-plugin.md` - Phase 1 tasks with IDs, priorities, and acceptance criteria
3. `docs/mahilo/plugin-docs-findings.md` - Design review findings that should be addressed
4. `docs/mahilo/progress-plugin.txt` - Track your progress here
5. `extensions/discord/` - Reference plugin to follow patterns from

## How to Work

### 1. Check Progress
Read `docs/mahilo/progress-plugin.txt` to see what's been done and what's in progress.

### 2. Pick the Next Task
Look at `docs/mahilo/tasks-plugin.md` and find the next pending P0 task. Follow the dependency graph:
- Start with Plugin Scaffold (PLG-001 to PLG-004)
- Then Configuration (PLG-005, PLG-006)
- Then Mahilo Client (PLG-007 to PLG-011)
- Then Tools (PLG-012 to PLG-015)
- And so on...

### 3. Implement the Task
- Read the task requirements and acceptance criteria
- Follow existing Clawdbot plugin patterns (see `extensions/discord/`)
- Use the Clawdbot plugin SDK for registration
- Write tests alongside implementation

### 4. Update Progress
After completing work in a session:
1. Update the task status in `docs/mahilo/tasks-plugin.md` (change `pending` to `done`)
2. Add notes to `docs/mahilo/progress-plugin.txt` about what you did and any discoveries
3. Commit your changes with a clear message

### 5. Decide: Continue or Complete

**If there are more tasks to do:**
- End your session normally (the loop will restart you with fresh context)
- Your progress persists via git history and progress-plugin.txt

**If ALL tasks are done:**
- Output the word `COMPLETE` (in all caps) in your response
- This signals the Ralph loop to stop

## Plugin Structure

The plugin lives at `extensions/mahilo/` and should follow Clawdbot conventions:

```
extensions/mahilo/
├── moltbot.plugin.json    # Plugin manifest
├── package.json           # Dependencies
├── tsconfig.json          # TypeScript config
├── index.ts               # Plugin entry point (default export)
├── src/
│   ├── client/
│   │   ├── index.ts
│   │   └── mahilo-api.ts  # Mahilo API client
│   ├── tools/
│   │   ├── talk-to-agent.ts
│   │   ├── talk-to-group.ts
│   │   └── list-contacts.ts
│   ├── webhook/
│   │   ├── handler.ts     # Incoming message handler
│   │   └── signature.ts   # HMAC verification
│   ├── policy/
│   │   └── local-filter.ts # Local policy checks
│   └── config.ts          # Configuration schema
└── tests/
    ├── client.test.ts
    ├── signature.test.ts
    ├── policy.test.ts
    └── tools.test.ts
```

## Integration Points with Clawdbot

Study these files for patterns:

1. **Plugin SDK**: Look at how other plugins register (`extensions/discord/`, `extensions/lobster/`)
2. **Route Registration**: `api.registerHttpRoute` uses Node req/res; see `src/gateway/server/plugins-http.ts`
3. **Tool Registration**: Tool factories use `execute(_id, params)`; see `extensions/llm-task/`
4. **Agent Triggering**: No public plugin API yet; keep Phase 1 logging stub
5. **Config System**: Config lives under `plugins.entries.<id>.config`; manifest schema in `moltbot.plugin.json`

## Learnings

- The manifest is for discovery and config validation only; tools, routes, and hooks are registered in code via the plugin API.
- `moltbot.plugin.json` must include `id` and `configSchema`, or the plugin fails validation.
- Legacy `clawdbot.plugin.json` still loads, but `moltbot.plugin.json` is the canonical filename.
- Bundled plugins are disabled by default; set `plugins.entries.<id>.enabled: true` and ensure `plugins.enabled` is not false.
- If `plugins.allow` is non-empty, the plugin id must be in the allowlist (and not in `plugins.deny`).
- Plugin `register(api)` must be synchronous; if it returns a Promise, it is ignored.
- `registerHttpRoute` matches paths only; parse raw bodies from the Node request stream and enforce HTTP methods inside the handler.
- Tool handlers use `execute(_id, params)` and should return an `AgentToolResult` with `content`.
- Tool factories should read config from `api.pluginConfig`; `execute` only receives `_id` and params.
- Register optional tools with `{ optional: true }` so the plugin can load before keys are configured.
- Mahilo registration requires `public_key` + `public_key_alg`; persist a keypair under the plugin state dir and reuse it on startup.

## Important Notes

1. **Follow existing patterns** - Study `extensions/discord/` for conventions
2. **Plugin dependencies** - Keep them minimal, use peerDependencies for clawdbot
3. **Don't modify core** - Plugin should work via extension points only
4. **Mock the registry** - For early tasks, mock Mahilo API responses
5. **Write tests** - Each task should have corresponding tests
6. **Commit often** - Small, focused commits with clear messages
7. **Update progress** - Keep progress-plugin.txt current

## Registry Dependency

Some tasks depend on the Mahilo Registry being available:
- For development, you can mock the registry responses
- Or run a local registry instance from the `mahilo-2` repo
- The E2E test (PLG-034) requires a running registry

## Completion Criteria

When ALL tasks in `docs/mahilo/tasks-plugin.md` are marked as `done`, output `COMPLETE` to signal the Ralph loop to stop.

Good luck! Start by reading the progress file to see where we are.
