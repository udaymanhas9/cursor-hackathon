# adserve-mcp

Hackathon boilerplate for an ad-serving system on ChatGPT (MCP) + Node/TypeScript.
Implements three async paths from `docs/Boilerplate.md`:

- **Path A — Ad Serving:** an MCP `serve_ad` tool gates on intent, fetches market
  data + best ad in parallel, and returns a tracked link.
- **Path B — Attribution webhook:** `POST /api/webhooks/conversion` acks `202`
  and enqueues the conversion.
- **Path C — Background worker:** stitches the session, runs a fraud audit, and
  either approves payout or escalates to a human (HITL).

Everything runs in-memory with no required API keys.

## Setup

```bash
npm install
cp .env.example .env   # optional; defaults work out of the box
npm run dev
```

Server starts on `:3000` (configurable via `PORT`).

## Configuration

| Env var | Default | Purpose |
|---------|---------|---------|
| `PORT` | `3000` | HTTP port |
| `INTENT_THRESHOLD` | `0.85` | Min intent score to serve an ad |
| `TAVILY_API_KEY` | _(unset)_ | Live Tavily search; mock used if unset |
| `FRAUD_REVENUE_CEILING` | `1000` | Mock fraud flag threshold |

## Endpoints

- `POST /mcp` — MCP Streamable-HTTP (the `serve_ad` tool). Point a ChatGPT
  connector / MCP client here.
- `POST /api/webhooks/conversion` — `{ "clickId": string, "revenue": number }`.
  Try the seeded click: `clickId: "seed_click_001"`.
- `GET /health` — liveness.

## Connecting ChatGPT

Expose `/mcp` publicly (e.g. a tunnel or the Alpic host) and add it as an MCP
server / connector. ChatGPT calls `serve_ad` with `{ sessionId, prompt }`.

## Swap points (production)

- **Queue:** replace `MemoryQueue` with a BullMQ/Redis implementation of the
  `Queue<T>` interface in `src/queue/queue.ts`.
- **Datastore:** replace the in-memory repositories in `src/data/repositories.ts`.
- **Overmind:** implement `OvermindService` against the real service.

> No automated tests in this project by design — verify with `npm run typecheck`
> and the manual checks above.
