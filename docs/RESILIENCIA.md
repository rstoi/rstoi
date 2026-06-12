# Resiliência após reboot — Claude Code na web

O container do Claude Code na web é **efêmero e isolado**: a cada reboot (ou
reciclagem por inatividade) o repositório é **clonado do zero** e tudo que não
está no Git é perdido. Este documento descreve como o ambiente se reconstitui
sozinho e o que depende de configuração externa.

## Reconstituição automática (SessionStart hook)

A cada início de sessão, o hook `\.claude/hooks/session-start.sh` (registrado em
`\.claude/settings.json`) roda automaticamente e restaura:

| Item | Como | Origem |
|---|---|---|
| Dependências Node (`node_modules`) | `npm install` | `package.json` (versionado) |
| Dependências Python (geração de docs) | `pip install -r requirements.txt` | `requirements.txt` (versionado) |
| Diretório `data/` (sessões/SQLite) | `mkdir -p data` | criado vazio |
| Chromium (WhatsApp/computer-use) | imagem base `/opt/pw-browsers` ou `playwright install` | best-effort |

O hook é **idempotente**, **não-interativo** e roda **apenas no ambiente remoto**
(`CLAUDE_CODE_REMOTE=true`). Para valer em todas as sessões futuras, ele precisa
estar no **branch default** do repositório.

## O que sobrevive ao reboot (está no Git)

- **Configuração dos agentes/MCP**: `.mcp.json` (servidores `computer-use` e
  `whatsapp-business`).
- **Hook e settings**: `.claude/hooks/session-start.sh`, `.claude/settings.json`.
- **Manifestos**: `package.json`, `package-lock.json`, `requirements.txt`,
  `tsconfig.json`, `vitest.config.ts`.
- **Código**: `src/`, `scripts/`, `tests/`.
- **Documentos e scripts geradores**: `docs/` (incluindo `build_*.py`,
  `render_pptx.py` e o logo/diagramas em `docs/assets/`).

## O que NÃO está no Git — precisa de configuração externa

Estes itens são (corretamente) ignorados via `.gitignore` e **não** devem ser
commitados. Devem ser providos pela plataforma ou refeitos:

| Item | Onde configurar / como restaurar |
|---|---|
| **Segredos** (`.env`: tokens Meta, API keys, etc.) | Variáveis de ambiente do **environment** do Claude Code na web (não no repo). Use `.env.example` como referência. |
| **Política de rede (egress)** | Configuração do environment. Hoje libera essencialmente `github.com` + registries (npm/PyPI). Para acessar outros hosts (ex.: `setup.com.br`), inclua-os na allowlist. |
| **Login do WhatsApp** (`data/wa-session`, QR) | Re-autenticação interativa: `npm run connect` e escanear o QR (WhatsApp → Aparelhos conectados). Auth interativa não é persistível com segurança no repo. |
| **Banco SQLite** (`data/*.db`) | Recriado pelos agentes na primeira execução. Histórico não persiste entre reboots a menos que armazenado externamente. |

## Verificação rápida pós-reboot

```bash
# o hook já deve ter rodado; para conferir manualmente:
CLAUDE_CODE_REMOTE=true .claude/hooks/session-start.sh
npm run typecheck      # checagem de tipos
npm test               # suíte de testes
python3 docs/build_pdf.py   # regenera um documento (valida deps Python)
```

## Resumo

- **Configuração e código** → resilientes (Git + hook).
- **Segredos e política de rede** → no environment da plataforma.
- **Logins interativos (WhatsApp)** → re-autenticar após reboot.
