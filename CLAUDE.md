# CLAUDE.md

Guidance for AI assistants (Claude Code) working in this repository.

## What this repo is

A **WhatsApp Business MCP server** (`whatsapp-business-mcp`, package name in
`package.json`) written in TypeScript. It exposes WhatsApp messaging, groups,
contacts, media, and profile management as MCP tools/resources/prompts so
Claude Code agents can operate WhatsApp. A secondary track in `docs/` builds
an executive deck/doc ("Infraestrutura de TI com IA — setup.com.br") for a
company called setup.com.br, describing how this MCP server fits into a
broader AI-agent infrastructure story.

This is a **remote/ephemeral environment** project: it runs inside Claude
Code's cloud container, which is rebuilt from Git on every reboot. See
`docs/RESILIENCIA.md` for exactly what survives a reboot and what doesn't
(secrets, WhatsApp login session, and the SQLite DB do **not** persist).

## Repository layout

```
src/
├── index.ts              # entry point: loads adapter, starts MCP + webhook server
├── server.ts             # createMcpServer/startServer — wires guard, tools, resources, prompts
├── webhook.ts             # Express webhook server (Cloud API inbound messages)
├── config.ts              # env var loading (hand-rolled .env parser, no dotenv dep)
├── guard.ts                # WA_BLOCKED_GROUPS enforcement — wraps the adapter in a Proxy
├── agent-auth.ts            # authorization helpers for the /setup WhatsApp command
├── adapters/
│   ├── base.ts              # abstract WhatsAppAdapter interface — all adapters implement this
│   ├── cloud-api/           # Meta WhatsApp Cloud API (production)
│   ├── http/                # HTTP/mock adapter (dev, used by meta-mock.ts)
│   └── playwright/          # WhatsApp Web via Playwright/Chromium (personal number)
├── tools/                  # MCP tool registrations (messaging, groups, contacts, media, templates)
├── resources/               # MCP resource registrations (conversations, groups, contacts)
├── prompts/                 # MCP prompt registrations (draft_message, summarize_conversation, analyze_group)
├── store/db.ts               # better-sqlite3 schema (WAL mode) — messages/groups/contacts tables
├── types/index.ts             # shared TS types (Message, Chat, Group, Contact, ...)
├── meta-mock.ts               # local mock of Meta Cloud API for dev/testing
└── computer-use/               # separate MCP server: xdotool/scrot-based screen control (Xvfb :99)

scripts/
├── wa-agent.ts     # standalone WhatsApp bot: listens for "/setup <text>" and runs it via Claude API + bash tool
├── wa-connect.ts    # one-time interactive login (scan WhatsApp QR) for the playwright adapter
├── mcp-smoke.mjs      # functional smoke test for the MCP server (npm run mcp:smoke)
└── install-chrome.sh   # installs Chromium for the playwright adapter / computer-use

tests/            # vitest — unit tests for guard, agent-auth, adapters/http, store, tools/messaging
docs/             # executive deck/doc build pipeline for setup.com.br (see below) + operational docs
.claude/
├── settings.json         # enables the whatsapp-business & computer-use MCP servers; SessionStart hook
└── hooks/session-start.sh  # rebuilds the environment on every session start (see below)
.mcp.json          # MCP server definitions (computer-use, whatsapp-business) used in this environment
gen-status.js, status-*.html, status-server.js  # standalone system/status dashboard generator (unrelated to the MCP tool surface)
```

## Adapters — read this before touching `WA_ADAPTER`

`src/config.ts` reads `WA_ADAPTER` and only recognizes **`cloud-api`**,
**`http`** (default), and **`playwright`**. There is **no `baileys` adapter**
in the code, even though `README.md` and some comments still refer to
"baileys" for the personal/dev use case — that adapter was replaced by the
`playwright` adapter (WhatsApp Web driven via headless Chromium). Don't
reintroduce baileys-flavored env vars; treat `README.md`'s baileys mentions
as stale documentation, not a contract.

- **`cloud-api`** — Meta WhatsApp Cloud API, for production. Needs
  `WA_PHONE_NUMBER_ID`, `WA_ACCESS_TOKEN`, `WA_BUSINESS_ACCOUNT_ID`, and the
  webhook secrets. Also starts the Express webhook server (`webhook.ts`) for
  inbound messages.
