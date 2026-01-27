# Mahilo Plugin Doc Review Findings

## Status
All items below are addressed by the doc updates in this change. Keep this list as a historical record of what was fixed.

## Findings
### Critical
- [CRIT-1] The manifest and lifecycle guidance are incompatible with the Clawdbot plugin system. The doc models `clawdbot.plugin.json` as a runtime registry with `tools`, `routes`, and `hooks`, and omits required `id` + `configSchema`, which will fail config validation and prevent plugin load. `docs/mahilo/plugin-design.md:222` `docs/mahilo/tasks-plugin.md:37` `docs/plugins/manifest.md:16` `src/plugins/loader.ts:271`
- [CRIT-2] The config example uses `plugins.mahilo` instead of `plugins.entries.mahilo.config`, so the plugin will not receive its config and strict validation will flag unknown keys. `docs/mahilo/plugin-design.md:335` `docs/plugin.md:185`

### High
- [HIGH-1] Webhook registration and handler snippets use Fastify (`app.post`, `FastifyRequest`, `request.rawBody`) but plugin HTTP routes only receive Node `IncomingMessage`/`ServerResponse`, so the doc code will not compile or run as written. `docs/mahilo/plugin-design.md:622` `src/plugins/types.ts:183` `src/gateway/server/plugins-http.ts:23`
- [HIGH-2] Tool API usage is incorrect: the doc uses `execute(input, ctx)` and reads `ctx.pluginConfig.mahilo`, but Clawdbot tools use `execute(_id, params)` and capture config via `api.pluginConfig` at registration. `docs/mahilo/plugin-design.md:428` `extensions/mahilo/src/tools/talk-to-agent.ts:114`
- [HIGH-3] Agent run triggering references `runIsolatedAgent` from `clawdbot/cron/isolated-agent`, which is not exported and is outside the package exports, so external plugins cannot import it. `docs/mahilo/plugin-design.md:777` `src/cron/isolated-agent.ts:1` `package.json:7`

### Medium
- [MED-1] Webhook verification references `config.callback_secret`, but the config schema does not define a persisted callback secret, and the plugin currently stores it in memory only, which is lost on restart. `docs/mahilo/plugin-design.md:703` `extensions/mahilo/src/webhook/handler.ts:29`
