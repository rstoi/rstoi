# setupOS Cloud — console único (web app)

Interface web única que reúne **Painel**, **Terminal**, **Claude CLI** e os
**principais serviços** (WhatsApp, Workspace, GitHub, sistemas internos) atrás de
**login Google restrito ao domínio `setup.com.br`**.

Esta é a implementação de referência descrita em
`docs/infraestrutura-google-cloud-setup.md` (§8).

## Estrutura

```
console/
├── web/        # Frontend Next.js (PWA) — deploy em Firebase Hosting
│   └── src/
│       ├── app/            # App Router (layout, página, estilos)
│       ├── components/     # Console, Sidebar, Tabs, painéis
│       └── lib/            # Firebase Auth (restrição de domínio) + cliente do gateway
└── gateway/    # Backend Cloud Run — WebSocket pty + verificação de token
    └── src/    # index (HTTP/WS), auth (verifica ID token + domínio + RBAC), pty
```

## Princípios de segurança

1. **Login só `@setup.com.br`** — `hd=setup.com.br` no cliente (conveniência) e
   **verificação obrigatória no backend** do `email_verified` e do domínio.
2. **IAP** na frente do Cloud Run (grupo do Cloud Identity).
3. **RBAC por grupo** — Terminal, Claude CLI e Governança só para grupos
   autorizados (espelha `WA_AGENT_GROUPS` do projeto). Deny por padrão.
4. Toda ação destrutiva passa pela **fila de aprovação** (human-in-the-loop).

## Rodar localmente

```bash
# Gateway (WebSocket + pty)
cd console/gateway && npm install && npm run dev      # :8080

# Frontend
cd console/web && npm install && npm run dev          # :3000
```

Configure `console/web/.env.local` e `console/gateway/.env` a partir dos
`.env.example`. Sem credenciais Firebase válidas o login fica desabilitado e o
console abre em modo de demonstração somente-leitura.

## Deploy

- **web/** → Firebase Hosting (`firebase deploy`).
- **gateway/** → Cloud Run (`gcloud run deploy`, usar o `Dockerfile`), atrás de IAP.