- **`http`** — thin HTTP client adapter, used against `meta-mock.ts` for local
  dev/testing without hitting Meta's real API. Also starts the webhook server.
- **`playwright`** — drives `web.whatsapp.com` in headless Chromium for a
  personal number. Requires a one-time interactive login
  (`npm run connect` → scan QR), whose session is stored under
  `WA_SESSION_DIR`/`data/wa-session` — **not committed**, lost on reboot.

`src/index.ts` starts the MCP server *before* `adapter.connect()` resolves, so
tools are registered even if WhatsApp login/network isn't ready yet; tools
that need the connection will error until login completes.

## The guard/authorization layer (security-critical — read before editing)

Two independent, defense-in-depth mechanisms gate what agents can do over
WhatsApp. Both are **deny-by-default**. Preserve that property in any change.

1. **`src/guard.ts`** (`guardAdapter`) — wraps *every* `WhatsAppAdapter` in a
   `Proxy` per `WA_BLOCKED_GROUPS` (comma-separated names/JIDs, currently
   `financasfacil`). It blocks send/edit/delete/react/read/manage on those
   chats, filters them out of `list_groups`/`list_conversations`, and drops
   their inbound messages from `onMessage`. Applied centrally in
   `createMcpServer` (`src/server.ts`) and again around the webhook adapter —
   this is the single choke point; don't bypass it by calling an adapter
   directly elsewhere. `src/guard.ts` also has `getBlockedChatIds()` for
   direct-DB reads (e.g. `search_messages`) that don't go through the adapter.
2. **`src/agent-auth.ts`** — authorizes the `/setup` command handled by
   `scripts/wa-agent.ts`, which executes arbitrary shell via the Claude API's
   bash tool. Authorized only if the sender is in a scoped group
   (`WA_AGENT_GROUPS`) or an explicit allowlist (`WA_AGENT_ALLOWED_SENDERS`).
   **If both are empty, nobody is authorized** — this is intentional (never
   open RCE). See `docs/COMANDOS-WHATSAPP.md` for the exact behavior and
   examples.

When modifying either file, keep/extend the existing vitest coverage
(`tests/guard.test.ts`, `tests/agent-auth.test.ts`) — these encode the
security invariants, not just behavior.

## Secrets & sensitive data

This server handles real credentials and real message content — treat both
as sensitive by default:

- **Never** print, log, or commit `WA_ACCESS_TOKEN`, `WA_WEBHOOK_SECRET`,
  `ANTHROPIC_API_KEY`, or anything from `.env`. `.env` is gitignored; keep it
  that way, and don't echo its contents into command output that gets
  captured (e.g. `/setup` replies, status dashboards).
- `data/*.db` contains real WhatsApp message history/contacts once populated
  — it's gitignored and must stay that way. When adding status/reporting
  tooling (`gen-status.js`, `status-server.js` and friends), surface counts/
  metadata only, never raw message text or contact PII.
- The `/setup` bot (`scripts/wa-agent.ts`) echoes command output back into a
  WhatsApp chat — be mindful that `runBash` output (env dumps, file reads)
  could leak secrets into a group chat. Don't widen what it can execute
  without re-checking this.

## Commit discipline

When asked to commit, keep each commit to one logical change (bisectable) —
don't bundle an unrelated fix with a feature, or a doc update with a
behavior change, in the same commit. This matters especially for
`guard.ts`/`agent-auth.ts` changes: a reviewer (or a future `git bisect`)
should be able to isolate a security-relevant change from unrelated cleanup.

## Development workflow

```bash
npm install         # install deps (also run automatically by SessionStart hook, see below)
npm run dev         # tsx src/index.ts — run the MCP server with auto-reload
npm run build       # tsc — compile to dist/
npm run typecheck   # tsc --noEmit
npm test            # vitest run
npm run mcp:smoke   # scripts/mcp-smoke.mjs — functional smoke test against the running MCP server
```

