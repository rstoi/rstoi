# WhatsApp Business MCP Server

MCP server that integrates WhatsApp Business with Claude Code agents. Agents can send, read, edit, delete messages, manage groups, handle media, and more.

## Quick Start

### 1. Install
```bash
npm install
npm run build
```

### 2. Configure
```bash
cp .env.example .env
# Edit .env — set WA_ADAPTER=baileys (personal) or cloud-api (production)
```

### 3. Add to Claude Code
Add to your `~/.claude/claude_desktop_config.json` or project `.mcp.json`:

```json
{
  "mcpServers": {
    "whatsapp": {
      "command": "node",
      "args": ["/absolute/path/to/whatsapp-mcp/dist/index.js"],
      "env": {
        "WA_ADAPTER": "baileys",
        "WA_SESSION_PATH": "/absolute/path/to/whatsapp-mcp/data/session",
        "SQLITE_DB_PATH": "/absolute/path/to/whatsapp-mcp/data/whatsapp.db"
      }
    }
  }
}
```

### 4. Run (first time — scan QR)
```bash
npm run dev
# Scan the QR code with WhatsApp > Linked Devices > Link a device
```

## Adapters

| Adapter | Use case | Setup |
|---|---|---|
| **baileys** | Personal number, dev/testing, full group management | Scan QR code once |
| **cloud-api** | Production, Meta Business API | Meta app credentials |

## Tools Available to Agents

### Messaging (11 tools)
- `send_message` — text, media, location to any contact or group
- `reply_message` — quoted reply to a specific message
- `edit_message` — edit a sent message
- `delete_message` — delete for everyone or just for me
- `react_to_message` — emoji reaction
- `forward_message` — forward to another chat
- `mark_as_read` — send read receipt
- `get_messages` — paginated history with time filters
- `get_message` — fetch single message by ID
- `search_messages` — full-text search (SQLite FTS5)
- `list_conversations` — all active chats

### Groups (10 tools)
- `list_groups`, `get_group`, `create_group`, `update_group`
- `add_group_member`, `remove_group_member`
- `promote_group_member`, `demote_group_member`
- `leave_group`, `get_group_invite_link`

### Contacts (4 tools)
- `list_contacts`, `get_contact`, `block_contact`, `unblock_contact`

### Media & Profile (4 tools)
- `send_media` — file path or URL
- `download_media` — save to disk
- `get_profile`, `update_profile`

### Templates — Cloud API only (2 tools)
- `list_templates`, `send_template`

## MCP Resources
```
whatsapp://conversations         → all active chats
whatsapp://conversation/{chatId} → messages in a chat
whatsapp://groups                → all groups
whatsapp://group/{groupId}       → group details + members
whatsapp://contacts              → contact list
whatsapp://contact/{contactId}   → contact details
```

## MCP Prompts
- `draft_message` — helps draft a WhatsApp message with chosen tone
- `summarize_conversation` — summarizes a conversation
- `analyze_group` — analyzes group activity

## Cloud API Webhook Setup

When using `WA_ADAPTER=cloud-api`, start the webhook server on port 3000 (configurable via `WEBHOOK_PORT`). Point your Meta App webhook to:
```
https://your-server/webhook
```
Set `WA_WEBHOOK_VERIFY_TOKEN` and `WA_WEBHOOK_SECRET` to match your Meta app settings.

## Architecture

```
src/
├── index.ts             # entry point
├── server.ts            # MCP server + tool/resource/prompt registration
├── webhook.ts           # Express webhook server (Cloud API)
├── config.ts            # env var loading
├── adapters/
│   ├── base.ts          # abstract WhatsAppAdapter interface
│   ├── cloud-api/       # Meta Cloud API v21
│   └── baileys/         # WhatsApp Web via Baileys
├── tools/               # 27 MCP tools
├── resources/           # 6 MCP resources
├── prompts/             # 3 MCP prompts
└── store/
    └── db.ts            # SQLite schema + WAL mode
```

## Development
```bash
npm run dev       # run with tsx (auto-reload)
npm test          # vitest
npm run typecheck # tsc --noEmit
npm run build     # compile to dist/
```

---

## Assistente de Infraestrutura de TI (baita)

Painel web para o time da **baita** monitorar a saúde da própria rede
doméstica (home office), com foco em qualidade de **videoconferência**:
latência, jitter, perda de pacotes, DNS, velocidade de download/upload e
sinal de Wi-Fi — com detecção automática de falhas, alertas e um guia de
solução de problemas. Login via **Google restrito ao domínio `@baita.ac`**.

```bash
cp .env.example .env
# defina GOOGLE_CLIENT_ID, SESSION_SECRET, IT_ASSISTANT_ADMINS (ver .env.example)
npm run it-assistant          # sobe o painel em http://localhost:4200
```

Cada pessoa do time gera um token de dispositivo no painel e roda o agente de
monitoramento no próprio computador (via cron/launchd/Agendador de Tarefas):

```bash
IT_ASSISTANT_SERVER_URL=https://it.baita.ac IT_ASSISTANT_DEVICE_TOKEN=ita_xxx \
  npm run it-assistant:agent
```

Detalhes de arquitetura, limiares de qualidade e instalação do agente por
sistema operacional: `src/it-assistant/agent/README.md` e a página **Guia de
solução de problemas** dentro do próprio painel (`/guia`).

```
src/it-assistant/
├── server.ts            # painel web (Express) + páginas protegidas por sessão
├── auth.ts               # login Google (restrito a @baita.ac) + tokens de dispositivo
├── db.ts                  # SQLite: users, devices, reports, alerts
├── thresholds.ts           # classificação OK/Atenção/Crítico p/ videoconferência
├── routes/                  # /auth, /api (devices, report, status, history, alerts)
└── agent/                    # script que roda no PC de cada pessoa (ping/DNS/speedtest/Wi-Fi)
public/it-assistant/       # dashboard, login e guia (HTML/CSS/JS estáticos)
```
