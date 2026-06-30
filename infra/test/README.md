# Testes da plataforma (sem GCP)

Bateria que valida localmente o **coração da plataforma** — os caminhos de acesso
e o Claude operando dentro deles — sem precisar provisionar nada na GCP. Cada
suíte sobe os mesmos componentes que o `startup.sh` instala em produção e checa
o comportamento real.

## Suítes

| Suíte | Arquivo | O que prova |
|---|---|---|
| Acesso | `access-stack.sh` | display virtual :99, screenshot, sessão `tmux claude` (CLI), ttyd (terminal web), noVNC (desktop web), code-server (editor), Chromium renderizando no desktop |
| Computer-use | `run-computer-use.sh` + `computer-use-smoke.mjs` | handshake MCP, tools (`screenshot`, `get_screen_size`, `type`, `mouse_move`, `left_click`), screenshot PNG real, xdotool funcionando |
| Controle/Wake | `control-smoke.mjs` | landing, `/status`, `/wake` (máquina de estados TERMINATED→STARTING), idempotência, `/manifest` (PWA), redirect quando RUNNING |
| Porkbun DNS | `porkbun-smoke.mjs` | `porkbun-dns.sh` cria os A records corretos (app/claude→IP) via API, idempotente |

## Rodar

```bash
# tudo de uma vez (ambiente normal — Mac/VM com systemd/shell padrão)
make -C infra test        # ou: bash infra/test/run-all.sh

# ou suíte a suíte
bash infra/test/access-stack.sh
bash infra/test/run-computer-use.sh
node infra/test/control-smoke.mjs
node infra/test/porkbun-smoke.mjs
```

Resultado esperado (verificado): **Acesso 8/8 · Computer-use 10/10 · Controle 9/9
· Porkbun 5/5**, mais o CLI subindo na sessão tmux e `claude mcp list` enxergando
o MCP `desktop`.

## Pré-requisitos

Os mesmos binários do `startup.sh`: `Xvfb fluxbox x11vnc novnc websockify scrot
xdotool ttyd code-server`, `node>=20`, Chromium (Playwright) e `npm install` na
raiz e em `infra/control`.

## Nota sobre sandboxes restritos

Em ambientes que reapeiam agressivamente a árvore de processos ao fim de cada
comando (alguns CI/sandboxes), o runner agregado pode ser morto ao derrubar os
daemons. Nesse caso rode as suítes **individualmente** — cada uma faz seu próprio
teardown e reporta PASS/FAIL de forma isolada.
