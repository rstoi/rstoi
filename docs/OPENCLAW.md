# OpenClaw — instalação, configuração e teste

[OpenClaw](https://github.com/openclaw/openclaw) (de Peter Steinberger,
[@steipete](https://github.com/steipete)) é um agente de IA autônomo que
conversa por canais de mensagem (WhatsApp, Telegram, Discord, etc.) através de
um **Gateway** local. Docs oficiais: <https://docs.openclaw.ai>.

> Não confundir com o servidor MCP de WhatsApp deste repositório: o OpenClaw é
> um produto separado, instalado globalmente via `npm`. Este documento registra
> como ele foi instalado/configurado/testado neste ambiente.

## Requisitos

- **Node 24** (recomendado) ou **Node ≥ 22.19**
- `npm` (ou `pnpm`)

## Setup rápido (reproduzível)

```bash
bash scripts/openclaw-setup.sh
```

O script é idempotente: instala, cria a config base, aplica ajustes
não-interativos, sobe o Gateway em foreground e roda `status` + `health` +
`doctor`.

## Passo a passo manual

### 1. Instalar

```bash
npm install -g openclaw@latest
openclaw --version            # ex.: OpenClaw 2026.6.10
```

### 2. Configuração base

```bash
openclaw setup                # cria ~/.openclaw/openclaw.json, workspace e sessões
```

Ajustes não-interativos aplicados aqui:

```bash
# Memory search usa OpenAI por padrão — desligar se não houver OPENAI_API_KEY
openclaw config set agents.defaults.memorySearch.enabled false

# Auth do Gateway por token (recomendado, inclusive em loopback)
openclaw config set gateway.auth.mode token
openclaw config set gateway.auth.token "$(openssl rand -hex 24)"

openclaw config validate      # => Config valid
```

### 3. Subir o Gateway e testar

Em container **não há systemd user service**, então rode o Gateway em
foreground (em vez de `openclaw onboard --install-daemon`):

```bash
openclaw gateway run --force --port 18789 &
TOKEN=$(openclaw config get gateway.auth.token | tail -1)

openclaw status --token "$TOKEN"   # Gateway reachable · auth token
openclaw health --token "$TOKEN"   # event loop ok, agents: main
openclaw doctor                    # Plugins Loaded: 36 · Errors: 0
```

## O que falta para uso real (requer credenciais)

O ambiente de teste **não possui** chaves de LLM nem credenciais de canal, então
o agente foi validado até o limite de autenticação do modelo. Para uso real:

1. **Modelo / LLM** — `openclaw configure --section model`, ou exporte
   `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` (o modelo padrão é `openai/gpt-5.5`).
2. **Canal de mensagem** — `openclaw channels add` (WhatsApp/Telegram/Discord).
3. **Owner (comandos privilegiados)** —
   `openclaw config set commands.ownerAllowFrom '["telegram:SEU_ID"]'`.
4. **Rodar um turno** —
   `openclaw agent --message "checklist" --token "$TOKEN"`.

## Resultado do teste neste ambiente

| Item | Resultado |
|---|---|
| Instalação (`npm -g`) | ✔ OpenClaw 2026.6.10 |
| `openclaw setup` / `config validate` | ✔ Config valid |
| Gateway (`gateway run`) | ✔ ready, reachable, auth token |
| `openclaw health` | ✔ event loop ok |
| Plugins | ✔ 36 carregados, 0 erros |
| Inferência ao vivo | ✖ sem chave de LLM disponível no sandbox |
| Canais de mensagem | ✖ sem credenciais no sandbox |

## Integração com WhatsApp

O WhatsApp **não vem embutido** — é um plugin separado, e o canal usa
**WhatsApp Web (pareamento por QR)**. Funciona com o seu próprio número
(recomenda-se um aparelho/eSIM separado).

### 1. Instalar o plugin

```bash
# ClawHub (preferido) — requer acesso a clawhub.ai
openclaw plugins install clawhub:@openclaw/whatsapp
# Alternativa por npm (usada neste ambiente, pois clawhub.ai estava bloqueado):
openclaw plugins install @openclaw/whatsapp
```

Reinicie o Gateway para carregar o plugin:
`openclaw gateway run --force --port 18789`

### 2. Configurar e habilitar o canal

```bash
openclaw channels add --channel whatsapp --name "WhatsApp pessoal"
openclaw channels list --all | grep -i whatsapp
# => WhatsApp default: installed, configured, enabled, not linked
```

### 3. Parear (QR)

```bash
openclaw channels login --channel whatsapp
# Mostra um QR no terminal. No celular:
# WhatsApp > Aparelhos conectados > Conectar um aparelho > escanear o QR
```

Após o scan, o estado vira `linked` e o canal conecta. Verifique:
`openclaw channels status --probe`.

> **Importante — só QR.** Esta versão do plugin (`@openclaw/whatsapp`
> 2026.6.10) implementa **apenas pareamento por QR**; não há fluxo de
> *pairing code* por número (`requestPairingCode` não é usado no plugin).
>
> **Não funciona em ambiente efêmero.** O QR expira em ~20s e o vínculo
> exige um Gateway de vida longa. Em containers recicláveis (como o
> "Claude Code on the web"), o pareamento se perde a cada restart — faça
> isto em um **host permanente** (servidor/VM dedicada com o Gateway
> rodando como serviço).

### Estado neste ambiente

| Passo | Resultado |
|---|---|
| Plugin `@openclaw/whatsapp` (npm) | ✔ instalado, enabled (0 erros) |
| `channels add --channel whatsapp` | ✔ configured, enabled |
| `channels login` (QR) | ✔ gera QR ao vivo (refresh ~20s) |
| Pareamento concluído (`linked`) | ✖ requer scan em host permanente |

## Comandos úteis

```bash
openclaw status            # visão geral (Gateway, canais, modelo, sessões)
openclaw doctor --fix      # diagnostica e repara problemas comuns
openclaw logs --follow     # tail dos logs do Gateway
openclaw configure         # configuração interativa (modelos, canais, plugins)
openclaw channels status   # estado de login dos canais
openclaw uninstall         # remove serviço + dados locais (CLI permanece)
```
