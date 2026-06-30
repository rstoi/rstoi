# Plataforma Claude Code remota na Google Cloud

Estação de trabalho persistente que **"é" o seu Claude Code**, na GCP, operável
de qualquer device (celular, tablet, notebook, navegador) como um **app web** com
**login Google restrito ao domínio `baita.ac`**. Browser headless pleno,
computer-use, frota de MCPs, sessão que nunca cai, e custo controlado por
**auto-stop / auto-start**.

> Implementação executável: ver `infra/` (Terraform + scripts). Este documento é
> o desenho e as decisões.

---

## 1. Conceito

Uma VM persistente roda o Claude Code dentro de um `tmux` que **nunca encerra**.
Você fecha o notebook, abre o celular e cai na **mesma sessão viva**. A VM tem um
**desktop virtual** (Xvfb) com Chromium real — então o Claude navega, clica,
preenche formulários e dirige aplicativos GUI via computer-use, e você pode
**assistir ao vivo** pelo noVNC no navegador.

A interface chega como app web por três portas, todas atrás do mesmo login:

- **Editor + terminal** (code-server / VS Code no navegador)
- **Terminal puro** (ttyd → `tmux claude`)
- **Browser ao vivo** (noVNC)

---

## 2. Arquitetura

```
┌───────────── devices (qualquer um) ─────────────┐
│ celular · tablet · notebook · iPad · navegador  │
└───────────────────────┬─────────────────────────┘
                        │ HTTPS
            ┌────────────▼─────────────┐
            │  Load Balancer + IAP     │  consent Internal + domain:baita.ac
            └─────┬───────────────┬────┘
   claude.baita.ac│               │app.baita.ac
        ┌─────────▼────────┐  ┌───▼──────────────────────────────────┐
        │ Cloud Run control│  │ VM "claude-workstation" (GCE)        │
        │ sempre on        │  │  code-server :8080 (editor+terminal) │
        │ status + acordar │  │  ├─ proxy → ttyd :7681 (terminal)    │
        └────────┬─────────┘  │  ├─ proxy → noVNC :6080 (ver browser)│
                 │ start VM   │  ├─ Xvfb :99 + fluxbox + Chromium    │
                 └───────────▶│  ├─ computer-use / github / whatsapp │
                              │  ├─ tmux "claude" (sessão sempre viva)│
                              │  └─ auto-stop por ociosidade          │
                              └───────────────────────────────────────┘
        Secret Manager · Cloud NAT (saída) · Snapshots · Cloud Logging
```

---

## 3. Camadas

### 3.1 Computação — o "corpo"
- **Compute Engine** `e2-standard-4` (4 vCPU / 16 GB), disco SSD persistente.
- **Display virtual** `Xvfb :99` + `fluxbox`, como serviços systemd permanentes
  (o `DISPLAY=:99` é o mesmo que o `computer-use` deste repo já assume).
- **Browser pleno**: Chromium + Playwright rodando dentro do Xvfb — JS, login,
  downloads, PDF. "Headless" para você, "headful" para o Claude.
- **Sessão persistente**: Claude Code em `tmux claude` via systemd; sobrevive a
  desconexões e reinícios (startup script religa tudo no boot).

### 3.2 Acesso — "diversos devices"
| Interface | Para quê | Tecnologia |
|---|---|---|
| Editor + terminal | trabalho de verdade | code-server (VS Code web) |
| Terminal puro | celular/tablet | ttyd → tmux |
| Browser ao vivo | ver o computer-use | noVNC |
| SSH admin | manutenção | IAP TCP tunneling |

code-server tem proxy interno (`/proxy/<porta>/`), então **um único backend**
(porta 8080) já entrega editor, terminal e noVNC depois do IAP. PWA: dá pra
"instalar" na tela inicial e parecer app nativo.

### 3.3 Autenticação — restrita a `baita.ac`
Como `baita.ac` é Google Workspace e o projeto está na organização:
- **OAuth consent screen = Internal** → contas externas nem veem o login.
- **IAP** na frente de tudo + IAM `domain:baita.ac` com papel
  `roles/iap.httpsResourceAccessor` → **qualquer `@baita.ac` entra, ninguém de
  fora**. Gestão de acesso = Admin do Workspace (adicionou no Workspace, tem
  acesso; removeu, perdeu — sem tocar na GCP).
- Zero código de autenticação no app; o IAP injeta a identidade já verificada.

### 3.4 Rede e segredos
- **Sem IP público de entrada** na VM. Saída (apt, npm, GitHub, API Anthropic)
  via **Cloud NAT**. Entrada só pelo LB (pós-IAP) e SSH via IAP tunneling.
- **Secret Manager** para chave da Anthropic, senha do code-server, tokens.
- **Service accounts de privilégio mínimo**: a VM só pode parar a si mesma; o
  serviço de controle só pode ligar a VM.

### 3.5 Custo — auto-stop / auto-start
- **Auto-stop**: timer systemd checa conexões ativas a cada 5 min; sem ninguém
  por `idle_shutdown_minutes` (padrão 30) → a VM se desliga.
- **Auto-start**: `claude.baita.ac` (Cloud Run, sempre disponível, escala a zero)
  mostra o estado e tem o botão **Acordar**, que liga a VM e redireciona quando
  ela fica `RUNNING` (~20–40 s).
- Disco e sessão **persistem** entre stop/start. Estimativa: **~US$ 20–40/mês**.

### 3.6 Resiliência
- Startup script **idempotente** religa Xvfb, MCPs e a sessão a cada boot.
- **Snapshots** agendados do disco para recuperação.
- Artefatos (relatórios, screenshots, PDFs) podem ir para um bucket GCS,
  acessíveis por link de qualquer device.

---

## 4. Capacidades plenas

- **Browser headless pleno** (Playwright/Chromium): navegação, scraping, logins,
  automação de forms, downloads, PDF.
- **Computer-use**: o MCP deste repo (screenshot, mouse, teclado, janelas, shell)
  promovido a serviço permanente → controle total do desktop virtual, não só web.
- **Loop agêntico de browser/desktop** ("open computer-use" e afins): encaixa
  como **mais um MCP** no mesmo `DISPLAY=:99` e Chromium — é plug-in.
- **Frota de MCPs**: github, gmail, calendar, drive, whatsapp — sempre montados,
  dando "mãos" ao Claude a partir de qualquer device.
- **Jobs longos**: builds, crawls e refactors de horas rodam no `tmux` enquanto
  você desconecta.

---

## 5. Fluxo de uso

1. Abrir **https://claude.baita.ac** no celular → login `@baita.ac`.
2. Se a VM estiver dormindo, **Acordar** → redireciona em segundos.
3. Cair no editor + terminal com a **sessão do Claude já viva**.
4. Pedir uma tarefa de browser/computer-use → abrir o **noVNC** e assistir.
5. Fechar tudo. Após 30 min ocioso, a VM **se desliga sozinha**.

---

## 6. Variações futuras (fáceis)
- **Uma estação por pessoa** (sessões isoladas por usuário `@baita.ac`).
- **GPU** para cargas de visão/modelos locais.
- **Múltiplas regiões** / réplica de disco.
- **Cloud Logging/auditoria** do que os agentes executaram.
