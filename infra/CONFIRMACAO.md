# Goal de confirmação — rodar no Claude CLI da workstation

Cole o conteúdo abaixo após `/goal ` numa sessão do **Claude Code CLI rodando na
própria Claude Workstation** (via terminal/ttyd ou code-server). O Claude vai
verificar cada caminho de acesso, usar o MCP `desktop`/browser para se provar, e
**corrigir erros até tudo passar**. O hook de `/goal` só libera quando a condição
for atendida.

> Pré-condição: você já fez login em `https://claude.<seu-host>` (IAP, `@baita.ac`)
> e a estação está RUNNING. Rode o goal de dentro dela.

---

## Goal (versão completa — recomendada)

```
/goal Confirme o funcionamento completo da Claude Workstation e corrija o que falhar, repetindo até tudo passar. Criterios de aceite, todos verdes: (1) CLI: `claude --version` responde e `claude mcp list` mostra o servidor `desktop` CARREGADO, sem o aviso de "reserved MCP server name"; se aparecer, corrija o nome em .mcp.json e reconfirme. (2) Computer-use/visao: via MCP desktop, chame get_screen_size (deve bater com a resolucao do Xvfb), tire um screenshot e confirme que e um PNG valido nao-vazio; depois open_application ou run_command para abrir o Chromium numa pagina de teste, tire outro screenshot e confirme visualmente que a pagina renderizou. (3) Maos: use type e mouse_move/left_click do MCP desktop sem erro. (4) Servicos de acesso locais: as portas 8080 (code-server), 7681 (ttyd) e 6080 (noVNC) respondem HTTP 200/302 em 127.0.0.1, e a sessao tmux `claude` existe e persiste. (5) Bateria: rode `make -C infra test` (ou as suites em infra/test/ individualmente) e obtenha Acesso 8/8, Computer-use 10/10, Controle 9/9, Porkbun 5/5. (6) Wake/controle: `curl -s localhost:8080/healthz` (code-server) responde 200; e a logica de /status e /wake do servico de controle passa no `node infra/test/control-smoke.mjs`. Para CADA falha: diagnostique, aplique a correcao no codigo/config, e re-execute o teste correspondente ate passar. Ao final, escreva um relatorio com a matriz de resultados e os bugs corrigidos. Nao pare enquanto houver qualquer item vermelho.
```

## Goal (versão curta — smoke rápido)

```
/goal Prove que a Claude Workstation funciona: `claude mcp list` deve mostrar `desktop` carregado (sem aviso de nome reservado); via MCP desktop tire um screenshot (PNG valido) e use type/mouse sem erro; confirme que as portas 8080/7681/6080 respondem em localhost e que a sessao tmux `claude` existe; rode `make -C infra test` e obtenha tudo verde. Corrija qualquer falha e repita ate passar; entao reporte a matriz de resultados.
```

---

## Dica: confirmar o acesso "de fora" (multi-device)

O goal acima roda **dentro** da estação. Para confirmar a experiência de app web
+ login Google, faça manualmente (humano):

1. No celular/notebook, abra `https://claude.<seu-host>` → deve exigir login
   Google e **recusar contas fora de `@baita.ac`**.
2. Botão **Acordar** (se a VM estava dormindo) → redireciona ao editor.
3. Abra `…/proxy/6080/vnc.html` → deve mostrar o desktop ao vivo; peça ao Claude
   (no terminal) para abrir algo e veja aparecer no noVNC.