Adapter-specific:
```bash
npm run setup:chrome   # scripts/install-chrome.sh — installs Chromium (playwright adapter / computer-use)
npm run connect        # scripts/wa-connect.ts — one-time interactive WhatsApp QR login (playwright adapter)
npm run personal       # WA_ADAPTER=playwright tsx src/index.ts
npm run agent          # WA_ADAPTER=playwright tsx scripts/wa-agent.ts — the /setup bot
npm run mock           # tsx src/meta-mock.ts — local mock of Meta Cloud API
npm run computer-use   # bash src/computer-use/start.sh
```

Config is `.env` at repo root (see `.env.example`), loaded by a small
hand-rolled parser in `src/config.ts` — no `dotenv` dependency. Existing
`process.env` values always win over `.env` file values.

## Conventions

- **ESM + explicit `.js` extensions** in all relative imports (e.g.
  `import { config } from "./config.js"` inside `src/config.ts`'s own
  siblings), even though the source is `.ts` — required by
  `"module": "ESNext"` / `"moduleResolution": "bundler"` in `tsconfig.json`.
  Match this pattern in new files.
- **`tsconfig.json`** compiles only `src/**/*` (tests and scripts are
  excluded from the build; they run directly via `tsx`/`vitest`).
- Tests use **vitest** (`describe`/`it`/`expect`/`vi`), colocated under
  `tests/` mirroring the `src/` structure (not alongside source files).
- Comments and several docs/messages in this repo are written in
  **Portuguese** (the target users are Brazilian); match that when editing
  those specific files (`guard.ts`, `agent-auth.ts`, `docs/*.md`,
  WhatsApp-facing strings in `scripts/wa-agent.ts`). Code identifiers stay in
  English.
- Adapters are added by implementing the abstract `WhatsAppAdapter` class in
  `src/adapters/base.ts` and wiring the new case into `src/index.ts`'s
  adapter switch and `src/config.ts`'s `adapter` union type.
- Tools/resources/prompts are registered through `registerAllTools` /
  `registerAllResources` / `registerAllPrompts` (see `src/tools/index.ts`,
  `src/resources/index.ts`, `src/prompts/index.ts`) — add new ones there
  rather than registering directly in `server.ts`.

## Remote environment specifics

This project expects to run inside Claude Code's ephemeral web container.
`.claude/hooks/session-start.sh` runs on every `SessionStart` (only when
`CLAUDE_CODE_REMOTE=true`) and: runs `npm install`, installs the Python deps
in `requirements.txt` (needed for `docs/build_*.py`), creates `data/`, and
best-effort installs Playwright's Chromium. It's a no-op locally. If you
change dependency setup, this hook is the place to update, and it must live
on the repo's default branch to take effect for future sessions (see
`docs/RESILIENCIA.md`).

Not persisted across reboots (gitignored, in `data/`): the SQLite DB
(`whatsapp.db`), the Playwright WhatsApp session (`wa-session/`), and `.env`
secrets — these must come from the environment's configured secrets/network
policy or be redone interactively (QR login).

`.mcp.json` defines two MCP servers active in this environment:
`whatsapp-business` (this repo's own server, via `tsx src/index.ts`, playwright
adapter) and `computer-use` (`src/computer-use/server.ts`, an xdotool/scrot
based screen-control server against Xvfb display `:99`). Both are enabled via
`enabledMcpjsonServers` in `.claude/settings.json`.

## The `docs/` executive-deck pipeline

`docs/build_docx.py`, `build_pptx.py`, `build_pdf.py`, `build_charts.py`,
`render_pptx.py` are standalone Python scripts (deps in `requirements.txt`:
`python-docx`, `python-pptx`, `matplotlib`, `Pillow`) that generate the
setup.com.br executive document/deck/PDF checked into `docs/` from
`docs/infraestrutura-ia-setup.md` and `docs/assets/`. These are unrelated to
the MCP server's runtime — treat them as a separate, self-contained doc-build
tool. Regenerate with `python3 docs/build_pdf.py` etc. after editing the
source markdown or assets.

## Status dashboard scripts

`gen-status.js`, `status-server.js`, `status*.html` at the repo root generate
a system/environment status page (memory, disk, git log, DB row counts,
network reachability checks). These are operational tooling, independent of
the MCP tool surface in `src/` — don't confuse them with the WhatsApp
tools/resources.
