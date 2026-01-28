# Mahilo Registry + E2E Test Handover

## Goal
Run the Mahilo Registry locally and execute the Mahilo E2E test to verify end-to-end delivery:
- Registry delivers to the plugin webhook.
- Gateway logs show receipt and message content.

## Current State
- Plugin E2E harness lives at `test/mahilo.e2e.test.ts`.
- Gateways are spawned from `dist/index.js`, so `pnpm build` must succeed first.
- Registry repo is at `../mahilo-2`.

## What I Was About To Do
1) Install Bun to run the registry.
2) Start OrbStack/Docker to run the registry in a container (fallback if Bun install fails).
3) Run the registry and execute the E2E test:
   - `MAHILO_E2E=1 MAHILO_REGISTRY_URL=http://127.0.0.1:8080 pnpm test:e2e -- test/mahilo.e2e.test.ts`

## What Blocked Me
- `brew install bun` returned exit code 1 with no output.
- `curl -fsSL https://bun.sh/install | bash` failed with `Could not resolve host: bun.sh` (DNS/network).
- OrbStack app failed to open with `kLSNoExecutableErr: The executable is missing`.

## How To Run the Registry (Preferred: Bun)
From `../mahilo-2`:
```bash
bun install
bun run db:migrate
bun run dev
```
Notes:
- `NODE_ENV` defaults to `development` if unset.
- Dev mode allows `http://127.0.0.1` callback URLs.
- Registry URL will be `http://127.0.0.1:8080`.

## How To Run the Registry (Docker Fallback)
From `../mahilo-2`:
```bash
docker build -t mahilo-registry .
docker run --rm -p 8080:8080 \
  -e NODE_ENV=development \
  -e SECRET_KEY=dev-secret \
  mahilo-registry
```
Notes:
- Dockerfile defaults `NODE_ENV=production`, which rejects `http://localhost` callbacks.
- Override to `NODE_ENV=development` for local testing.

## E2E Test Command
From repo root:
```bash
pnpm build
MAHILO_E2E=1 MAHILO_REGISTRY_URL=http://127.0.0.1:8080 pnpm test:e2e -- test/mahilo.e2e.test.ts
```

## What the Test Covers
- Registers two users in the registry.
- Spawns two gateway processes with Mahilo plugin enabled.
- Registers each gateway as an agent (includes ed25519 public key).
- Creates a friendship, sends a message from Alice to Bob.
- Asserts Bob's gateway logs show receipt and message content.

## Expected Success Signals
- Registry returns `status: "delivered"` for the test message.
- Gateway logs include:
  - `[Mahilo] Received message from <alice>`
  - The message content string.

## Last Local Tests Run
- `pnpm build`
- `pnpm exec vitest run extensions/mahilo/tests/tools.test.ts`
- `pnpm --dir extensions/mahilo test` failed (no `node_modules` in that folder).
